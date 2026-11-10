import { randomUUID } from "node:crypto";
import {
  basisSchema,
  reviewSchema,
  recheckSchema,
  validateReview,
  type Review,
  type Round,
} from "../../../../packages/shared/src/domain.js";
import { AppError } from "../errors.js";
import type { Job, Session, Store } from "../reviews/store.js";
import type { ModelProvider, Usage } from "./provider.js";

export async function runAgent(
  job: Job,
  session: Session,
  store: Store,
  provider: ModelProvider,
) {
  const key = job.key!;
  const model = job.model!;
  const signal = job.controller.signal;
  const data = job.input;
  const onUsage = (usage: Usage) => {
    job.metrics!.modelCalls += usage.calls;
    job.metrics!.inputTokens += usage.inputTokens;
    job.metrics!.outputTokens += usage.outputTokens;
  };
  const cached = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    job.stage = name;
    if (job.cache.has(name)) return job.cache.get(name) as T;
    const result = await run();
    if (signal.aborted) throw new AppError("CANCELLED", "任务已取消", 409);
    job.cache.set(name, result);
    return result;
  };
  if (job.type === "extract") {
    const basis = await cached("提取研究问题、核心观点与论据", () =>
      provider.generate(
        key,
        model,
        "extract",
        data,
        basisSchema,
        signal,
        onUsage,
      ),
    );
    const ids = new Set(data.paragraphs.map((p) => p.id));
    if (basis.arguments.some((a) => a.paragraphIds.some((id) => !ids.has(id))))
      throw new AppError(
        "MODEL_ANCHOR",
        "提取结果的论据段落无效，请重试",
        502,
        true,
      );
    return basis;
  }
  let review: Review;
  let results: Round["results"] = {};
  if (job.type === "recheck") {
    const previous = session.rounds.at(-1)!;
    const checked = await cached("对照上一轮逐条复核", () =>
      provider.generate(
        key,
        model,
        "recheck",
        { previous, current: data },
        recheckSchema,
        signal,
        onUsage,
      ),
    );
    if (
      Object.keys(checked.results).length !== previous.issues.length ||
      previous.issues.some((i) => !checked.results[i.id])
    ) {
      throw new AppError(
        "MODEL_RESULTS",
        "复查结果未覆盖上一轮全部问题，请重试",
        502,
        true,
      );
    }
    const additions = validateReview(checked.additions, data.paragraphs, [
      ...previous.issues.map((i) => i.id),
      ...data.materials.map((m) => m.id),
    ]);
    review = {
      issues: [...previous.issues, ...additions.issues],
      materials: [...data.materials, ...additions.materials],
    };
    results = checked.results;
  } else {
    const candidates = await cached("逻辑与表达审查", () =>
      provider.generate(
        key,
        model,
        "review",
        data,
        reviewSchema,
        signal,
        onUsage,
      ),
    );
    const verified = await cached("回读原文并核对判断依据", () =>
      provider.generate(
        key,
        model,
        "verify",
        { input: data, candidates },
        reviewSchema,
        signal,
        onUsage,
      ),
    );
    review = validateReview(verified, data.paragraphs);
  }
  job.stage = "校验原文引用与记录版本";
  assertCurrent(job, session, store);
  const round: Round = {
    ...review,
    roundId: randomUUID(),
    no: session.rounds.length + 1,
    paragraphs: structuredClone(data.paragraphs),
    confirmed: structuredClone(data.confirmed!),
    title: data.title || "未命名论文片段",
    question: data.question,
    outline: data.outline,
    refs: data.refs,
    feedback: structuredClone(data.feedback),
    results,
    model,
    promptVersion: "1.0",
    schemaVersion: "1.0",
    createdAt: store.now(),
  };
  session.rounds.push(round);
  session.workspace.materials = structuredClone(review.materials);
  session.workspace.revision++;
  return round;
}

export function assertCurrent(job: Job, session: Session, store: Store) {
  if (job.controller.signal.aborted || job.status === "cancelled")
    throw new AppError("CANCELLED", "任务已取消", 409);
  if (
    job.workspaceId !== session.workspace.workspaceId ||
    job.revision !== session.workspace.revision ||
    job.baseRound !== session.rounds.at(-1)?.roundId
  ) {
    throw new AppError(
      "STALE_INPUT",
      "论文或审查依据已更新，请基于最新版本重新提交",
      409,
      true,
    );
  }
  if (
    job.type !== "parse" &&
    (job.generation !== session.generation ||
      !session.credentials ||
      session.credentials.expiresAt <= store.now())
  ) {
    throw new AppError("KEY_EXPIRED", "模型配置已失效，请重新配置", 401);
  }
}

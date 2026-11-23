import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  workspaceInputSchema,
  modelSchema,
  KEY_TTL,
  FILE_LIMIT,
  validateText,
  isDirty,
  reportFor,
  type Workspace,
  type JobView,
} from "../../../packages/shared/src/domain.js";
import { AppError } from "./errors.js";
import { Store, publicJob, type Session, type Job } from "./reviews/store.js";
import { DeepSeekProvider, type ModelProvider } from "./agent/provider.js";
import { runAgent, assertCurrent } from "./agent/workflow.js";
import { parseFile, validateUpload } from "./files/parse.js";
import { demoRound, demoWorkspace } from "./reviews/demo.js";

export function buildApp(
  options: {
    provider?: ModelProvider;
    store?: Store;
    staticRoot?: string;
    limits?: boolean;
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024 });
  const store = options.store || new Store();
  const provider = options.provider || new DeepSeekProvider();
  const sessionFor = (headers: Record<string, unknown>) =>
    store.get(
      typeof headers["x-session-id"] === "string"
        ? headers["x-session-id"]
        : "",
    );
  app.register(multipart, {
    limits: { fileSize: FILE_LIMIT, files: 1, fields: 0, parts: 1 },
  });
  app.register(rateLimit, {
    max: options.limits === false ? 100000 : 180,
    timeWindow: "1 minute",
  });
  const timer = setInterval(() => store.sweep(), 1000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const session of [...store.sessions.values()]) store.remove(session);
  });
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    if (request.headers.origin) {
      const allowed =
        process.env.PUBLIC_ORIGIN || `http://${request.headers.host}`;
      if (request.headers.origin !== allowed)
        throw new AppError("ORIGIN", "请求来源不匹配", 403);
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        code: "VALIDATION",
        message: "输入格式或长度不符合要求",
        retryable: false,
      });
    if (error instanceof AppError)
      return reply.code(error.status).send({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    const frameworkError = error as { code?: string; statusCode?: number };
    if (frameworkError.code === "FST_REQ_FILE_TOO_LARGE")
      return reply.code(413).send({
        code: "FILE_SIZE",
        message: "文件超过 20 MB",
        retryable: false,
      });
    if (frameworkError.statusCode && frameworkError.statusCode < 500)
      return reply.code(frameworkError.statusCode).send({
        code: "REQUEST",
        message:
          frameworkError.statusCode === 429
            ? "请求过于频繁，请稍后再试"
            : "请求格式错误",
        retryable: frameworkError.statusCode === 429,
      });
    return reply.code(500).send({
      code: "INTERNAL",
      message: "服务处理异常，请重试",
      retryable: true,
    });
  });
  app.get("/api/health", async () => ({ ok: true }));
  app.post(
    "/api/sessions",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async () => ({ sessionId: store.create().id }),
  );
  app.delete("/api/sessions/current", async (request) => {
    store.remove(sessionFor(request.headers));
    return { ok: true };
  });
  app.get("/api/credentials/status", async (request) =>
    store.status(sessionFor(request.headers)),
  );
  app.post("/api/credentials/reveal", async (request) => {
    const credential = sessionFor(request.headers).credentials;
    if (!credential) throw new AppError("KEY_EXPIRED", "请先配置模型", 401);
    return { key: credential.key };
  });
  app.delete("/api/credentials", async (request) => {
    store.clearCredentials(sessionFor(request.headers));
    return { ok: true };
  });
  app.post(
    "/api/credentials/test",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (request) => {
      const session = sessionFor(request.headers);
      const body = z
        .object({
          key: z.string().trim().min(8).max(512).optional(),
          model: modelSchema,
        })
        .parse(request.body);
      const key = body.key || session.credentials?.key;
      if (!key) throw new AppError("KEY_REQUIRED", "请输入 API Key");
      store.clearCredentials(session);
      const generation = session.generation;
      const controller = new AbortController();
      session.testing = controller;
      session.activeAt = store.now();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        await provider.test(key, body.model, controller.signal);
        if (
          controller.signal.aborted ||
          generation !== session.generation ||
          !store.sessions.has(session.id)
        )
          throw new AppError("CONFIG_CHANGED", "配置已更新，请重新测试", 409);
        session.credentials = {
          key,
          model: body.model,
          expiresAt: store.now() + KEY_TTL,
        };
        return store.status(session);
      } finally {
        clearTimeout(timeout);
        if (session.testing === controller) session.testing = undefined;
      }
    },
  );
  app.get("/api/workspace", async (request) => {
    const session = sessionFor(request.headers);
    return { workspace: session.workspace, rounds: session.rounds };
  });
  app.put("/api/workspace", async (request) => {
    const session = sessionFor(request.headers);
    const body = workspaceInputSchema
      .extend({ workspaceId: z.string() })
      .parse(request.body);
    if (body.workspaceId !== session.workspace.workspaceId)
      throw new AppError("WORKSPACE_CHANGED", "工作区已切换，请重新载入", 409);
    if (body.revision !== session.workspace.revision)
      throw new AppError("REVISION", "工作区已更新，请重新加载", 409);
    if (
      new Set(body.paragraphs.map((p) => p.id)).size !== body.paragraphs.length
    )
      throw new AppError("PARAGRAPHS", "段落 ID 重复");
    const previous = session.rounds.at(-1);
    if (previous) {
      const expected = previous.materials.map((m) => ({ ...m, done: false }));
      const actual = body.materials.map((m) => ({ ...m, done: false }));
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        throw new AppError("MATERIALS", "材料只能更新完成状态");
      if (
        body.paragraphs.map((p) => p.id).join() !==
        previous.paragraphs.map((p) => p.id).join()
      )
        throw new AppError("PARAGRAPHS", "请通过新建审查重新导入正文");
      if (
        Object.keys(body.feedback).some(
          (id) => !previous.issues.some((i) => i.id === id),
        )
      )
        throw new AppError("FEEDBACK", "反馈关联的问题不存在");
    } else if (body.materials.length || Object.keys(body.feedback).length)
      throw new AppError("WORKSPACE", "请先完成初审");
    session.workspace = {
      ...body,
      workspaceId: session.workspace.workspaceId,
      revision: body.revision + 1,
    };
    session.activeAt = store.now();
    return session.workspace;
  });
  app.delete("/api/workspace", async (request) => {
    const session = sessionFor(request.headers);
    store.reset(session);
    return session.workspace;
  });
  app.post("/api/demo", async (request) => {
    const session = sessionFor(request.headers);
    store.reset(session);
    session.workspace = demoWorkspace(session.workspace);
    session.rounds = [demoRound(session.workspace, store.now())];
    return { workspace: session.workspace, rounds: session.rounds };
  });
  app.post("/api/demo/rechecks", async (request) => {
    const session = sessionFor(request.headers);
    const body = z
      .object({ workspaceId: z.string(), revision: z.number().int() })
      .parse(request.body);
    if (
      body.workspaceId !== session.workspace.workspaceId ||
      body.revision !== session.workspace.revision
    )
      throw new AppError("REVISION", "工作区已更新，请重新加载", 409);
    const previous = session.rounds.at(-1);
    if (previous?.source !== "demo")
      throw new AppError("DEMO_REQUIRED", "请先进入示例演示", 409);
    if (session.rounds.length >= 30)
      throw new AppError("WORKSPACE_LIMIT", "请导出报告后新建审查", 429);
    if (!isDirty(session.workspace, previous))
      throw new AppError("NO_CHANGES", "请先修改示例正文、材料或反馈");
    try {
      validateText(session.workspace.paragraphs);
    } catch (error) {
      throw new AppError("TEXT_LENGTH", (error as Error).message);
    }
    session.rounds.push(demoRound(session.workspace, store.now(), previous));
    session.workspace.revision++;
    session.activeAt = store.now();
    return { workspace: session.workspace, rounds: session.rounds };
  });

  async function execute(
    job: Job,
    session: Session,
    operation: () => Promise<JobView["result"]>,
  ) {
    const startedAt = Date.now();
    job.status = "running";
    const timeout = setTimeout(
      () => {
        job.error = {
          code: "TIMEOUT",
          message: "任务超时，请重试或更换模型",
          retryable: true,
        };
        job.status = "failed";
        job.controller.abort();
      },
      job.model === "deepseek-reasoner" ? 8 * 60000 : 4 * 60000,
    );
    try {
      const result = await operation();
      assertCurrent(job, session, store);
      job.result = result;
      job.status = "succeeded";
      job.stage = "处理完成";
    } catch (error) {
      if (job.stage === "已取消" || job.error?.code === "TIMEOUT") return;
      job.status = "failed";
      job.error =
        error instanceof AppError
          ? {
              code: error.code,
              message: error.message,
              retryable: error.retryable,
            }
          : {
              code: "RESULT_INVALID",
              message:
                error instanceof Error &&
                /模型|引用|材料|问题|段落/.test(error.message)
                  ? error.message
                  : "处理结果校验失败，请重试",
              retryable: true,
            };
    } finally {
      clearTimeout(timeout);
      job.key = undefined;
      job.completedAt = store.now();
      job.metrics!.durationMs = Date.now() - startedAt;
    }
  }

  function createJob(
    session: Session,
    type: Job["type"],
    idempotencyKey: unknown,
    retryId?: string,
  ) {
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 100
    )
      throw new AppError("IDEMPOTENCY", "任务需要有效的幂等键");
    const signature = JSON.stringify([
      type,
      session.workspace.workspaceId,
      session.workspace.revision,
      session.generation,
      retryId,
    ]);
    const existing = session.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.signature !== signature)
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "该任务键对应的输入已变化",
          409,
        );
      return { job: session.jobs.get(existing.jobId)!, created: false };
    }
    if (session.jobs.size >= 100 || session.rounds.length >= 30)
      throw new AppError(
        "WORKSPACE_LIMIT",
        "当前会话操作已达上限，请复制报告后新建审查",
        429,
      );
    if (
      [...session.jobs.values()].some(
        (j) => j.status === "running" || j.status === "queued",
      )
    )
      throw new AppError("BUSY", "当前任务正在处理，请等待或取消", 409);
    const credential = session.credentials;
    if (
      type !== "parse" &&
      (!credential || credential.expiresAt <= store.now())
    )
      throw new AppError("KEY_REQUIRED", "请先配置模型并测试连接", 401);
    const job: Job = {
      metrics: {
        modelCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
      },
      id: randomUUID(),
      type,
      status: "queued",
      stage: type === "parse" ? "解析文件" : "准备输入",
      controller: new AbortController(),
      workspaceId: session.workspace.workspaceId,
      revision: session.workspace.revision,
      baseRound: session.rounds.at(-1)?.roundId,
      generation: session.generation,
      key: credential?.key,
      model: credential?.model,
      input: structuredClone(session.workspace),
      cache: new Map(),
    };
    if (retryId) {
      const previous = session.jobs.get(retryId);
      if (
        !previous ||
        previous.status !== "failed" ||
        !previous.error?.retryable ||
        previous.type !== type ||
        previous.revision !== job.revision ||
        previous.workspaceId !== job.workspaceId ||
        previous.baseRound !== job.baseRound ||
        previous.model !== job.model
      ) {
        throw new AppError("RETRY_INPUT", "原任务输入已变化，请重新提交", 409);
      }
      if (
        previous.error?.code !== "RESULT_INVALID" &&
        previous.error?.code !== "MODEL_ANCHOR"
      )
        job.cache = new Map(previous.cache);
    }
    session.jobs.set(job.id, job);
    session.idempotency.set(idempotencyKey, { signature, jobId: job.id });
    session.activeAt = store.now();
    return { job, created: true };
  }

  for (const [route, type] of [
    ["extractions", "extract"],
    ["reviews", "review"],
    ["rechecks", "recheck"],
  ] as const) {
    app.post(`/api/${route}`, async (request) => {
      const session = sessionFor(request.headers);
      if (session.rounds.at(-1)?.source === "demo")
        throw new AppError(
          "DEMO_ACTIVE",
          "当前为预设示例，请新建审查后使用真实模型",
          409,
        );
      const body = z
        .object({
          retryJobId: z.string().optional(),
          revision: z.number().int().nonnegative().optional(),
          workspaceId: z.string().optional(),
        })
        .parse(request.body || {});
      if (
        body.workspaceId &&
        body.workspaceId !== session.workspace.workspaceId
      )
        throw new AppError(
          "WORKSPACE_CHANGED",
          "工作区已切换，请重新提交",
          409,
        );
      const token = request.headers["idempotency-key"];
      const existing =
        typeof token === "string" ? session.idempotency.get(token) : undefined;
      if (existing) {
        const job = session.jobs.get(existing.jobId)!;
        const signature = JSON.stringify([
          type,
          session.workspace.workspaceId,
          body.revision ?? job.input.revision,
          session.generation,
          body.retryJobId,
        ]);
        if (signature !== existing.signature)
          throw new AppError(
            "IDEMPOTENCY_CONFLICT",
            "该任务键对应的输入已变化",
            409,
          );
        return publicJob(job);
      }
      if (
        body.revision !== undefined &&
        body.revision !== session.workspace.revision
      )
        throw new AppError("REVISION", "工作区已更新，请重新提交", 409);
      try {
        validateText(session.workspace.paragraphs);
      } catch (error) {
        throw new AppError("TEXT_LENGTH", (error as Error).message);
      }
      if (type === "extract" && session.rounds.length)
        throw new AppError("NEW_REQUIRED", "请新建审查后重新提取");
      if (type === "review" && session.rounds.length)
        throw new AppError(
          "RECHECK_REQUIRED",
          "已有初审结果，请使用修改后复查",
        );
      if (type !== "extract") {
        const basis = session.workspace.confirmed;
        if (!basis?.question.trim() || !basis.claims.some((c) => c.trim()))
          throw new AppError(
            "BASIS_REQUIRED",
            "请确认研究问题及至少一项核心观点",
          );
      }
      if (
        type === "recheck" &&
        (!session.rounds.length ||
          !isDirty(session.workspace, session.rounds.at(-1)!))
      )
        throw new AppError("NO_CHANGES", "请修改原文、审查依据或材料后复查");
      const { job, created } = createJob(
        session,
        type,
        request.headers["idempotency-key"],
        body.retryJobId,
      );
      if (created)
        void execute(job, session, async () => {
          const result = await runAgent(job, session, store, provider);
          // 审查已原子发布新轮次，更新校验基线以供统一完成处理。
          if (type !== "extract") {
            job.revision = session.workspace.revision;
            job.baseRound = session.rounds.at(-1)?.roundId;
          }
          return result;
        });
      return publicJob(job);
    });
  }
  app.post("/api/files/parse", async (request) => {
    const session = sessionFor(request.headers);
    const file = await request.file();
    if (!file) throw new AppError("FILE_REQUIRED", "请选择文件");
    const bytes = await file.toBuffer();
    validateUpload(file.filename, bytes);
    const { job, created } = createJob(
      session,
      "parse",
      request.headers["idempotency-key"],
    );
    if (created)
      void execute(job, session, () =>
        parseFile(file.filename, bytes, job.controller.signal),
      );
    return publicJob(job);
  });
  app.get<{ Params: { jobId: string } }>(
    "/api/jobs/:jobId",
    async (request) => {
      const job = sessionFor(request.headers).jobs.get(request.params.jobId);
      if (!job) throw new AppError("NOT_FOUND", "任务不存在", 404);
      return publicJob(job);
    },
  );
  app.delete<{ Params: { jobId: string } }>(
    "/api/jobs/:jobId",
    async (request) => {
      const job = sessionFor(request.headers).jobs.get(request.params.jobId);
      if (!job) throw new AppError("NOT_FOUND", "任务不存在", 404);
      store.cancel(job);
      return publicJob(job);
    },
  );
  app.get<{ Params: { roundId: string } }>(
    "/api/rounds/:roundId",
    async (request) => {
      const round = sessionFor(request.headers).rounds.find(
        (r) => r.roundId === request.params.roundId,
      );
      if (!round) throw new AppError("NOT_FOUND", "轮次不存在", 404);
      return round;
    },
  );
  app.get<{ Params: { roundId: string } }>(
    "/api/rounds/:roundId/report",
    async (request) => {
      const session = sessionFor(request.headers);
      const round = session.rounds.find(
        (r) => r.roundId === request.params.roundId,
      );
      if (!round) throw new AppError("NOT_FOUND", "轮次不存在", 404);
      return {
        text: reportFor(
          round,
          round === session.rounds.at(-1) ? session.workspace : undefined,
        ),
      };
    },
  );
  app.get("/api/detections/status", async (request) => {
    sessionFor(request.headers);
    return {
      duplication: "pending",
      ai: "pending",
      message: "检测服务待接入，供应商确定后开放实际检测。",
    };
  });
  const root = options.staticRoot || resolve("dist/client");
  if (existsSync(root)) {
    app.register(fastifyStatic, { root });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith("/api/")
        ? reply.code(404).send({ code: "NOT_FOUND", message: "接口不存在" })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}

import { z } from "zod";

export const MODELS = ["deepseek-chat", "deepseek-reasoner"] as const;
export const KEY_TTL = 2 * 60 * 60 * 1000;
export const FILE_LIMIT = 20 * 1024 * 1024;
export const modelSchema = z.enum(MODELS);
export const paragraphSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().max(6000),
});
export const basisSchema = z.object({
  question: z.string().max(2000),
  claims: z.array(z.string().max(2000)).max(12),
  arguments: z
    .array(
      z.object({
        text: z.string().max(2000),
        paragraphIds: z.array(z.string()).max(50),
        pending: z.string().max(1000).optional(),
      }),
    )
    .max(30),
});
export const issueTypes = [
  "概念混用",
  "论据与结论脱节",
  "前后矛盾",
  "分析层次混淆",
  "歧义",
  "指代不清",
  "长句结构",
  "法律术语",
] as const;
export const statuses = [
  "文本内可确认",
  "论证待补充",
  "学术争议",
  "外部材料待核验",
] as const;
export const resultStates = ["已解决", "仍需补充", "需重新判断"] as const;
export const anchorSchema = z.object({
  paragraphId: z.string(),
  quote: z.string().min(1).max(5000),
  before: z.string().max(100).optional(),
  after: z.string().max(100).optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
});
export const issueSchema = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
  kind: z.enum(["logic", "expression"]),
  type: z.enum(issueTypes),
  status: z.enum(statuses),
  priority: z.enum(["高", "中", "低"]),
  title: z.string().min(1).max(500),
  anchors: z.array(anchorSchema).min(1).max(10),
  explanation: z.string().min(1).max(3000),
  basis: z.string().max(3000),
  suggestion: z.string().min(1).max(3000),
  reference: z.string().max(5000).optional(),
  legalCheck: z.string().max(2000).optional(),
  materialIds: z.array(z.string()).max(20),
});
export const materialSchema = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
  text: z.string().min(1).max(2000),
  issueIds: z.array(z.string()).min(1).max(30),
  external: z.boolean(),
  done: z.boolean().default(false),
});
export const reviewSchema = z.object({
  issues: z.array(issueSchema).max(40),
  materials: z.array(materialSchema).max(60),
});
export const resultSchema = z.object({
  state: z.enum(resultStates),
  reason: z.string().min(1).max(3000),
});
export const recheckSchema = z.object({
  results: z.record(resultSchema),
  additions: reviewSchema,
});
export const feedbackSchema = z.object({
  value: z.enum(["有帮助", "判断不成立", "暂不处理"]),
  reason: z.string().max(2000),
});
export const workspaceInputSchema = z.object({
  revision: z.number().int().nonnegative(),
  title: z.string().max(300),
  paragraphs: z.array(paragraphSchema).max(200),
  question: z.string().max(2000),
  outline: z.string().max(6000),
  refs: z.string().max(12000),
  confirmed: basisSchema.nullable(),
  materials: z.array(materialSchema).max(100),
  feedback: z.record(feedbackSchema),
});

export type Paragraph = z.infer<typeof paragraphSchema>;
export type Basis = z.infer<typeof basisSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type Material = z.infer<typeof materialSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Recheck = z.infer<typeof recheckSchema>;
export type Results = Recheck["results"];
export type Model = z.infer<typeof modelSchema>;
export type WorkspaceInput = z.infer<typeof workspaceInputSchema>;
export type Workspace = WorkspaceInput & { workspaceId: string };
export type Round = Review & {
  source?: "demo" | "model";
  roundId: string;
  no: number;
  paragraphs: Paragraph[];
  confirmed: Basis;
  title: string;
  question: string;
  outline: string;
  refs: string;
  feedback: Workspace["feedback"];
  results: Results;
  model: Model;
  promptVersion: string;
  schemaVersion: string;
  createdAt: number;
};
export type JobView = {
  metrics?: {
    modelCalls: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
  id: string;
  type: "extract" | "review" | "recheck" | "parse";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: string;
  result?: Basis | Round | { text: string; filename: string };
  error?: { code: string; message: string; retryable: boolean };
};
export type CredentialStatus = {
  status: "unconfigured" | "ok";
  model: Model;
  masked: string;
  expiresAt?: number;
};

export function countText(text: string) {
  return text.replace(/\s/g, "").length;
}

export function paragraphsFrom(text: string): Paragraph[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ id: `p${index + 1}`, text: line }));
}

export function blankWorkspace(id: string): Workspace {
  return {
    workspaceId: id,
    revision: 0,
    title: "",
    paragraphs: [],
    question: "",
    outline: "",
    refs: "",
    confirmed: null,
    materials: [],
    feedback: {},
  };
}

export function validateText(paragraphs: Paragraph[]) {
  const count = countText(paragraphs.map((p) => p.text).join(""));
  if (count < 1500 || count > 5000)
    throw new Error("请提交 1500—5000 字的论文片段");
}

export function resolveAnchor(
  anchor: Issue["anchors"][number],
  paragraphs: Paragraph[],
) {
  const paragraph = paragraphs.find((p) => p.id === anchor.paragraphId);
  if (!paragraph) throw new Error("模型引用了不存在的段落");
  const positions: number[] = [];
  let position = paragraph.text.indexOf(anchor.quote);
  while (position >= 0) {
    const before = paragraph.text.slice(0, position);
    const after = paragraph.text.slice(position + anchor.quote.length);
    if (
      (!anchor.before || before.endsWith(anchor.before)) &&
      (!anchor.after || after.startsWith(anchor.after))
    )
      positions.push(position);
    position = paragraph.text.indexOf(anchor.quote, position + 1);
  }
  if (positions.length === 0) throw new Error("模型原文引用与输入不匹配");
  return {
    ...anchor,
    start: positions.length === 1 ? positions[0] : undefined,
    end:
      positions.length === 1 ? positions[0] + anchor.quote.length : undefined,
  };
}

export function anchorMatches(
  anchor: Issue["anchors"][number],
  paragraphs: Paragraph[],
) {
  return (
    anchor.start !== undefined &&
    anchor.end !== undefined &&
    paragraphs
      .find((p) => p.id === anchor.paragraphId)
      ?.text.slice(anchor.start, anchor.end) === anchor.quote
  );
}

export function validateReview(
  review: Review,
  paragraphs: Paragraph[],
  reservedIds: string[] = [],
): Review {
  const ids = [
    ...review.issues.map((i) => i.id),
    ...review.materials.map((m) => m.id),
  ];
  if (
    new Set([...reservedIds, ...ids]).size !==
    reservedIds.length + ids.length
  )
    throw new Error("模型返回重复的问题或材料 ID");
  const issueIds = new Set(review.issues.map((i) => i.id));
  const materialIds = new Set(review.materials.map((m) => m.id));
  for (const material of review.materials) {
    if (material.issueIds.some((id) => !issueIds.has(id)))
      throw new Error("材料关联了不存在的问题");
    if (
      material.issueIds.some(
        (id) =>
          !review.issues
            .find((issue) => issue.id === id)
            ?.materialIds.includes(material.id),
      )
    )
      throw new Error("问题与材料关联不一致");
  }
  const seen = new Set<string>();
  const issues = review.issues.map((issue) => {
    if (issue.materialIds.some((id) => !materialIds.has(id)))
      throw new Error("问题关联了不存在的材料");
    if (
      issue.materialIds.some(
        (id) =>
          !review.materials
            .find((material) => material.id === id)
            ?.issueIds.includes(issue.id),
      )
    )
      throw new Error("问题与材料关联不一致");
    if (
      issue.kind === "logic" &&
      !issueTypes.slice(0, 4).includes(issue.type as (typeof issueTypes)[0])
    )
      throw new Error("论证问题类型无效");
    const anchors = issue.anchors.map((anchor) =>
      resolveAnchor(anchor, paragraphs),
    );
    const signature = JSON.stringify([
      issue.type,
      anchors.map((a) => [a.paragraphId, a.quote]),
    ]);
    if (seen.has(signature)) throw new Error("模型返回重复问题，请合并");
    seen.add(signature);
    const legalTerms = /应当|可以|原则上|责任|义务|权利|主体|条件/;
    const legalCheck =
      issue.legalCheck ||
      (issue.reference !== undefined &&
      legalTerms.test(anchors[0].quote + issue.reference)
        ? "参考表述涉及法律措辞，请核对主体、条件及责任范围是否符合原意。"
        : undefined);
    return { ...issue, anchors, legalCheck };
  });
  return { issues, materials: review.materials };
}

export function isDirty(workspace: Workspace, round: Round) {
  return (
    JSON.stringify([
      workspace.paragraphs,
      workspace.confirmed,
      workspace.materials,
      workspace.question,
      workspace.outline,
      workspace.refs,
      workspace.feedback,
    ]) !==
    JSON.stringify([
      round.paragraphs,
      round.confirmed,
      round.materials,
      round.question,
      round.outline,
      round.refs,
      round.feedback,
    ])
  );
}

export function reportFor(round: Round, current?: Workspace) {
  const lines = [
    "法学论文审查报告",
    "",
    round.title,
    round.source === "demo"
      ? `第 ${round.no} 轮 · 预设示例演示（固定审查内容与规则复查）`
      : `第 ${round.no} 轮 · 模型 ${round.model}`,
    `生成时间：${new Date(round.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`,
    `审查范围：第 1—${round.paragraphs.length} 段，共 ${countText(round.paragraphs.map((p) => p.text).join(""))} 字`,
    `研究问题：${round.confirmed.question}`,
    "核心观点",
    ...round.confirmed.claims.map((c) => `- ${c}`),
    "",
    "主要论据与待补信息",
    ...round.confirmed.arguments.map((argument) => {
      const positions = argument.paragraphIds.map(
        (id) => round.paragraphs.findIndex((p) => p.id === id) + 1,
      );
      return `- ${argument.text}（第 ${positions.join("、")} 段）${argument.pending ? ` · 待补充：${argument.pending}` : ""}`;
    }),
    ...(round.outline ? ["", "论文提纲", round.outline] : []),
    ...(round.refs ? ["", "作者提供的引用材料", round.refs] : []),
    "",
    "主要问题与表达修改",
  ];
  for (const issue of round.issues) {
    lines.push(
      `【${issue.priority}优先级】${issue.type} · ${issue.status}`,
      issue.title,
      ...issue.anchors.map(
        (a) =>
          `原文（第 ${round.paragraphs.findIndex((p) => p.id === a.paragraphId) + 1} 段）：“${a.quote}”`,
      ),
      issue.explanation,
      `依据：${issue.basis}`,
      `修改方向：${issue.suggestion}`,
    );
    if (issue.reference !== undefined)
      lines.push(`参考表述：${issue.reference || "删除该表述"}`);
    if (issue.legalCheck) lines.push(`需核对法律含义：${issue.legalCheck}`);
    const result = round.results[issue.id];
    if (result) lines.push(`复查结果：${result.state} · ${result.reason}`);
    const feedback = round.feedback[issue.id];
    if (feedback) lines.push(`作者反馈：${feedback.value} ${feedback.reason}`);
    lines.push("");
  }
  lines.push(
    "待补材料",
    ...round.materials.map(
      (m) =>
        `[${m.done ? "x" : " "}] ${m.text}${m.external ? "（需外部核验）" : ""}`,
    ),
  );
  if (current) {
    lines.push(
      "",
      isDirty(current, round)
        ? "当前工作副本附录（尚待复查）"
        : "当前工作副本附录（与本轮一致）",
      isDirty(current, round)
        ? "正文、审查依据、背景、材料或反馈已修改，报告主体对应上一已审查版本。"
        : "正文与审查依据对应本轮已审查版本。",
      `当前研究问题：${current.confirmed?.question || "待确认"}`,
      ...(current.confirmed?.claims || []).map((claim) => `- ${claim}`),
      ...(current.outline ? ["当前提纲", current.outline] : []),
      ...(current.refs ? ["当前引用材料", current.refs] : []),
      ...current.materials.map((m) => `[${m.done ? "x" : " "}] ${m.text}`),
      ...Object.entries(current.feedback).map(
        ([id, f]) => `${id} · ${f.value} ${f.reason}`,
      ),
      "",
      "当前工作副本文本",
      ...current.paragraphs.map(
        (p, index) => `第 ${index + 1} 段\n${p.text}\n`,
      ),
    );
  }
  lines.push(
    "",
    "本轮审查文本",
    ...round.paragraphs.map((p, index) => `第 ${index + 1} 段\n${p.text}\n`),
    "",
    "学术争议及外部材料待核验事项由作者核对。本报告仅依据所列输入范围。",
  );
  return lines.join("\n");
}

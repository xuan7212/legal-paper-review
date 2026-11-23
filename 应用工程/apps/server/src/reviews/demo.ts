import { randomUUID } from "node:crypto";
import {
  paragraphsFrom,
  validateReview,
  type Basis,
  type Review,
  type Round,
  type Workspace,
} from "../../../../packages/shared/src/domain.js";
import { example } from "../../../../packages/shared/src/example.js";

const basis: Basis = {
  question: "单独同意规则在算法推荐场景中应如何认定并适用？",
  claims: [
    "单独同意应体现同意对象的特定性与同意行为的独立性。",
    "单独同意的适用范围需要结合处理目的与服务场景展开论证。",
  ],
  arguments: [
    {
      text: "文中援引的个人信息保护法条文",
      paragraphIds: ["p2"],
      pending: "核对条文原文及适用条件",
    },
    {
      text: "作者声称检索到的三份判决",
      paragraphIds: ["p4"],
      pending: "补充案号、检索范围与筛选方法",
    },
  ],
};

const review: Review = {
  issues: [
    {
      id: "L1",
      kind: "logic",
      type: "论据与结论脱节",
      status: "论证待补充",
      priority: "高",
      title: "三份判决难以支撑普遍性结论",
      anchors: [
        {
          paragraphId: "p4",
          quote: "我国司法实践普遍忽视了单独同意规则的独立价值",
        },
      ],
      explanation:
        "正文由三份判决的观察直接推导出整个司法实践的普遍情况，结论超出了已交代的样本范围。",
      basis:
        "第 4 段仅说明检索到三份判决，尚缺少检索条件、样本代表性与裁判要旨。",
      suggestion:
        "先将结论限定在所检索样本内，再补充案号、检索范围与筛选依据。",
      reference: "就本文检索的判决而言，相关裁判对单独同意规则的关注仍有不足",
      materialIds: ["M1"],
    },
    {
      id: "L2",
      kind: "logic",
      type: "前后矛盾",
      status: "文本内可确认",
      priority: "高",
      title: "唯一合法性基础与后文例外存在冲突",
      anchors: [
        {
          paragraphId: "p3",
          quote: "单独同意应当作为平台处理敏感个人信息的唯一合法性基础",
        },
        {
          paragraphId: "p6",
          quote:
            "平台可以无需取得单独同意，直接依据履行合同所必需处理用户的行踪轨迹信息",
        },
      ],
      explanation:
        "第 3 段采用“唯一”的绝对表述，第 6 段又提出其他处理依据，尚未解释两项判断的适用边界。",
      basis:
        "两处文字均讨论敏感个人信息处理，当前正文没有交代足以区分二者的前提。",
      suggestion:
        "明确各段讨论的场景、前提及例外关系，并结合原始法条论证适用边界。",
      legalCheck: "例外是否成立需要核对法条体系及具体事实。",
      materialIds: ["M2"],
    },
    {
      id: "L3",
      kind: "logic",
      type: "概念混用",
      status: "论证待补充",
      priority: "中",
      title: "定义与注册勾选的认定标准需要衔接",
      anchors: [
        {
          paragraphId: "p2",
          quote: "这一界定强调同意对象的特定性与同意行为的独立性，二者缺一不可",
        },
        {
          paragraphId: "p5",
          quote: "用户在注册时勾选隐私政策即可构成单独同意",
        },
      ],
      explanation:
        "前文提出两项认定标准，后文主要以加粗标注和注册勾选说明满足标准，尚未交代同意行为如何独立。",
      basis: "第 2 段的概念定义与第 5 段的适用分析之间缺少对应论证。",
      suggestion:
        "分别解释该交互如何满足对象特定与行为独立，或调整结论的适用条件。",
      materialIds: ["M3"],
    },
    {
      id: "L4",
      kind: "logic",
      type: "分析层次混淆",
      status: "论证待补充",
      priority: "中",
      title: "制度建议向现行法结论的转换缺少依据",
      anchors: [
        {
          paragraphId: "p7",
          quote: "我国可以构建以风险等级为基础的分层同意机制",
        },
        { paragraphId: "p7", quote: "现行法已经确立了分层同意制度" },
      ],
      explanation:
        "本段先提出借鉴比较法的制度建议，随后直接得出现行法已经确立该制度的判断。",
      basis:
        "制度建议与现行规范解释分别需要论证，本段尚缺少支持后者的具体规范。",
      suggestion: "说明该段属于现行法解释还是制度完善建议，并补足相应依据。",
      materialIds: ["M4"],
    },
    {
      id: "E1",
      kind: "expression",
      type: "指代不清",
      status: "文本内可确认",
      priority: "低",
      title: "告知义务的主体不明确",
      anchors: [
        {
          paragraphId: "p5",
          quote: "平台与第三方共享数据时，其应当承担相应的告知义务",
        },
      ],
      explanation: "“其”可能指平台或第三方，义务承担主体存在歧义。",
      basis: "同一句中出现两个可能的先行词。",
      suggestion: "结合论证对象明确义务主体，再核对义务范围。",
      reference: "平台与第三方共享数据时，平台应当承担相应的告知义务",
      legalCheck: "此参考句假定作者讨论平台的义务，请核对主体与告知范围。",
      materialIds: [],
    },
  ],
  materials: [
    {
      id: "M1",
      text: "补充三份判决的案号、检索范围与样本选择依据",
      issueIds: ["L1"],
      external: true,
      done: false,
    },
    {
      id: "M2",
      text: "核对敏感个人信息处理依据及例外适用的原始规范",
      issueIds: ["L2"],
      external: true,
      done: false,
    },
    {
      id: "M3",
      text: "补充注册勾选如何满足两项认定标准的论证",
      issueIds: ["L3"],
      external: false,
      done: false,
    },
    {
      id: "M4",
      text: "补充现行法制度判断的条文依据，或调整为制度建议",
      issueIds: ["L4"],
      external: true,
      done: false,
    },
  ],
};

export function demoWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    title: example.title,
    paragraphs: paragraphsFrom(example.text),
    outline: example.outline,
    confirmed: structuredClone(basis),
    materials: structuredClone(review.materials),
  };
}

/** 固定教学样本只展示预设问题和替换规则，来源随每轮快照保存。 */
export function demoRound(
  workspace: Workspace,
  now: number,
  previous?: Round,
): Round {
  const checked =
    previous || validateReview(structuredClone(review), workspace.paragraphs);
  const results: Round["results"] = {};
  for (const issue of previous?.issues || []) {
    const unchanged = issue.anchors.every((a) =>
      workspace.paragraphs
        .find((p) => p.id === a.paragraphId)
        ?.text.includes(a.quote),
    );
    const adopted =
      issue.reference !== undefined &&
      !unchanged &&
      workspace.paragraphs
        .find((p) => p.id === issue.anchors[0].paragraphId)
        ?.text.includes(issue.reference);
    results[issue.id] = adopted
      ? {
          state: "已解决",
          reason:
            "示例规则识别到预设参考句已替换原句，实际论证效果仍需作者评估。",
        }
      : {
          state: unchanged ? "仍需补充" : "需重新判断",
          reason: unchanged
            ? "示例原句仍在正文中，可继续修改后体验复查。材料勾选与作者反馈单独记录。"
            : "正文发生了自定义修改，请切换真实模型审查以评估修改效果。",
        };
  }
  return {
    issues: structuredClone(checked.issues),
    materials: structuredClone(workspace.materials),
    source: "demo",
    roundId: randomUUID(),
    no: (previous?.no || 0) + 1,
    title: workspace.title,
    paragraphs: structuredClone(workspace.paragraphs),
    confirmed: structuredClone(workspace.confirmed!),
    question: workspace.question,
    outline: workspace.outline,
    refs: workspace.refs,
    feedback: structuredClone(workspace.feedback),
    results,
    model: "deepseek-chat",
    promptVersion: "demo-1.0",
    schemaVersion: "1.0",
    createdAt: now,
  };
}

import type { ZodTypeAny, infer as Infer } from "zod";
import type { ModelProvider } from "../../apps/server/src/agent/provider";
import type { Model, Workspace, Round } from "../../packages/shared/src/domain";
import { AppError } from "../../apps/server/src/errors";

/** 仅由测试入口注入，正式服务使用 DeepSeekProvider。 */
export class FakeProvider implements ModelProvider {
  calls: string[] = [];
  failAt = "";
  gate?: Promise<void>;
  async test(key: string, _model: Model, _signal: AbortSignal) {
    this.calls.push("test");
    if (this.gate) await this.gate;
    if (key.includes("invalid"))
      throw new AppError("KEY_INVALID", "密钥无效", 401);
  }
  async generate<T extends ZodTypeAny>(
    _key: string,
    _model: Model,
    stage: string,
    data: unknown,
    schema: T,
    _signal: AbortSignal,
  ): Promise<Infer<T>> {
    this.calls.push(stage);
    if (this.gate) await this.gate;
    if (stage === this.failAt) {
      this.failAt = "";
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "测试中的临时服务故障",
        503,
        true,
      );
    }
    if (stage === "extract")
      return schema.parse({
        question: "单独同意规则在算法推荐场景中应如何认定并适用？",
        claims: ["应结合敏感个人信息处理场景确定单独同意的适用范围。"],
        arguments: [
          {
            text: "个人信息保护法第二十九条",
            paragraphIds: [(data as Workspace).paragraphs[1].id],
            pending: "请补充条文出处",
          },
        ],
      });
    if (stage === "recheck") {
      const input = data as { previous: Round; current: Workspace };
      return schema.parse({
        results: Object.fromEntries(
          input.previous.issues.map((issue) => [
            issue.id,
            {
              state: input.current.paragraphs.some((p) =>
                p.text.includes(issue.anchors[0].quote),
              )
                ? "仍需补充"
                : "已解决",
              reason: "测试替身依据固定样本返回复查结果。",
            },
          ]),
        ),
        additions: { issues: [], materials: [] },
      });
    }
    const workspace = (
      stage === "verify" ? (data as { input: Workspace }).input : data
    ) as Workspace;
    return schema.parse({
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
              paragraphId: workspace.paragraphs[3].id,
              quote: "我国司法实践普遍忽视了单独同意规则的独立价值",
            },
          ],
          explanation: "样本范围与结论范围不匹配。",
          basis: "作者仅提供三份判决。",
          suggestion: "补充样本选择依据或收窄结论。",
          reference:
            "就本文检索的判决而言，相关裁判对单独同意规则的关注仍有不足",
          materialIds: ["M1"],
        },
        {
          id: "E1",
          kind: "expression",
          type: "指代不清",
          status: "文本内可确认",
          priority: "中",
          title: "告知义务的主体不明确",
          anchors: [
            {
              paragraphId: workspace.paragraphs[4].id,
              quote: "平台与第三方共享数据时，其应当承担相应的告知义务",
            },
          ],
          explanation: "“其”的指代对象有歧义。",
          basis: "平台与第三方均可作为先行词。",
          suggestion: "明确义务主体。",
          reference: "平台与第三方共享数据时，平台应当承担相应的告知义务",
          legalCheck: "请核对主体与告知范围。",
          materialIds: [],
        },
      ],
      materials: [
        {
          id: "M1",
          text: "补充样本选择依据，或收窄结论范围",
          issueIds: ["L1"],
          external: false,
          done: false,
        },
      ],
    });
  }
}

import { describe, expect, it } from "vitest";
import {
  countText,
  paragraphsFrom,
  resolveAnchor,
  validateText,
  validateReview,
  reportFor,
  KEY_TTL,
  reviewSchema,
} from "../../packages/shared/src/domain";
import { example } from "../../packages/shared/src/example";
import { FakeProvider } from "../support/fake-provider";
import { blankWorkspace, type Round } from "../../packages/shared/src/domain";

describe("文本、锚点与报告", () => {
  it("按空白分段、UTF-16 计数，覆盖 1500 和 5000 边界", () => {
    expect(countText(" 法\n学 😀 ")).toBe(4);
    expect(paragraphsFrom(" 段一\n\n段二 ")).toEqual([
      { id: "p1", text: "段一" },
      { id: "p2", text: "段二" },
    ]);
    for (const count of [1500, 5000])
      expect(() =>
        validateText(paragraphsFrom("法".repeat(count))),
      ).not.toThrow();
    for (const count of [1499, 5001])
      expect(() => validateText(paragraphsFrom("法".repeat(count)))).toThrow();
    expect(countText(example.text)).toBe(1579);
  });
  it("计算偏移、区分重复引文与上下文定位", () => {
    const paragraphs = paragraphsFrom("甲论据乙论据丙");
    expect(
      resolveAnchor({ paragraphId: "p1", quote: "论据" }, paragraphs).start,
    ).toBeUndefined();
    expect(
      resolveAnchor(
        { paragraphId: "p1", quote: "论据", before: "乙" },
        paragraphs,
      ).start,
    ).toBe(4);
    expect(() =>
      resolveAnchor({ paragraphId: "p9", quote: "甲" }, paragraphs),
    ).toThrow();
    expect(() =>
      resolveAnchor({ paragraphId: "p1", quote: "不存在" }, paragraphs),
    ).toThrow();
  });
  it("校验问题 ID、锚点与材料关联，报告读取历史快照模型", async () => {
    const workspace = {
      ...blankWorkspace("w"),
      paragraphs: paragraphsFrom(example.text),
    };
    const provider = new FakeProvider();
    const review = await provider.generate(
      "",
      "deepseek-chat",
      "review",
      workspace,
      reviewSchema,
      new AbortController().signal,
    );
    const checked = validateReview(review, workspace.paragraphs);
    expect(checked.issues[0].anchors[0].start).toBeGreaterThan(0);
    expect(() =>
      validateReview(
        { ...review, issues: [...review.issues, review.issues[0]] },
        workspace.paragraphs,
      ),
    ).toThrow();
    expect(() =>
      validateReview(
        {
          ...review,
          materials: [{ ...review.materials[0], issueIds: ["absent"] }],
        },
        workspace.paragraphs,
      ),
    ).toThrow();
    const round: Round = {
      ...checked,
      roundId: "r1",
      no: 1,
      title: example.title,
      paragraphs: workspace.paragraphs,
      question: "",
      outline: "",
      refs: "",
      confirmed: { question: "问题", claims: ["观点"], arguments: [] },
      feedback: {},
      results: {},
      model: "deepseek-chat",
      promptVersion: "1",
      schemaVersion: "1",
      createdAt: Date.now(),
    };
    const report = reportFor(round, {
      ...workspace,
      feedback: { L1: { value: "有帮助", reason: "测试" } },
    });
    expect(report).toContain("deepseek-chat");
    expect(report).toContain("当前工作副本附录");
    expect(report).toContain("有帮助");
    expect(report).not.toContain("API Key");
    expect(KEY_TTL).toBe(7200000);
  });
});

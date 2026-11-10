// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BasisEditor } from "../../apps/web/src/components/BasisEditor";
import type { Basis } from "../../packages/shared/src/domain";

afterEach(cleanup);
function Editor() {
  const [value, onChange] = useState<Basis>({
    question: "",
    claims: ["首个观点"],
    arguments: [{ text: "论据", paragraphIds: ["p1"], pending: "出处待补充" }],
  });
  return <BasisEditor value={value} onChange={onChange} />;
}
describe("审查依据编辑", () => {
  it("编辑问题、添加删除观点和清除待补充标记", () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("研究问题"), {
      target: { value: "研究问题示例" },
    });
    expect(
      (screen.getByLabelText("研究问题") as HTMLTextAreaElement).value,
    ).toBe("研究问题示例");
    fireEvent.click(screen.getByText("＋ 添加观点"));
    expect(screen.getByLabelText("核心观点 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("删除观点 1"));
    expect(screen.queryByLabelText("核心观点 2")).toBeNull();
    fireEvent.click(screen.getByText("已在正文中补充"));
    expect(screen.queryByText("出处待补充", { exact: false })).toBeNull();
  });
});

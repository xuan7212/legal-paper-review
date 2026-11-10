import { expect, test } from "@playwright/test";

test("浏览器完成配置、初审、采纳修改、复查与轮次报告", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "让论证更经得起推敲。" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("input.png") });
  await page.getByRole("button", { name: "用此示例开始" }).click();
  await expect(page.getByLabel("论文正文")).toHaveValue(/随着算法推荐技术/);
  await page.getByRole("button", { name: "开始审查", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置", exact: true });
  await settings.getByLabel("API Key").fill("sk-e2e-fixture-key");
  await settings.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(settings.getByRole("status")).toContainText("连接成功");
  await expect(settings.getByLabel("API Key")).toHaveValue("");
  await settings.getByRole("button", { name: "返回工作台" }).click();
  await page.getByRole("button", { name: "开始审查", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认并开始审查" }),
  ).toBeEnabled({ timeout: 10000 });
  await page.getByRole("button", { name: "确认并开始审查" }).click();
  await expect(page.getByText("第 1 轮审查完成", { exact: false })).toBeVisible(
    { timeout: 10000 },
  );
  await page.screenshot({ path: testInfo.outputPath("review.png") });
  await page
    .getByRole("button", { name: /三份判决难以支撑普遍性结论/ })
    .click();
  await page.getByRole("button", { name: "替换原句", exact: true }).click();
  await expect(page.locator(".manuscript")).toContainText(
    "就本文检索的判决而言",
  );
  await page.getByRole("button", { name: "待补材料", exact: false }).click();
  await page.getByLabel("补充样本选择依据，或收窄结论范围").check();
  await page.getByRole("button", { name: "修改后复查", exact: true }).click();
  await expect(page.getByText("第 2 轮复查完成", { exact: false })).toBeVisible(
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "第 1 轮", exact: true }).click();
  await expect(page.getByLabel("编辑第 4 段")).toHaveCount(0);
  await page.getByRole("button", { name: "复制报告", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "复制审查报告" }),
  ).toContainText("第 1 轮 · 模型 deepseek-chat");
  await page.getByRole("button", { name: "复制全文", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已复制", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "第 1 轮",
  );
  await page.getByRole("dialog").getByLabel("关闭", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "问题 2", exact: true }).click();
  await expect(page.locator(".review-panel")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("review-mobile.png") });
  await page.getByRole("button", { name: "原文", exact: true }).click();
  await expect(page.locator(".manuscript")).toBeVisible();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "新建审查", exact: true }).click();
  await page.getByRole("button", { name: "删除并新建" }).click();
  await expect(page.getByLabel("论文正文")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "deepseek-chat", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).length + Object.keys(sessionStorage).length,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("移动端上传实际文本、背景编辑与待接入检测", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("input[type=file]")).toBeEnabled();
  await page.locator("input[type=file]").setInputFiles({
    name: "片段.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("这是一份实际上传的论文文本。"),
  });
  await expect(page.getByLabel("论文正文")).toHaveValue(
    "这是一份实际上传的论文文本。",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "背景信息", exact: true }).click();
  await expect(page.getByLabel("论文题目")).toHaveValue("片段");
  await expect(
    page.getByRole("button", { name: "开始审查", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "查重率检测", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("请先粘贴论文片段");
  await page.getByRole("dialog").getByLabel("关闭", { exact: true }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

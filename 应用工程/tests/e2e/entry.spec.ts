import { expect, test } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const launcher = resolve(root, "启动法学论衡.command");

test("双击源文件与构建 HTML 均显示可操作的启动说明", async ({ page }) => {
  for (const file of ["apps/web/index.html", "dist/client/index.html"]) {
    await page.goto(pathToFileURL(resolve(root, file)).href);
    await expect(
      page.getByRole("heading", { name: "打开论文审查工作台" }),
    ).toBeVisible();
    await expect(
      page.getByText("请在“应用工程”文件夹中双击", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "打开法学论衡", exact: true }),
    ).toHaveAttribute("href", "http://127.0.0.1:3001/");
  }
});

test("启动入口可从其他目录运行并复用已有应用服务", async () => {
  const result = await execute(launcher, ["--no-open"], {
    cwd: tmpdir(),
    env: { ...process.env, PORT: "4173" },
    timeout: 10000,
  });
  expect(result.stdout).toContain("法学论衡已就绪");
  expect(result.stdout).toContain("http://127.0.0.1:4173");
});

test("无运行服务时，双击入口启动可完成示例审查的应用", async ({ page }) => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string")
    throw new Error("无法分配测试端口");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(launcher, ["--no-open"], {
    cwd: tmpdir(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${url}/api/health`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 10000, message: "启动入口应启动本地服务" },
      )
      .toBe(200);
    await page.goto(url);
    await expect(page.locator("#file-entry")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "让论证更经得起推敲。" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "体验示例演示", exact: true })
      .click();
    await page
      .getByRole("button", { name: "进入示例演示", exact: true })
      .click();
    await expect(page.locator(".panel-total")).toHaveText("5 项待处理");
    await expect.poll(() => output).toContain("法学论衡已就绪");
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
});

test("启动入口对无效端口给出明确提示", async () => {
  await expect(
    execute(launcher, ["--no-open"], {
      cwd: tmpdir(),
      env: { ...process.env, PORT: "invalid" },
      timeout: 10000,
    }),
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("PORT 需要填写"),
  });
});

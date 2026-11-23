import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
const port = Number(process.env.PORT || 3001);
const url = `http://127.0.0.1:${port}`;
const openBrowser = !process.argv.includes("--no-open");

async function isReady() {
  try {
    const health = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!health.ok || !(await health.json()).ok) return false;
    const page = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return (
      page.ok && (await page.text()).includes("法学论衡 · 论文论证与表达审查")
    );
  } catch {
    return false;
  }
}

function announce() {
  console.log(`法学论衡已就绪，请访问 ${url}`);
  if (!openBrowser) return;
  const opened = spawnSync("open", [url], { stdio: "inherit" });
  if (opened.error || opened.status !== 0)
    console.log(`请在浏览器中打开 ${url}`);
}

function buildIfNeeded() {
  if (
    existsSync("dist/server/index.js") &&
    existsSync("dist/client/index.html")
  )
    return;
  console.log("首次启动，正在准备应用……");
  const commands = [
    ["node_modules/typescript/bin/tsc", "--noEmit"],
    [
      "node_modules/vite/bin/vite.js",
      "build",
      "--config",
      "config/vite.config.ts",
    ],
    ["scripts/build-server.mjs"],
  ];
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, { stdio: "inherit" });
    if (result.error || result.status !== 0)
      throw new Error("应用准备失败，请检查上方提示后重新启动。");
  }
}

async function launch() {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 需要填写 1—65535 之间的端口号。");
  if (await isReady()) {
    announce();
    return;
  }
  if (!existsSync("node_modules/fastify/package.json"))
    throw new Error(
      "请先在“应用工程”目录执行 pnpm install --frozen-lockfile 安装依赖。",
    );
  buildIfNeeded();
  const server = spawn(process.execPath, ["dist/server/index.js"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "inherit",
  });
  const exit = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => resolve(code || 0));
  });
  const stop = () => server.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (server.exitCode !== null) break;
      if (await isReady()) {
        ready = true;
        break;
      }
      await setTimeout(250);
    }
    if (!ready)
      throw new Error(`启动失败，请检查 ${port} 端口是否被其他程序使用。`);
    announce();
    console.log("请保留此窗口，按 Control+C 可停止本次启动的服务。");
    process.exitCode = await exit;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    if (server.exitCode === null) {
      stop();
      await exit;
    }
  }
}

launch().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

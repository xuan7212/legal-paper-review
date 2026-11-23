import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";
import { FILE_LIMIT } from "../../../../packages/shared/src/domain.js";
import { AppError } from "../errors.js";

export function validateUpload(filename: string, bytes: Buffer) {
  if (bytes.length > FILE_LIMIT)
    throw new AppError("FILE_SIZE", "文件超过 20 MB，请拆分后上传", 413);
  const extension = extname(filename).toLowerCase();
  if (![".txt", ".md", ".pdf", ".docx", ".doc"].includes(extension))
    throw new AppError("FILE_TYPE", "支持 PDF、Word、TXT 和 MD 文件");
  if (extension === ".pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new AppError("FILE_SIGNATURE", "文件内容与 PDF 格式不符");
  if (extension === ".docx" && bytes.subarray(0, 2).toString() !== "PK")
    throw new AppError("FILE_SIGNATURE", "文件内容与 DOCX 格式不符");
  if (
    extension === ".doc" &&
    bytes.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1"
  )
    throw new AppError("FILE_SIGNATURE", "文件内容与 DOC 格式不符");
  return extension;
}

export async function parseFile(
  filename: string,
  bytes: Buffer,
  signal: AbortSignal,
): Promise<{ text: string; filename: string }> {
  const extension = validateUpload(filename, bytes);
  const source = import.meta.url.endsWith(".ts");
  return new Promise((resolve, reject) => {
    const child = fork(
      fileURLToPath(
        new URL(source ? "./worker.ts" : "./files/worker.js", import.meta.url),
      ),
      [],
      {
        execArgv: [
          "--max-old-space-size=256",
          ...(source ? ["--import", "tsx"] : []),
        ],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: {
          PATH: process.env.PATH,
          SOFFICE_BIN: process.env.SOFFICE_BIN,
          TMPDIR: process.env.TMPDIR,
        },
      },
    );
    let settled = false;
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      child.kill("SIGTERM");
      if (error) reject(error);
      else resolve({ text: text!, filename });
    };
    const abort = () =>
      finish(new AppError("CANCELLED", "文件解析已取消", 409));
    const timer = setTimeout(
      () =>
        finish(
          new AppError(
            "PARSE_TIMEOUT",
            "文件解析超时，请拆分文件后重试",
            408,
            true,
          ),
        ),
      45000,
    );
    signal.addEventListener("abort", abort, { once: true });
    child.on("message", (message: { text?: string; error?: string }) => {
      if (message.error) finish(new AppError("PARSE_FAILED", message.error));
      else if (message.text?.trim()) finish(undefined, message.text);
      else
        finish(
          new AppError(
            "EMPTY_FILE",
            "未提取到可用正文，扫描版 PDF 需要 OCR，请转换后重试",
          ),
        );
    });
    child.on("error", () =>
      finish(new AppError("PARSE_FAILED", "文件解析进程启动失败", 500, true)),
    );
    child.on("exit", () =>
      finish(new AppError("PARSE_FAILED", "文件解析异常，请检查文件格式", 400)),
    );
    if (signal.aborted) abort();
    else child.send({ extension, data: bytes.toString("base64") });
  });
}

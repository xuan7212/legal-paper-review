import mammoth from "mammoth";
import yauzl from "yauzl";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";

let temporary: string | undefined;
let conversion: ReturnType<typeof execFile> | undefined;
async function clean() {
  conversion?.kill("SIGKILL");
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
process.on("SIGTERM", () => {
  void clean().finally(() => process.exit(0));
});

async function checkZip(bytes: Buffer) {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(new Error("Word 文件已损坏"));
        return;
      }
      let expanded = 0;
      let count = 0;
      let documentFound = false;
      zip.on("entry", (entry) => {
        expanded += entry.uncompressedSize;
        count++;
        if (expanded > 80 * 1024 * 1024 || count > 5000) {
          zip.close();
          reject(new Error("Word 文件解压后超过处理上限"));
          return;
        }
        documentFound ||= entry.fileName === "word/document.xml";
        zip.readEntry();
      });
      zip.on("end", () =>
        documentFound ? resolve() : reject(new Error("文件缺少 Word 正文")),
      );
      zip.on("error", () => reject(new Error("Word 文件结构异常")));
      zip.readEntry();
    });
  });
}

async function extract(extension: string, bytes: Buffer) {
  if (extension === ".txt" || extension === ".md") {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("文本编码异常，请转换为 UTF-8 后重传");
    }
  }
  if (extension === ".pdf") {
    const loading = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const pdf = await loading.promise;
    try {
      if (pdf.numPages > 150) throw new Error("PDF 超过 150 页，请拆分后上传");
      const pages: string[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
        }
        pages.push(text);
        if (pages.join("").length > 200000)
          throw new Error("提取正文超过 20 万字符，请拆分文件");
        page.cleanup();
      }
      return pages.join("\n\n");
    } finally {
      await pdf.destroy();
    }
  }
  if (extension === ".doc") {
    temporary = await mkdtemp(join(tmpdir(), "legal-review-"));
    const input = join(temporary, "paper.doc");
    await writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      conversion = execFile(
        process.env.SOFFICE_BIN || "soffice",
        [
          `-env:UserInstallation=file://${join(temporary!, "profile")}`,
          "--headless",
          "--safe-mode",
          "--convert-to",
          "docx",
          "--outdir",
          temporary!,
          input,
        ],
        { timeout: 25000, maxBuffer: 1024 * 1024 },
        (error) => {
          if (error)
            reject(
              new Error(
                "旧版 DOC 转换失败，请安装 LibreOffice 或另存为 DOCX 后上传",
              ),
            );
          else resolve();
        },
      );
    });
    bytes = await readFile(join(temporary, "paper.docx"));
  }
  await checkZip(bytes);
  return (await mammoth.extractRawText({ buffer: bytes })).value;
}

process.once(
  "message",
  async (message: { extension: string; data: string }) => {
    try {
      const text = await extract(
        message.extension,
        Buffer.from(message.data, "base64"),
      );
      if (text.length > 200000)
        throw new Error("正文超过 20 万字符，请拆分后上传");
      process.send?.({ text });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const publicMessage = /编码|20 万|150 页|解压|正文|旧版 DOC/.test(message)
        ? message
        : "解析失败，请检查文件格式、密码或损坏情况";
      process.send?.({ error: publicMessage });
    } finally {
      await clean();
      process.disconnect();
    }
  },
);

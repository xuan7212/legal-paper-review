import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  utimes,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFile, validateUpload } from "../../apps/server/src/files/parse";
import { cleanupExpiredTemporaryFiles } from "../../apps/server/src/files/cleanup";

function wordFile() {
  return execFileSync("python3", [
    "-c",
    `
import io, zipfile, sys
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
 archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
 archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>法学论文实际正文</w:t></w:r></w:p></w:body></w:document>')
sys.stdout.buffer.write(buffer.getvalue())
`,
  ]);
}

function pdfFile() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length 42 >>\nstream\nBT /F1 12 Tf 20 250 Td (Legal paper) Tj ET\nendstream",
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

describe("实际文件解析", () => {
  it("启动清理仅移除过期的应用临时目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "legal-cleanup-test-"));
    try {
      const expired = join(root, "legal-review-expired");
      const fresh = join(root, "legal-review-fresh");
      const other = join(root, "unrelated");
      await Promise.all([mkdir(expired), mkdir(fresh), mkdir(other)]);
      const old = new Date(Date.now() - 3 * 3600000);
      await utimes(expired, old, old);
      await utimes(other, old, old);
      await cleanupExpiredTemporaryFiles(root);
      await expect(access(expired)).rejects.toThrow();
      await expect(access(fresh)).resolves.toBeUndefined();
      await expect(access(other)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("读取 UTF-8 文本并拒绝格式伪装、超限文件和异常编码", async () => {
    const signal = new AbortController().signal;
    expect(
      (await parseFile("论文.md", Buffer.from("中文正文\n第二段"), signal))
        .text,
    ).toBe("中文正文\n第二段");
    expect(() => validateUpload("fake.pdf", Buffer.from("fake"))).toThrow(
      "格式不符",
    );
    expect(() =>
      validateUpload("large.txt", Buffer.alloc(20 * 1024 * 1024 + 1)),
    ).toThrow("20 MB");
    await expect(
      parseFile("编码.txt", Buffer.from([0xff, 0xfe]), signal),
    ).rejects.toThrow("UTF-8");
  });
  it("从实际 DOCX 与文字 PDF 提取正文", async () => {
    const signal = new AbortController().signal;
    expect((await parseFile("论文.docx", wordFile(), signal)).text).toContain(
      "法学论文实际正文",
    );
    expect((await parseFile("论文.pdf", pdfFile(), signal)).text).toContain(
      "Legal paper",
    );
  });
  it("取消解析终止任务", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseFile("论文.txt", Buffer.from("正文"), controller.signal),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("部署提供 LibreOffice 时验证旧版 DOC 的真实转换", async () => {
    const directory = await mkdtemp(join(tmpdir(), "legal-doc-test-"));
    try {
      const input = join(directory, "input.docx");
      await writeFile(input, wordFile());
      execFileSync(
        process.env.SOFFICE_BIN || "soffice",
        [
          `-env:UserInstallation=file://${join(directory, "profile")}`,
          "--headless",
          "--convert-to",
          "doc",
          "--outdir",
          directory,
          input,
        ],
        { timeout: 30000 },
      );
      const document = await readFile(join(directory, "input.doc"));
      expect(
        (await parseFile("论文.doc", document, new AbortController().signal))
          .text,
      ).toContain("法学论文实际正文");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60000);
});

import { readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KEY_TTL } from "../../../../packages/shared/src/domain.js";

export async function cleanupExpiredTemporaryFiles(
  directory = tmpdir(),
  now = Date.now(),
) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("legal-review-"))
      continue;
    const path = join(directory, entry.name);
    try {
      const info = await stat(path);
      if (now - info.mtimeMs >= KEY_TTL)
        await rm(path, { recursive: true, force: true });
    } catch {
      /* 其他清理进程可能已经移除该目录。 */
    }
  }
}

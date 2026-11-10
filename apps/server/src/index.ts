import { buildApp } from "./app.js";
import { cleanupExpiredTemporaryFiles } from "./files/cleanup.js";

await cleanupExpiredTemporaryFiles();
const app = buildApp();
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
});
console.log(
  `法学论文审查助手 http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3001}`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

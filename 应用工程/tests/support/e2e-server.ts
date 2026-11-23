import { resolve } from "node:path";
import { buildApp } from "../../apps/server/src/app";
import { FakeProvider } from "./fake-provider";

const app = buildApp({
  provider: new FakeProvider(),
  limits: false,
  staticRoot: resolve("dist/client"),
});
await app.listen({ host: "127.0.0.1", port: 4173 });

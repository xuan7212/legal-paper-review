import { build } from "esbuild";

await build({
  entryPoints: ["apps/server/src/index.ts", "apps/server/src/files/worker.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outbase: "apps/server/src",
  outdir: "dist/server",
});

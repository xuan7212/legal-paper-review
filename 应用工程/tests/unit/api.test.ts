import { afterEach, expect, it, vi } from "vitest";
import { Api } from "../../apps/web/src/api";

afterEach(() => vi.unstubAllGlobals());
it("无请求体的会话创建请求省略 JSON 内容类型，带正文请求按 JSON 发送", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ sessionId: "session" })),
    );
  vi.stubGlobal("fetch", fetcher);
  const api = new Api();
  await api.initialize();
  expect(fetcher.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
  await api.request("/workspace", { method: "PUT", body: "{}" });
  expect(fetcher.mock.calls[1][1].headers.get("Content-Type")).toBe(
    "application/json",
  );
  expect(fetcher.mock.calls[1][1].headers.get("X-Session-Id")).toBe("session");
});

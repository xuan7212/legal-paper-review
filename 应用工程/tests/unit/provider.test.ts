import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DeepSeekProvider } from "../../apps/server/src/agent/provider";

describe("DeepSeek 真实请求适配", () => {
  it("固定服务地址、使用所选模型、一次格式修正并传递取消信号", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "invalid" } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: '{"value":"ok"}' } }],
        }),
      );
    const provider = new DeepSeekProvider(fetcher);
    const controller = new AbortController();
    expect(
      await provider.generate(
        "sk-secret",
        "deepseek-reasoner",
        "extract",
        { paper: "输入" },
        z.object({ value: z.string() }),
        controller.signal,
      ),
    ).toEqual({ value: "ok" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    const request = fetcher.mock.calls[0][1];
    expect(JSON.parse(request.body).model).toBe("deepseek-reasoner");
    expect(request.signal).toBe(controller.signal);
  });
  it("区分密钥和额度错误，并排除供应商响应内容", async () => {
    for (const [status, code] of [
      [401, "KEY_INVALID"],
      [402, "QUOTA"],
    ] as const) {
      const provider = new DeepSeekProvider(
        vi.fn().mockResolvedValue(new Response("private-secret", { status })),
      );
      await expect(
        provider.test(
          "sk-secret",
          "deepseek-chat",
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code });
    }
  });
  it("记录模型调用数与供应商实际返回的用量", async () => {
    const provider = new DeepSeekProvider(
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      ),
    );
    const totals = { calls: 0, inputTokens: 0, outputTokens: 0 };
    await provider.generate(
      "sk-fixture",
      "deepseek-chat",
      "extract",
      {},
      z.object({ ok: z.boolean() }),
      new AbortController().signal,
      (usage) => {
        totals.calls += usage.calls;
        totals.inputTokens += usage.inputTokens;
        totals.outputTokens += usage.outputTokens;
      },
    );
    expect(totals).toEqual({ calls: 1, inputTokens: 100, outputTokens: 20 });
  });
});

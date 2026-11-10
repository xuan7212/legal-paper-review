import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/server/src/app";
import { Store } from "../../apps/server/src/reviews/store";
import { KEY_TTL, paragraphsFrom } from "../../packages/shared/src/domain";
import { example } from "../../packages/shared/src/example";
import { FakeProvider } from "../support/fake-provider";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function setup(provider = new FakeProvider(), store = new Store()) {
  const app = buildApp({ provider, store, limits: false });
  apps.push(app);
  const create = await app.inject({ method: "POST", url: "/api/sessions" });
  const headers = { "x-session-id": create.json().sessionId };
  const request = async (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    payload?: object,
    extra = {},
  ) =>
    app.inject({
      method,
      url: `/api${url}`,
      headers: { ...headers, ...extra },
      payload,
    });
  const load = async () => (await request("GET", "/workspace")).json();
  const save = async (patch: object) => {
    const { workspace } = await load();
    const response = await request("PUT", "/workspace", {
      ...workspace,
      ...patch,
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  const wait = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const result = (await request("GET", `/jobs/${id}`)).json();
      if (["succeeded", "failed", "cancelled"].includes(result.status))
        return result;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("任务未结束");
  };
  const start = async (route: string, retryJobId?: string) => {
    const response = await request(
      "POST",
      route,
      { retryJobId },
      { "idempotency-key": crypto.randomUUID() },
    );
    expect(response.statusCode).toBe(200);
    return wait(response.json().id);
  };
  const configure = () =>
    request("POST", "/credentials/test", {
      key: "sk-test-private-key",
      model: "deepseek-chat",
    });
  const prepare = async () => {
    await configure();
    await save({
      title: example.title,
      paragraphs: paragraphsFrom(example.text),
    });
    const extraction = await start("/extractions");
    await save({ confirmed: extraction.result });
  };
  return {
    app,
    headers,
    request,
    load,
    save,
    wait,
    start,
    configure,
    prepare,
    store,
    provider,
  };
}

describe("真实入口与会话任务一致性", () => {
  it("完成提取、确认、初审、材料反馈、复查与历史报告", async () => {
    const test = await setup();
    await test.prepare();
    const first = await test.start("/reviews");
    expect(first.status).toBe("succeeded");
    const initial = await test.load();
    const quote = first.result.issues[0].anchors[0].quote;
    await test.save({
      paragraphs: initial.workspace.paragraphs.map((p: { text: string }) => ({
        ...p,
        text: p.text.replace(
          quote,
          "本文选取的个别判决对相关规则的关注仍有不足",
        ),
      })),
      materials: initial.workspace.materials.map((m: object) => ({
        ...m,
        done: true,
      })),
      feedback: { L1: { value: "有帮助", reason: "作者的独立反馈标记" } },
    });
    const second = await test.start("/rechecks");
    expect(second.status).toBe("succeeded");
    expect(second.result.results.L1.state).toBe("已解决");
    expect(second.result.results.E1.state).toBe("仍需补充");
    const historical = (
      await test.request("GET", `/rounds/${first.result.roundId}/report`)
    ).json().text;
    expect(historical).toContain("第 1 轮");
    expect(historical).not.toContain("作者的独立反馈标记");
    const state = await test.load();
    expect(state.rounds[0].materials[0].done).toBe(false);
    expect(state.rounds[1].materials[0].done).toBe(true);
    expect(test.provider.calls).toEqual([
      "test",
      "extract",
      "review",
      "verify",
      "recheck",
    ]);
    expect(JSON.stringify(state)).not.toContain("sk-test-private-key");
  });
  it("首轮要求确认依据、正确字数与配置", async () => {
    const test = await setup();
    expect(
      (
        await test.request(
          "POST",
          "/extractions",
          {},
          { "idempotency-key": crypto.randomUUID() },
        )
      ).statusCode,
    ).toBe(400);
    await test.save({ paragraphs: paragraphsFrom(example.text) });
    expect(
      (
        await test.request(
          "POST",
          "/extractions",
          {},
          { "idempotency-key": crypto.randomUUID() },
        )
      ).statusCode,
    ).toBe(401);
    await test.configure();
    expect(
      (
        await test.request(
          "POST",
          "/reviews",
          {},
          { "idempotency-key": crypto.randomUUID() },
        )
      ).json().code,
    ).toBe("BASIS_REQUIRED");
  });
  it("隔离会话与资源，拒绝跨站请求，校验修改修订号", async () => {
    const test = await setup();
    await test.prepare();
    const first = await test.start("/reviews");
    const other = await test.app.inject({
      method: "POST",
      url: "/api/sessions",
    });
    const inaccessible = await test.app.inject({
      method: "GET",
      url: `/api/rounds/${first.result.roundId}`,
      headers: { "x-session-id": other.json().sessionId },
    });
    expect(inaccessible.statusCode).toBe(404);
    expect(
      (
        await test.request("GET", "/workspace", undefined, {
          origin: "https://untrusted.invalid",
        })
      ).statusCode,
    ).toBe(403);
    const { workspace } = await test.load();
    await test.save({ title: "已更新" });
    expect(
      (await test.request("PUT", "/workspace", workspace)).json().code,
    ).toBe("REVISION");
  });
  it("密钥到期后清除密钥，保留已完成的论文结果", async () => {
    let now = Date.now();
    const test = await setup(new FakeProvider(), new Store(() => now));
    await test.prepare();
    await test.start("/reviews");
    now += KEY_TTL - 1000;
    await test.save({ title: "保持会话活动" });
    now += 1001;
    const credential = await test.request("GET", "/credentials/status");
    expect(credential.json().status).toBe("unconfigured");
    expect((await test.load()).rounds.length).toBe(1);
    expect((await test.request("POST", "/credentials/reveal")).statusCode).toBe(
      401,
    );
  });
  it("取消和新建阻止迟到任务写回，配置测试清除后保持失效", async () => {
    const test = await setup();
    await test.prepare();
    let release!: () => void;
    test.provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = await test.request(
      "POST",
      "/reviews",
      {},
      { "idempotency-key": crypto.randomUUID() },
    );
    await test.request("DELETE", "/workspace");
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await test.load()).rounds).toHaveLength(0);
    expect(
      (await test.request("GET", `/jobs/${task.json().id}`)).statusCode,
    ).toBe(404);
    test.provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const testing = test.configure();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await test.request("DELETE", "/credentials");
    release();
    expect((await testing).statusCode).toBe(409);
    expect(
      (await test.request("GET", "/credentials/status")).json().status,
    ).toBe("unconfigured");
  });
  it("失败重试复用已完成阶段，修订变化阻止旧结果提交", async () => {
    const test = await setup();
    await test.prepare();
    test.provider.failAt = "verify";
    const failure = await test.start("/reviews");
    expect(failure.status).toBe("failed");
    expect((await test.load()).rounds).toHaveLength(0);
    const retried = await test.start("/reviews", failure.id);
    expect(retried.status).toBe("succeeded");
    expect(test.provider.calls.filter((s) => s === "review")).toHaveLength(1);
  });
  it("幂等键在处理期间返回同一任务，互斥任务防止重复调用", async () => {
    const test = await setup();
    await test.prepare();
    let release!: () => void;
    test.provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const key = crypto.randomUUID();
    const first = await test.request(
      "POST",
      "/reviews",
      {},
      { "idempotency-key": key },
    );
    const second = await test.request(
      "POST",
      "/reviews",
      {},
      { "idempotency-key": key },
    );
    expect(first.json().id).toBe(second.json().id);
    expect(
      (
        await test.request(
          "POST",
          "/reviews",
          {},
          { "idempotency-key": crypto.randomUUID() },
        )
      ).json().code,
    ).toBe("BUSY");
    release();
    expect((await test.wait(first.json().id)).status).toBe("succeeded");
    const replay = await test.request(
      "POST",
      "/reviews",
      {},
      { "idempotency-key": key },
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(first.json().id);
  });
  it("在途任务遇到正文修订时拒绝发布过期结果", async () => {
    const test = await setup();
    await test.prepare();
    let release!: () => void;
    test.provider.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = await test.request(
      "POST",
      "/reviews",
      {},
      { "idempotency-key": crypto.randomUUID() },
    );
    await test.save({ outline: "审查期间更新提纲" });
    release();
    const completed = await test.wait(task.json().id);
    expect(completed.status).toBe("failed");
    expect(completed.error.code).toBe("STALE_INPUT");
    expect((await test.load()).rounds).toHaveLength(0);
  });
  it("新建之后拒绝旧工作区的保存，保留可用模型配置", async () => {
    const test = await setup();
    await test.configure();
    const { workspace } = await test.load();
    await test.request("DELETE", "/workspace");
    const saved = await test.request("PUT", "/workspace", {
      ...workspace,
      title: "旧内容",
    });
    expect(saved.statusCode).toBe(409);
    expect((await test.load()).workspace.title).toBe("");
    expect(
      (await test.request("GET", "/credentials/status")).json().status,
    ).toBe("ok");
  });
});

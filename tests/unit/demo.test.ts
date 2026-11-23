import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../apps/server/src/app";
import { FakeProvider } from "../support/fake-provider";
import {
  isDirty,
  type Workspace,
  type Round,
} from "../../packages/shared/src/domain";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function setup() {
  const provider = new FakeProvider();
  const app = buildApp({ provider, limits: false });
  apps.push(app);
  const created = await app.inject({ method: "POST", url: "/api/sessions" });
  const headers = { "x-session-id": created.json().sessionId };
  const request = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    route: string,
    payload?: object,
  ) => app.inject({ method, url: `/api${route}`, headers, payload });
  return { app, provider, headers, request };
}

describe("显式示例演示与真实审查隔离", () => {
  it("无需模型配置载入可定位的样本，保留 API 配置且隔离其他会话", async () => {
    const { request, provider, app } = await setup();
    await request("POST", "/credentials/test", {
      key: "sk-demo-test-key",
      model: "deepseek-chat",
    });
    const result = await request("POST", "/demo");
    expect(result.statusCode).toBe(200);
    const { workspace, rounds } = result.json<{
      workspace: Workspace;
      rounds: Round[];
    }>();
    expect(rounds[0].issues).toHaveLength(5);
    expect(
      rounds[0].issues.every((i) =>
        i.anchors.every((a) => a.start !== undefined),
      ),
    ).toBe(true);
    expect(rounds[0].source).toBe("demo");
    expect(isDirty(workspace, rounds[0])).toBe(false);
    expect(provider.calls).toEqual(["test"]);
    expect((await request("GET", "/credentials/status")).json().status).toBe(
      "ok",
    );
    const other = (
      await app.inject({ method: "POST", url: "/api/sessions" })
    ).json();
    const inaccessible = await app.inject({
      method: "GET",
      url: `/api/rounds/${rounds[0].roundId}`,
      headers: { "x-session-id": other.sessionId },
    });
    expect(inaccessible.statusCode).toBe(404);
    const report = (
      await request("GET", `/rounds/${rounds[0].roundId}/report`)
    ).json().text;
    expect(report).toContain("固定审查内容与规则复查");
    expect(report).toContain("主要论据与待补信息");
    expect(report).toContain("本轮审查文本");
    expect(report).toContain("补充案号、检索范围与筛选方法");
    expect(report).not.toContain("sk-demo-test-key");
  });

  it("只有预设替换识别为解决，任意删句及勾选材料继续提示复核", async () => {
    const { request, provider } = await setup();
    const { workspace, rounds } = (await request("POST", "/demo")).json<{
      workspace: Workspace;
      rounds: Round[];
    }>();
    expect(
      (
        await request("POST", "/demo/rechecks", {
          workspaceId: workspace.workspaceId,
          revision: workspace.revision,
        })
      ).json().code,
    ).toBe("NO_CHANGES");
    const [sample, contradiction] = rounds[0].issues;
    const next = {
      ...workspace,
      paragraphs: workspace.paragraphs.map((p) => ({
        ...p,
        text: p.text
          .replace(sample.anchors[0].quote, sample.reference!)
          .replace(
            contradiction.anchors[0].quote,
            "作者重新提出了一个尚待验证的判断",
          ),
      })),
      materials: workspace.materials.map((m) => ({ ...m, done: true })),
    };
    const saved = (await request("PUT", "/workspace", next)).json<Workspace>();
    const response = await request("POST", "/demo/rechecks", {
      workspaceId: saved.workspaceId,
      revision: saved.revision,
    });
    expect(response.statusCode).toBe(200);
    const current = response.json<{ workspace: Workspace; rounds: Round[] }>();
    expect(current.rounds[1].results.L1.state).toBe("已解决");
    expect(current.rounds[1].results.L2.state).toBe("需重新判断");
    expect(current.rounds[1].results.L3.state).toBe("仍需补充");
    expect(current.rounds[0].materials.every((m) => !m.done)).toBe(true);
    expect(provider.calls).toEqual([]);
    expect(
      (
        await request("POST", "/demo/rechecks", {
          workspaceId: saved.workspaceId,
          revision: saved.revision,
        })
      ).statusCode,
    ).toBe(409);
    expect((await request("GET", "/workspace")).json().rounds).toHaveLength(2);
  });

  it("示例阻止真实审查误调用，新建后恢复正常密钥要求", async () => {
    const { request, provider } = await setup();
    await request("POST", "/demo");
    expect((await request("POST", "/rechecks")).json().code).toBe(
      "DEMO_ACTIVE",
    );
    await request("DELETE", "/workspace");
    const state = (await request("GET", "/workspace")).json();
    expect(state.rounds).toHaveLength(0);
    expect(state.workspace.paragraphs).toHaveLength(0);
    expect(
      (
        await request("POST", "/demo/rechecks", {
          workspaceId: state.workspace.workspaceId,
          revision: state.workspace.revision,
        })
      ).json().code,
    ).toBe("DEMO_REQUIRED");
    expect(provider.calls).toEqual([]);
    expect((await request("POST", "/demo")).statusCode).toBe(200);
  });
});

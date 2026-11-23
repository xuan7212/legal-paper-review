// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "../../apps/web/src/state";
import { blankWorkspace } from "../../packages/shared/src/domain";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["reset", "cancel"] as const)(
  "%s 后丢弃迟到的任务进度，保留当前页面状态",
  async (operation) => {
    const job = {
      id: "old",
      type: "extract",
      status: "running",
      stage: "提取中",
    };
    let resolvePoll!: (response: Response) => void;
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/sessions")
        return Response.json({ sessionId: "session" });
      if (path === "/api/workspace" && init?.method === "DELETE")
        return Response.json(blankWorkspace("new"));
      if (path === "/api/workspace")
        return Response.json({ workspace: blankWorkspace("old"), rounds: [] });
      if (path === "/api/extractions") return Response.json(job);
      if (path === "/api/jobs/old" && init?.method === "DELETE")
        return Response.json({ ...job, status: "cancelled" });
      if (path === "/api/jobs/old")
        return new Promise<Response>((resolve) => {
          resolvePoll = resolve;
        });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: WorkspaceProvider,
    });
    await waitFor(() => expect(result.current.state.ready).toBe(true));
    let running!: Promise<unknown>;
    act(() => {
      running = result.current.run("extract");
    });
    await waitFor(() => expect(resolvePoll).toBeTypeOf("function"), {
      timeout: 3000,
    });
    await act(async () => {
      await result.current[operation]();
    });
    await act(async () => {
      resolvePoll(Response.json({ ...job, stage: "迟到的进度" }));
      await running;
    });
    expect(result.current.state.busy).toBe(false);
    expect(result.current.state.phase).toBe("input");
    if (operation === "reset") {
      expect(result.current.state.job).toBeUndefined();
      expect(result.current.state.workspace.workspaceId).toBe("new");
    } else expect(result.current.state.job?.status).toBe("cancelled");
  },
);

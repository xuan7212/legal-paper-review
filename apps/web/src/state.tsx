import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  blankWorkspace,
  type Workspace,
  type Round,
  type CredentialStatus,
  type JobView,
  type Basis,
} from "../../../packages/shared/src/domain";
import { Api, ApiError } from "./api";

type State = {
  workspace: Workspace;
  rounds: Round[];
  credentials: CredentialStatus;
  phase: "input" | "confirm" | "review";
  extracted?: Basis;
  job?: JobView;
  ready: boolean;
  busy: boolean;
  error: string;
};
const initial: State = {
  workspace: blankWorkspace(""),
  rounds: [],
  credentials: { status: "unconfigured", masked: "", model: "deepseek-chat" },
  phase: "input",
  ready: false,
  busy: false,
  error: "",
};
function reducer(state: State, patch: Partial<State>) {
  return { ...state, ...patch };
}

function useWorkspaceController() {
  const [state, dispatch] = useReducer(reducer, initial);
  const current = useRef(state);
  current.current = state;
  const api = useRef(new Api()).current;
  const alive = useRef(true);
  const currentJob = useRef<string | undefined>(undefined);
  const saveLock = useRef(false);
  const epoch = useRef(0);
  const notify = (error: unknown) =>
    dispatch({
      error: error instanceof Error ? error.message : "操作失败，请重试",
    });
  const refresh = async () => {
    const generation = epoch.current;
    const data = await api.request<{ workspace: Workspace; rounds: Round[] }>(
      "/workspace",
    );
    if (alive.current && generation === epoch.current) dispatch(data);
    return data;
  };
  const credentials = async () => {
    const value = await api.request<CredentialStatus>("/credentials/status");
    if (alive.current) dispatch({ credentials: value });
    return value;
  };
  useEffect(() => {
    alive.current = true;
    void api
      .initialize()
      .then(async () => {
        await refresh();
        dispatch({ ready: true });
      })
      .catch(notify);
    const leave = () => api.dispose();
    window.addEventListener("pagehide", leave);
    const timer = setInterval(() => {
      if (api.sessionId) void credentials().catch(notify);
    }, 10000);
    return () => {
      alive.current = false;
      currentJob.current = undefined;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      api.dispose();
    };
  }, []);

  const save = async (patch: Partial<Workspace>) => {
    if (saveLock.current) throw new Error("正在保存，请稍后再试");
    saveLock.current = true;
    const generation = epoch.current;
    const previous = current.current.workspace;
    const optimistic = { ...previous, ...patch };
    current.current = { ...current.current, workspace: optimistic };
    dispatch({ busy: true, error: "", workspace: optimistic });
    try {
      const workspace = await api.request<Workspace>("/workspace", {
        method: "PUT",
        body: JSON.stringify(optimistic),
      });
      if (generation !== epoch.current) throw new Error("工作区已切换");
      current.current = { ...current.current, workspace };
      dispatch({ workspace });
      return workspace;
    } catch (error) {
      if (generation === epoch.current) {
        current.current = { ...current.current, workspace: previous };
        dispatch({ workspace: previous });
        notify(error);
      }
      throw error;
    } finally {
      saveLock.current = false;
      if (generation === epoch.current) dispatch({ busy: false });
    }
  };

  const run = async (
    type: JobView["type"],
    form?: FormData,
    retryJobId?: string,
    resumeJobId?: string,
  ) => {
    const generation = epoch.current;
    dispatch({ busy: true, error: "" });
    let job: JobView;
    try {
      if (
        current.current.rounds.at(-1)?.source === "demo" &&
        type === "recheck"
      ) {
        const workspace = current.current.workspace;
        const data = await api.request<{
          workspace: Workspace;
          rounds: Round[];
        }>("/demo/rechecks", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.workspaceId,
            revision: workspace.revision,
          }),
        });
        if (generation === epoch.current)
          dispatch({ ...data, phase: "review", job: undefined });
        return data.rounds.at(-1);
      }
      const endpoint = {
        extract: "/extractions",
        review: "/reviews",
        recheck: "/rechecks",
        parse: "/files/parse",
      }[type];
      job = resumeJobId
        ? await api.request<JobView>(`/jobs/${resumeJobId}`)
        : await api.request<JobView>(endpoint, {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body:
              form ||
              JSON.stringify({
                retryJobId,
                revision: current.current.workspace.revision,
                workspaceId: current.current.workspace.workspaceId,
              }),
          });
      if (generation !== epoch.current) return;
      currentJob.current = job.id;
      dispatch({ job });
      while (alive.current && currentJob.current === job.id) {
        if (job.status === "succeeded") {
          await refresh();
          if (generation !== epoch.current) return;
          if (type === "extract")
            dispatch({ phase: "confirm", extracted: job.result as Basis });
          if (type === "review" || type === "recheck")
            dispatch({ phase: "review" });
          return job.result;
        }
        if (job.status === "failed")
          throw new ApiError(
            job.error!.code,
            job.error!.message,
            job.error!.retryable,
          );
        if (job.status === "cancelled") return;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (!alive.current || currentJob.current !== job.id) return;
        job = await api.request<JobView>(`/jobs/${job.id}`);
        if (
          generation !== epoch.current ||
          currentJob.current !== job.id ||
          !alive.current
        )
          return;
        dispatch({ job });
      }
    } catch (error) {
      if (generation === epoch.current) notify(error);
    } finally {
      if (alive.current && generation === epoch.current)
        dispatch({ busy: false });
    }
  };
  const cancel = async () => {
    const id = currentJob.current;
    currentJob.current = undefined;
    if (id)
      dispatch({
        job: await api.request<JobView>(`/jobs/${id}`, { method: "DELETE" }),
        busy: false,
      });
  };
  const reset = async () => {
    epoch.current++;
    currentJob.current = undefined;
    const workspace = await api.request<Workspace>("/workspace", {
      method: "DELETE",
    });
    current.current = { ...current.current, workspace };
    dispatch({
      workspace,
      rounds: [],
      phase: "input",
      job: undefined,
      extracted: undefined,
      error: "",
      busy: false,
    });
  };
  const startDemo = async () => {
    dispatch({ busy: true, error: "" });
    try {
      const data = await api.request<{ workspace: Workspace; rounds: Round[] }>(
        "/demo",
        { method: "POST" },
      );
      epoch.current++;
      currentJob.current = undefined;
      current.current = { ...current.current, ...data };
      dispatch({
        ...data,
        phase: "review",
        extracted: undefined,
        job: undefined,
      });
    } catch (error) {
      notify(error);
      throw error;
    } finally {
      dispatch({ busy: false });
    }
  };
  return {
    state,
    api,
    dispatch,
    save,
    run,
    cancel,
    reset,
    startDemo,
    notify,
    refresh,
    credentials,
  };
}
const Context = createContext<ReturnType<typeof useWorkspaceController> | null>(
  null,
);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceController();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("缺少工作区上下文");
  return value;
}

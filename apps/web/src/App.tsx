import { useEffect, useState } from "react";
import {
  PanelLeft,
  Plus,
  Settings2,
  Files,
  ScanText,
  Scale,
  ArrowRight,
  Check,
  Copy,
  RotateCw,
  BookOpen,
  ShieldCheck,
  X,
  LoaderCircle,
} from "lucide-react";
import {
  countText,
  isDirty,
  type Basis,
} from "../../../packages/shared/src/domain";
import { useWorkspace } from "./state";
import { copyText } from "./api";
import { InputStage } from "./components/InputStage";
import { Settings } from "./components/Settings";
import { Modal } from "./components/Modal";
import { BasisEditor } from "./components/BasisEditor";
import { ReviewStage } from "./components/ReviewStage";

export default function App() {
  const { state, dispatch, api, save, run, cancel, reset, notify } =
    useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState("");
  const [index, setIndex] = useState(0);
  const [basis, setBasis] = useState<Basis>({
    question: "",
    claims: [""],
    arguments: [],
  });
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setIndex(Math.max(0, state.rounds.length - 1));
  }, [state.rounds.length]);
  useEffect(() => {
    if (state.extracted) setBasis(state.extracted);
  }, [state.extracted]);
  const round = state.rounds[index];
  const latest = state.rounds.at(-1);
  const running =
    state.job?.status === "running" || state.job?.status === "queued";
  const progress = running
    ? state.job?.type === "extract"
      ? 1
      : state.job?.type === "recheck"
        ? 3
        : 2
    : state.phase === "input"
      ? 0
      : state.phase === "confirm"
        ? 1
        : latest && latest.no > 1
          ? 3
          : 2;
  const steps = ["输入论文", "确认研究问题", "逻辑与表达审查", "修改后复查"];
  const newReview = () => {
    setModal("new");
    setDrawer(false);
  };
  const confirm = async () => {
    if (state.credentials.status !== "ok") {
      setModal("settings");
      return;
    }
    try {
      await save({
        confirmed: { ...basis, claims: basis.claims.filter((c) => c.trim()) },
      });
      await run("review");
    } catch {
      /* 工作区已展示失败原因。 */
    }
  };
  const openReport = async () => {
    if (!round) return;
    const result = await api.request<{ text: string }>(
      `/rounds/${round.roundId}/report`,
    );
    setReport(result.text);
    setCopied(false);
    setModal("report");
  };
  const side = (
    <>
      <div className="brand">
        <span className="brand-mark">
          <Scale size={20} />
        </span>
        {!collapsed && (
          <div>
            <strong>法学论衡</strong>
            <small>法学论文审查助手</small>
          </div>
        )}
        <button
          className="icon-button sidebar-collapse"
          aria-label="收起侧栏"
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeft size={17} />
        </button>
      </div>
      <div className="sidebar-actions">
        <button
          className="new-button"
          aria-label="新建审查"
          onClick={newReview}
        >
          <Plus size={18} />
          {!collapsed && "新建审查"}
        </button>
        <button
          className="nav-button"
          aria-label="查重率检测"
          onClick={() => {
            setModal("dup");
            setDrawer(false);
          }}
        >
          <Files size={17} />
          {!collapsed && "查重率检测"}
        </button>
        <button
          className="nav-button"
          aria-label="AI 率检测"
          onClick={() => {
            setModal("ai");
            setDrawer(false);
          }}
        >
          <ScanText size={17} />
          {!collapsed && "AI 率检测"}
        </button>
      </div>
      {!collapsed && (
        <div className="recent">
          <p>当前会话</p>
          <button className="recent-item" title={state.workspace.title}>
            {state.workspace.title || "新的论文审查"}
            <span>
              {state.rounds.length
                ? `${state.rounds.length} 轮审查记录`
                : "等待输入论文"}
            </span>
          </button>
          <div className="sidebar-tip">
            <BookOpen size={17} />
            <p>从一个清晰的研究问题开始，让每一步判断都回到原文。</p>
          </div>
        </div>
      )}
      <div className="sidebar-bottom">
        <button
          className="nav-button"
          aria-label="设置"
          onClick={() => setModal("settings")}
        >
          <Settings2 size={17} />
          {!collapsed && "设置"}
          <span
            className={`dot ${state.credentials.status === "ok" ? "connected" : ""}`}
          />
        </button>
        {!collapsed && <small>当前会话 · 浏览器工作区</small>}
      </div>
    </>
  );
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className={`sidebar ${drawer ? "drawer-open" : ""}`}>{side}</aside>
      {drawer && (
        <button
          className="drawer-overlay"
          aria-label="关闭菜单"
          onClick={() => setDrawer(false)}
        />
      )}
      <main className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开菜单"
            onClick={() => {
              setCollapsed(false);
              setDrawer(true);
            }}
          >
            <PanelLeft size={18} />
          </button>
          <div className="topbar-title">
            {state.phase === "input" ? "论文审查工作台" : state.workspace.title}
          </div>
          <div className="stepper">
            <div>
              {steps.map((step, i) => (
                <span
                  key={step}
                  className={
                    i === progress ? "current" : i < progress ? "done" : ""
                  }
                />
              ))}
            </div>
            <span>
              {progress + 1}/4 <b>{steps[progress]}</b>
            </span>
          </div>
          {state.phase === "review" && (
            <div className="topbar-actions">
              <button
                className="secondary"
                aria-label="审查依据"
                disabled={state.busy || index !== state.rounds.length - 1}
                onClick={() => {
                  setBasis(structuredClone(state.workspace.confirmed!));
                  setModal("basis");
                }}
              >
                <BookOpen size={14} />
                <span>审查依据</span>
              </button>
              <button
                className="secondary"
                aria-label="复制报告"
                onClick={() => void openReport().catch(notify)}
              >
                <Copy size={14} />
                <span>复制报告</span>
              </button>
              <button
                className="primary"
                aria-label="修改后复查"
                disabled={
                  state.busy || !latest || !isDirty(state.workspace, latest)
                }
                onClick={() => {
                  if (state.credentials.status !== "ok") setModal("settings");
                  else void run("recheck");
                }}
              >
                <RotateCw size={14} />
                <span>修改后复查</span>
              </button>
            </div>
          )}
        </header>
        {state.error && (
          <div className="error-banner" role="alert">
            <span>{state.error}</span>
            {state.job?.status === "failed" &&
              state.job.error?.retryable &&
              state.job.type !== "parse" && (
                <button
                  onClick={() =>
                    void run(state.job!.type, undefined, state.job!.id)
                  }
                >
                  重试任务
                </button>
              )}
            {running && !state.busy && (
              <button
                onClick={() =>
                  void run(state.job!.type, undefined, undefined, state.job!.id)
                }
              >
                恢复任务连接
              </button>
            )}
            <button
              className="text-button"
              onClick={() => setModal("settings")}
            >
              检查模型配置
            </button>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => dispatch({ error: "" })}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {running && (
          <div className="job-banner" role="status">
            <LoaderCircle size={17} className="spin" />
            <span>{state.job?.stage}</span>
            <small>正在处理，请保留当前页面</small>
            <button
              className="text-button ml-auto"
              onClick={() => void cancel().catch(notify)}
            >
              取消任务
            </button>
          </div>
        )}
        <div className="main-content">
          {state.phase === "input" && (
            <InputStage
              key={state.workspace.workspaceId}
              onSettings={() => setModal("settings")}
            />
          )}
          {state.phase === "confirm" && (
            <div className="confirm-page">
              <div className="eyebrow">
                <Check size={14} />
                研究问题与核心观点已提取
              </div>
              <h1>先确认，我们在审查什么。</h1>
              <p className="muted">
                请核对以下信息。确认后的内容将成为逻辑与表达审查的依据。
              </p>
              <div className="confirm-card">
                <BasisEditor value={basis} onChange={setBasis} />
                <footer>
                  <button
                    className="secondary"
                    disabled={state.busy}
                    onClick={() => dispatch({ phase: "input" })}
                  >
                    修改原文
                  </button>
                  <span>第 1—{state.workspace.paragraphs.length} 段</span>
                  <button
                    className="primary"
                    disabled={
                      state.busy ||
                      !basis.question.trim() ||
                      !basis.claims.some((c) => c.trim())
                    }
                    onClick={() => void confirm()}
                  >
                    确认并开始审查
                    <ArrowRight size={15} />
                  </button>
                </footer>
              </div>
            </div>
          )}
          {state.phase === "review" && round && (
            <ReviewStage index={index} onIndex={setIndex} />
          )}
        </div>
      </main>
      {modal === "settings" && <Settings onClose={() => setModal("")} />}
      {modal === "basis" && (
        <Modal
          title="审查依据"
          subtitle="修改后的信息将用于下一轮复查"
          onClose={() => setModal("")}
        >
          <div className="modal-body">
            <BasisEditor value={basis} onChange={setBasis} />
          </div>
          <footer className="modal-footer">
            <button className="secondary" onClick={() => setModal("")}>
              取消
            </button>
            <button
              className="primary"
              disabled={
                state.busy ||
                !basis.question.trim() ||
                !basis.claims.some((c) => c.trim())
              }
              onClick={() =>
                void save({ confirmed: basis })
                  .then(() => setModal(""))
                  .catch(() => {})
              }
            >
              保存
            </button>
          </footer>
        </Modal>
      )}
      {modal === "new" && (
        <Modal
          title="新建审查？"
          subtitle="当前工作区的论文、结果和轮次记录将被删除，API 配置保留。"
          onClose={() => setModal("")}
        >
          <footer className="modal-footer">
            <button className="secondary" onClick={() => setModal("")}>
              取消
            </button>
            <button
              className="danger"
              onClick={() =>
                void reset()
                  .then(() => setModal(""))
                  .catch(notify)
              }
            >
              删除并新建
            </button>
          </footer>
        </Modal>
      )}
      {modal === "report" && (
        <Modal
          title="复制审查报告"
          subtitle={`第 ${round?.no} 轮 · 包含审查范围、问题及复查结果`}
          onClose={() => setModal("")}
        >
          <pre className="report-text">{report}</pre>
          <footer className="modal-footer">
            <small>
              <ShieldCheck size={13} />
              报告排除 API Key 等凭据
            </small>
            <button
              className="primary"
              onClick={() =>
                void copyText(report)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  })
                  .catch(notify)
              }
            >
              {copied ? "已复制" : "复制全文"}
            </button>
          </footer>
        </Modal>
      )}
      {(modal === "dup" || modal === "ai") && (
        <Modal
          title={modal === "dup" ? "查重率检测" : "AI 率检测"}
          subtitle="独立检测服务"
          onClose={() => setModal("")}
        >
          <div className="modal-body">
            <div className="empty-state">
              <ShieldCheck size={32} />
              <h3>
                {state.workspace.paragraphs.length
                  ? "检测服务待接入"
                  : "请先粘贴论文片段"}
              </h3>
              <p>
                {modal === "dup"
                  ? "文字重复情况需要授权文献比对服务及数据库。"
                  : "AI 生成特征概率受文体、长度与人工修改影响，需要经过评估的检测服务。"}
              </p>
              <p>服务来源与指标将在供应商接入后展示。</p>
              {state.workspace.paragraphs.length > 0 && (
                <span className="tag">
                  当前范围 · {state.workspace.paragraphs.length} 段 ·{" "}
                  {countText(
                    state.workspace.paragraphs.map((p) => p.text).join(""),
                  )}{" "}
                  字
                </span>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

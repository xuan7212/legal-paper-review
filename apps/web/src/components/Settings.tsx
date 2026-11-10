import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  MODELS,
  type Model,
  type CredentialStatus,
} from "../../../../packages/shared/src/domain";
import { useWorkspace } from "../state";
import { Modal } from "./Modal";

export function Settings({ onClose }: { onClose: () => void }) {
  const { api, state, dispatch } = useWorkspace();
  const [tab, setTab] = useState("api");
  const [key, setKey] = useState("");
  const [model, setModel] = useState<Model>(state.credentials.model);
  const [reveal, setReveal] = useState(false);
  const [visible, setVisible] = useState("");
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!reveal) {
      setVisible("");
      return;
    }
    const timer = setTimeout(() => {
      setReveal(false);
      setVisible("");
    }, 10000);
    return () => clearTimeout(timer);
  }, [reveal]);
  const runTest = async () => {
    setTesting(true);
    setMessage("正在向 DeepSeek 发送测试消息……");
    try {
      const credential = await api.request<CredentialStatus>(
        "/credentials/test",
        {
          method: "POST",
          body: JSON.stringify({ key: key || undefined, model }),
        },
      );
      dispatch({ credentials: credential });
      setKey("");
      setVisible("");
      setReveal(false);
      setMessage("连接成功，密钥与所选模型可用。");
    } catch (error) {
      setMessage((error as Error).message);
      dispatch({ credentials: { status: "unconfigured", model, masked: "" } });
    } finally {
      setTesting(false);
    }
  };
  const clear = async () => {
    await api.request("/credentials", { method: "DELETE" });
    dispatch({ credentials: { status: "unconfigured", model, masked: "" } });
    setKey("");
    setVisible("");
    setReveal(false);
    setMessage("密钥已清除");
  };
  const toggleReveal = async () => {
    if (reveal) {
      setReveal(false);
      return;
    }
    if (!key && state.credentials.status === "ok") {
      const data = await api.request<{ key: string }>("/credentials/reveal", {
        method: "POST",
      });
      setVisible(data.key);
    }
    setReveal(true);
  };
  const seconds = Math.max(
    0,
    Math.floor(((state.credentials.expiresAt || 0) - now) / 1000),
  );
  return (
    <Modal title="设置" subtitle="配置仅在本次会话内有效" onClose={onClose}>
      <div className="settings-tabs">
        <button aria-selected={tab === "api"} onClick={() => setTab("api")}>
          模型与 API 配置
        </button>
        <button
          aria-selected={tab === "detect"}
          onClick={() => setTab("detect")}
        >
          检测服务凭据
        </button>
      </div>
      <div className="modal-body space-y-5">
        {tab === "detect" ? (
          <div className="empty-state">
            <ShieldCheck size={32} />
            <h3>检测服务待接入</h3>
            <p>
              查重率与 AI 生成特征检测的供应商待确认，接入后在此单独配置凭据。
            </p>
          </div>
        ) : (
          <>
            <div className="service-card">
              <div className="service-logo">D</div>
              <div>
                <strong>DeepSeek</strong>
                <p>https://api.deepseek.com</p>
              </div>
              <span className="tag">应用预设</span>
            </div>
            <fieldset>
              <legend>模型</legend>
              <div className="model-grid">
                {MODELS.map((value) => (
                  <button
                    key={value}
                    className={`model-card ${model === value ? "selected" : ""}`}
                    onClick={() => setModel(value)}
                    disabled={testing}
                  >
                    <strong>
                      {value}
                      {model === value && <Check size={16} />}
                    </strong>
                    <p>
                      {value === "deepseek-chat"
                        ? "通用对话，适合日常审查"
                        : "深度推理，适合复杂论证"}
                    </p>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="field-label">
              API Key
              <div className="key-field">
                <KeyRound size={16} />
                <input
                  aria-label="API Key"
                  type={reveal ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={state.credentials.masked || "sk-..."}
                  value={key || visible}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setVisible("");
                  }}
                  disabled={testing}
                />
                <button
                  className="icon-button"
                  aria-label={reveal ? "隐藏密钥" : "临时查看密钥"}
                  onClick={() => {
                    void toggleReveal().catch((e) => setMessage(e.message));
                  }}
                >
                  {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <div className="flex-row">
              <button
                className="primary"
                disabled={
                  testing || (!key && state.credentials.status !== "ok")
                }
                onClick={() => void runTest()}
              >
                {testing ? "验证中…" : "测试连接"}
              </button>
              <button
                className="secondary"
                onClick={() => void clear().catch((e) => setMessage(e.message))}
              >
                <Trash2 size={14} />
                清除
              </button>
              <span className="muted">输入新密钥可替换当前配置</span>
            </div>
            <p
              role="status"
              className={
                state.credentials.status === "ok" ? "success-text" : "muted"
              }
            >
              {message ||
                (state.credentials.status === "ok"
                  ? "已连接"
                  : "待配置，测试成功后即可审查")}
            </p>
            {state.credentials.status === "ok" && (
              <p className="small">
                会话剩余 {Math.floor(seconds / 3600)} 小时{" "}
                {Math.floor((seconds % 3600) / 60)} 分 {seconds % 60} 秒
              </p>
            )}
            <div className="notice">
              <ShieldCheck size={18} />
              <p>
                密钥通过加密连接提交服务端并保存在会话内存，2
                小时后清除。论文与记录仅用于当前会话。关闭或刷新页面将重置工作区，遗留服务端会话最多保留至最后有效操作后
                2 小时。
              </p>
            </div>
          </>
        )}
      </div>
      <footer className="modal-footer">
        <button className="primary" onClick={onClose}>
          返回工作台
        </button>
      </footer>
    </Modal>
  );
}

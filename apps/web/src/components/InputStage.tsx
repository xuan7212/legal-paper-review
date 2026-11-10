import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  FileUp,
  SlidersHorizontal,
  Sparkles,
  ShieldCheck,
  FileText,
  X,
  ArrowRight,
} from "lucide-react";
import {
  countText,
  paragraphsFrom,
} from "../../../../packages/shared/src/domain";
import { example } from "../../../../packages/shared/src/example";
import { useWorkspace } from "../state";

export function InputStage({ onSettings }: { onSettings: () => void }) {
  const { state, save, run, notify } = useWorkspace();
  const [text, setText] = useState(
    state.workspace.paragraphs.map((p) => p.text).join("\n\n"),
  );
  const [title, setTitle] = useState(state.workspace.title);
  const [question, setQuestion] = useState(state.workspace.question);
  const [outline, setOutline] = useState(state.workspace.outline);
  const [refs, setRefs] = useState(state.workspace.refs);
  const [background, setBackground] = useState(false);
  const [file, setFile] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const count = countText(text);
  const valid = count >= 1500 && count <= 5000;
  useEffect(() => {
    if (
      state.job?.type === "parse" &&
      state.job.status === "succeeded" &&
      state.job.result
    ) {
      const result = state.job.result as { text: string; filename: string };
      setText(result.text);
      setFile(result.filename);
      setTitle((previous) =>
        previous.trim() ? previous : result.filename.replace(/\.[^.]+$/, ""),
      );
    }
  }, [state.job]);
  const submit = async () => {
    if (!valid || state.busy || !state.ready) return;
    if (state.credentials.status !== "ok") {
      onSettings();
      return;
    }
    try {
      await save({
        title: title.trim() || "未命名论文片段",
        paragraphs: paragraphsFrom(text),
        question,
        outline,
        refs,
        confirmed: null,
      });
      await run("extract");
    } catch {
      /* 保存错误由工作区统一展示，输入草稿继续保留。 */
    }
  };
  const useExample = () => {
    setText(example.text);
    setTitle(example.title);
    setOutline(example.outline);
    setFile("");
  };
  const upload = async (selected?: File) => {
    if (!selected || state.busy || !state.ready) return;
    if (selected.size > 20 * 1024 * 1024) {
      notify(new Error("文件超过 20 MB，请拆分后上传"));
      return;
    }
    setFile(selected.name);
    const form = new FormData();
    form.append("file", selected);
    const result = (await run("parse", form)) as
      | { text: string; filename: string }
      | undefined;
    if (result) {
      setText(result.text);
      if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    } else setFile("");
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  return (
    <div className="input-page">
      <div className="intro">
        <div className="eyebrow">
          <span />
          写作之后，再推敲一步
        </div>
        <h1>
          让论证更经得起推敲<span>。</span>
        </h1>
        <p>提交导师前，梳理研究问题，找出论证缺口，完成有依据的修改。</p>
      </div>
      <section className="example-card">
        <div className="example-heading">
          <span>
            <Sparkles size={16} />
            一次完整的论文自查
          </span>
          <button
            className="text-button"
            onClick={useExample}
            disabled={state.busy || !state.ready}
          >
            用此示例开始 <ArrowRight size={15} />
          </button>
        </div>
        <h3>算法推荐场景下的单独同意规则</h3>
        <p>
          “三份判决”能支撑“司法实践普遍忽视”吗？先确认研究问题，再沿着原文逐项检查。
        </p>
        <div className="example-flow">
          <span>提交片段</span>
          <ArrowRight size={14} />
          <span>确认审查依据</span>
          <ArrowRight size={14} />
          <span>定位与修改</span>
          <ArrowRight size={14} />
          <span>逐项复查</span>
        </div>
      </section>
      <section
        className={`composer ${dragging ? "dragging" : ""}`}
        aria-label="论文输入"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files[0]);
        }}
      >
        {background && (
          <div className="background-panel">
            <div className="flex-row">
              <h3>背景信息</h3>
              <small>均为可选，帮助理解论文片段</small>
              <button
                className="icon-button ml-auto"
                aria-label="收起背景信息"
                onClick={() => setBackground(false)}
              >
                <X size={16} />
              </button>
            </div>
            <input
              aria-label="论文题目"
              placeholder="论文题目"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              aria-label="背景研究问题"
              placeholder="研究问题"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <textarea
              aria-label="论文提纲"
              placeholder="论文提纲"
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
            />
            <textarea
              aria-label="引用材料"
              placeholder="相关法条、判决要点或文献摘录"
              value={refs}
              onChange={(e) => setRefs(e.target.value)}
            />
          </div>
        )}
        {file && (
          <div className="file-chip">
            <FileText size={18} />
            <span>{file}</span>
            <button
              className="icon-button"
              aria-label="移除文件"
              onClick={() => {
                setFile("");
                setText("");
              }}
              disabled={state.busy || !state.ready}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {!background && title && (
          <button className="title-chip" onClick={() => setBackground(true)}>
            {title}
          </button>
        )}
        <textarea
          className="paper-input"
          aria-label="论文正文"
          placeholder="粘贴论文片段，或拖入 PDF / Word 文件……"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={state.busy || !state.ready}
        />
        <div className="composer-actions">
          <input
            ref={input}
            type="file"
            hidden
            disabled={!state.ready || state.busy}
            accept=".pdf,.doc,.docx,.txt,.md"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            className="tool-button"
            aria-label="上传文件"
            disabled={state.busy || !state.ready}
            onClick={() => input.current?.click()}
          >
            <FileUp size={16} />
            <span>上传文件</span>
          </button>
          <button
            aria-label="背景信息"
            className={`tool-button ${background ? "active" : ""}`}
            onClick={() => setBackground(!background)}
          >
            <SlidersHorizontal size={16} />
            <span>背景信息</span>
          </button>
          <button
            className="tool-button"
            aria-label="示例片段"
            disabled={state.busy || !state.ready}
            onClick={useExample}
          >
            <Sparkles size={16} />
            <span>示例片段</span>
          </button>
          <div className="composer-spacer" />
          <button className="model-button" onClick={onSettings}>
            <span
              className={
                state.credentials.status === "ok" ? "dot connected" : "dot"
              }
            />
            {state.credentials.status === "ok"
              ? state.credentials.model
              : "模型待配置"}
          </button>
          <button
            className="send-button"
            aria-label="开始审查"
            title="开始审查（⌘ / Ctrl + Enter）"
            disabled={!valid || state.busy || !state.ready}
            onClick={() => void submit()}
          >
            <ArrowUp size={21} />
          </button>
        </div>
      </section>
      <div className="input-meta">
        <span className={count > 0 && !valid ? "warning-text" : ""}>
          {count.toLocaleString()} 字 · {paragraphsFrom(text).length} 段 · 建议
          1500—5000 字
        </span>
        <span>单文件最大 20 MB</span>
      </div>
      <p className="privacy-line">
        <ShieldCheck size={14} />
        送审文本将发送至 DeepSeek。当前会话使用，刷新或关闭页面后重置。
      </p>
    </div>
  );
}

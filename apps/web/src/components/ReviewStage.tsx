import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Edit3,
  FileCheck2,
  ListChecks,
  MessageSquare,
  LocateFixed,
  Copy,
} from "lucide-react";
import {
  anchorMatches,
  resolveAnchor,
  type Issue,
  type Paragraph,
  type Round,
} from "../../../../packages/shared/src/domain";
import { useWorkspace } from "../state";
import { copyText } from "../api";

function ParagraphEditor({
  paragraph,
  index,
  issues,
  selected,
  editable,
  onSelect,
}: {
  paragraph: Paragraph;
  index: number;
  issues: Issue[];
  selected: string;
  editable: boolean;
  onSelect: (id: string) => void;
}) {
  const { state, save } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(paragraph.text);
  const ranges = issues.flatMap((issue) =>
    issue.anchors
      .filter(
        (a) => a.paragraphId === paragraph.id && anchorMatches(a, [paragraph]),
      )
      .map((a) => ({ ...a, issue })),
  );
  ranges.sort((a, b) => a.start! - b.start!);
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (const range of ranges) {
    if (range.start! < end) continue;
    parts.push(paragraph.text.slice(end, range.start));
    parts.push(
      <mark
        key={`${range.issue.id}-${range.start}`}
        className={`${range.issue.kind} ${selected === range.issue.id ? "selected" : ""}`}
        onClick={() => onSelect(range.issue.id)}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(range.issue.id);
        }}
      >
        {range.quote}
      </mark>,
    );
    end = range.end!;
  }
  parts.push(paragraph.text.slice(end));
  const submit = async () => {
    try {
      await save({
        paragraphs: state.workspace.paragraphs.map((p) =>
          p.id === paragraph.id ? { ...p, text: draft.trim() } : p,
        ),
      });
      setEditing(false);
    } catch {
      /* 保留正在编辑的草稿。 */
    }
  };
  return (
    <section
      className={`paper-paragraph ${ranges.some((r) => r.issue.id === selected) ? "related" : ""}`}
      id={`paragraph-${paragraph.id}`}
    >
      <span className="paragraph-number">{index + 1}</span>
      {editing ? (
        <>
          <textarea
            aria-label={`编辑第 ${index + 1} 段`}
            className="paragraph-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex-row justify-end">
            <button className="secondary" onClick={() => setEditing(false)}>
              取消
            </button>
            <button
              className="primary"
              disabled={state.busy || !draft.trim()}
              onClick={() => void submit()}
            >
              保存段落
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{parts}</p>
          {editable && (
            <button
              className="paragraph-edit"
              aria-label={`编辑第 ${index + 1} 段`}
              onClick={() => {
                setDraft(paragraph.text);
                setEditing(true);
              }}
            >
              <Edit3 size={13} /> 编辑
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function ReviewStage({
  index,
  onIndex,
}: {
  index: number;
  onIndex: (index: number) => void;
}) {
  const { state, save, notify } = useWorkspace();
  const round = state.rounds[index];
  const latest = index === state.rounds.length - 1;
  const paragraphs = latest ? state.workspace.paragraphs : round.paragraphs;
  const materials = latest ? state.workspace.materials : round.materials;
  const feedback = latest ? state.workspace.feedback : round.feedback;
  const [tab, setTab] = useState("logic");
  const [filter, setFilter] = useState("全部");
  const [selected, setSelected] = useState("");
  const [mobile, setMobile] = useState("text");
  const issues = useMemo(
    () =>
      round.issues.map((issue) => ({
        ...issue,
        anchors: issue.anchors.map((a) => {
          try {
            return resolveAnchor(a, paragraphs);
          } catch {
            return { ...a, start: undefined, end: undefined };
          }
        }),
      })),
    [round, paragraphs],
  );
  const visibleIssues = issues
    .filter((i) => i.kind === tab)
    .filter(
      (i) =>
        filter === "全部" ||
        (filter === "未解决"
          ? round.results[i.id]?.state !== "已解决"
          : i.priority === filter),
    )
    .sort(
      (a, b) =>
        ["高", "中", "低"].indexOf(a.priority) -
        ["高", "中", "低"].indexOf(b.priority),
    );
  const selectCard = (id: string) => {
    setSelected(id === selected ? "" : id);
    const paragraph = issues.find((i) => i.id === id)?.anchors[0].paragraphId;
    document
      .getElementById(`paragraph-${paragraph}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const selectText = (id: string) => {
    setSelected(id);
    setTab(issues.find((i) => i.id === id)!.kind);
    setFilter("全部");
    setMobile("cards");
    setTimeout(
      () =>
        document
          .getElementById(`issue-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      50,
    );
  };
  const replace = async (issue: Issue) => {
    const anchor = issue.anchors[0];
    if (
      !latest ||
      !anchorMatches(anchor, paragraphs) ||
      issue.reference === undefined
    )
      return;
    try {
      await save({
        paragraphs: paragraphs.map((p) =>
          p.id === anchor.paragraphId
            ? {
                ...p,
                text:
                  p.text.slice(0, anchor.start) +
                  issue.reference +
                  p.text.slice(anchor.end),
              }
            : p,
        ),
      });
    } catch {
      /* 保持当前工作副本。 */
    }
  };
  const toggleMaterial = (id: string) => {
    void save({
      materials: materials.map((m) =>
        m.id === id ? { ...m, done: !m.done } : m,
      ),
    }).catch(() => {});
  };
  const changeFeedback = (
    id: string,
    value?: "有帮助" | "判断不成立" | "暂不处理",
    reason = "",
  ) => {
    const next = { ...feedback };
    if (value) next[id] = { value, reason };
    else delete next[id];
    void save({ feedback: next }).catch(() => {});
  };
  return (
    <div className="review-layout">
      <div
        className={`manuscript ${mobile === "text" ? "mobile-visible" : ""}`}
      >
        <div className="manuscript-inner">
          <div className="review-summary">
            <p>
              <FileCheck2 size={15} />第 {round.no} 轮
              {round.no > 1 ? "复查" : "审查"}完成 · 依据已确认的研究问题
            </p>
            {round.no > 1 ? (
              <div className="summary-grid three">
                {["已解决", "仍需补充", "需重新判断"].map((status) => (
                  <div key={status}>
                    <strong>
                      {
                        Object.values(round.results).filter(
                          (r) => r.state === status,
                        ).length
                      }
                    </strong>
                    <span>{status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="summary-grid">
                <div>
                  <strong>
                    {issues.filter((i) => i.kind === "logic").length}
                  </strong>
                  <span>论证问题</span>
                </div>
                <div>
                  <strong className="warning-text">
                    {issues.filter((i) => i.priority === "高").length}
                  </strong>
                  <span>高优先级</span>
                </div>
                <div>
                  <strong>
                    {issues.filter((i) => i.kind === "expression").length}
                  </strong>
                  <span>表达修改</span>
                </div>
                <div>
                  <strong>{materials.length}</strong>
                  <span>待补材料</span>
                </div>
              </div>
            )}
            {!issues.length && (
              <p>未发现明显的论证或表达问题，请结合导师意见复核。</p>
            )}
          </div>
          <h1>{round.title}</h1>
          <div className="paper-meta">
            第 {round.no} 轮 · {paragraphs.length} 段 ·{" "}
            {new Date(round.createdAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            <span>{latest ? "悬停或点击段落即可编辑" : "历史版本 · 只读"}</span>
          </div>
          <div className="round-picker">
            {state.rounds.map((r, i) => (
              <button
                key={r.roundId}
                aria-pressed={i === index}
                onClick={() => {
                  onIndex(i);
                  setSelected("");
                }}
              >
                第 {r.no} 轮
              </button>
            ))}
          </div>
          {paragraphs.map((paragraph, i) => (
            <ParagraphEditor
              key={`${round.roundId}-${paragraph.id}`}
              paragraph={paragraph}
              index={i}
              issues={issues.filter(
                (issue) => round.results[issue.id]?.state !== "已解决",
              )}
              selected={selected}
              editable={latest && !state.busy}
              onSelect={selectText}
            />
          ))}
        </div>
      </div>
      <aside
        className={`review-panel ${mobile === "cards" ? "mobile-visible" : ""}`}
      >
        <div className="panel-tabs">
          {[
            [
              "logic",
              "论证问题",
              issues.filter((i) => i.kind === "logic").length,
            ],
            [
              "expression",
              "表达修改",
              issues.filter((i) => i.kind === "expression").length,
            ],
            [
              "materials",
              "待补材料",
              `${materials.filter((m) => m.done).length}/${materials.length}`,
            ],
          ].map(([value, label, count]) => (
            <button
              key={value}
              aria-selected={tab === value}
              onClick={() => {
                setTab(String(value));
                setFilter("全部");
              }}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        {tab !== "materials" && (
          <div className="filters">
            {[
              "全部",
              "高",
              "中",
              "低",
              ...(round.no > 1 ? ["未解决"] : []),
            ].map((value) => (
              <button
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {value.length === 1 ? `${value}优先级` : value}
              </button>
            ))}
          </div>
        )}
        <div className="cards-scroll">
          {tab === "materials" ? (
            <>
              <div className="task-summary">
                <ListChecks size={18} />
                <strong>修改任务清单</strong>
                <span>
                  {materials.filter((m) => m.done).length} / {materials.length}
                </span>
                <progress
                  value={materials.filter((m) => m.done).length}
                  max={materials.length || 1}
                />
              </div>
              {materials.length === 0 && (
                <div className="empty-state">暂无待补材料</div>
              )}
              {materials.map((material) => (
                <div className="issue-card material-card" key={material.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={material.done}
                      disabled={!latest || state.busy}
                      onChange={() => toggleMaterial(material.id)}
                    />
                    <span>
                      {material.text}
                      {material.external && (
                        <small className="warning-text">需外部核验</small>
                      )}
                    </span>
                  </label>
                  {material.issueIds.map((id) => (
                    <button
                      key={id}
                      className="text-button"
                      onClick={() => {
                        setTab(
                          issues.find((i) => i.id === id)?.kind || "logic",
                        );
                        setFilter("全部");
                        selectCard(id);
                      }}
                    >
                      {issues.find((i) => i.id === id)?.type} ↗
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <>
              {visibleIssues.length === 0 && (
                <div className="empty-state">当前筛选条件下没有问题</div>
              )}
              {visibleIssues.map((issue) => (
                <article
                  key={issue.id}
                  id={`issue-${issue.id}`}
                  className={`issue-card ${selected === issue.id ? "open" : ""}`}
                >
                  <button
                    className="issue-toggle"
                    onClick={() => selectCard(issue.id)}
                    aria-expanded={selected === issue.id}
                  >
                    <div className="issue-labels">
                      <span className="type-tag">{issue.type}</span>
                      <span
                        className={`status-tag ${issue.status === "论证待补充" ? "amber" : ""}`}
                      >
                        {issue.status}
                      </span>
                      <span className={`priority priority-${issue.priority}`}>
                        {issue.priority}优先级
                      </span>
                    </div>
                    <h3>
                      {issue.title}
                      <ChevronDown size={15} />
                    </h3>
                    <small>
                      {issue.anchors
                        .map(
                          (a) =>
                            `¶${paragraphs.findIndex((p) => p.id === a.paragraphId) + 1}`,
                        )
                        .join(" · ")}
                    </small>
                  </button>
                  {round.results[issue.id] && (
                    <div
                      className={`result-strip ${round.results[issue.id].state === "已解决" ? "resolved" : ""}`}
                    >
                      <strong>{round.results[issue.id].state}</strong>
                      <span>{round.results[issue.id].reason}</span>
                    </div>
                  )}
                  {selected === issue.id && (
                    <div className="issue-details">
                      {issue.anchors.map((anchor, a) => (
                        <button
                          className="quote"
                          key={a}
                          onClick={() => {
                            setMobile("text");
                            setTimeout(
                              () =>
                                document
                                  .getElementById(
                                    `paragraph-${anchor.paragraphId}`,
                                  )
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  }),
                              40,
                            );
                          }}
                        >
                          <small>
                            <LocateFixed size={12} />第{" "}
                            {paragraphs.findIndex(
                              (p) => p.id === anchor.paragraphId,
                            ) + 1}{" "}
                            段 ·{" "}
                            {anchorMatches(anchor, paragraphs)
                              ? "引用已与原文核对"
                              : "原文已修改或定位待核对"}
                          </small>
                          <p>“{anchor.quote}”</p>
                        </button>
                      ))}
                      <section>
                        <small>问题说明</small>
                        <p>{issue.explanation}</p>
                      </section>
                      <section>
                        <small>判断依据</small>
                        <p>{issue.basis}</p>
                      </section>
                      {issue.status === "外部材料待核验" && (
                        <p className="notice">
                          核验状态为未核验，请补充出处后核对原始材料。
                        </p>
                      )}
                      <section>
                        <small>修改方向</small>
                        <p>{issue.suggestion}</p>
                      </section>
                      {issue.legalCheck && (
                        <p className="legal-check">
                          需核对法律含义 · {issue.legalCheck}
                        </p>
                      )}
                      {issue.reference !== undefined && (
                        <section className="reference">
                          <small>参考表述</small>
                          <p>{issue.reference || "建议删除该表述"}</p>
                          <div className="flex-row">
                            <button
                              className="primary small-button"
                              disabled={
                                !latest ||
                                state.busy ||
                                !anchorMatches(issue.anchors[0], paragraphs)
                              }
                              onClick={() => void replace(issue)}
                            >
                              <Check size={13} />
                              {issue.kind === "expression"
                                ? "采纳建议句"
                                : issue.reference
                                  ? "替换原句"
                                  : "删除该表述"}
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                void copyText(issue.reference || "").catch(
                                  notify,
                                )
                              }
                            >
                              <Copy size={13} />
                              复制
                            </button>
                          </div>
                        </section>
                      )}
                      {materials
                        .filter((m) => issue.materialIds.includes(m.id))
                        .map((m) => (
                          <label className="linked-material" key={m.id}>
                            <input
                              type="checkbox"
                              checked={m.done}
                              disabled={!latest || state.busy}
                              onChange={() => toggleMaterial(m.id)}
                            />
                            <span>{m.text}</span>
                          </label>
                        ))}
                      <div className="feedback">
                        <small>
                          <MessageSquare size={12} />
                          这条建议
                        </small>
                        <div>
                          {(["有帮助", "判断不成立", "暂不处理"] as const).map(
                            (value) => (
                              <button
                                disabled={!latest || state.busy}
                                key={value}
                                aria-pressed={
                                  feedback[issue.id]?.value === value
                                }
                                onClick={() =>
                                  changeFeedback(
                                    issue.id,
                                    feedback[issue.id]?.value === value
                                      ? undefined
                                      : value,
                                    feedback[issue.id]?.reason,
                                  )
                                }
                              >
                                {value}
                              </button>
                            ),
                          )}
                        </div>
                        {feedback[issue.id] && (
                          <FeedbackReason
                            key={`${issue.id}-${feedback[issue.id].value}`}
                            value={feedback[issue.id].reason}
                            disabled={!latest || state.busy}
                            onSave={(reason) =>
                              changeFeedback(
                                issue.id,
                                feedback[issue.id].value,
                                reason,
                              )
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </aside>
      <nav className="mobile-switch" aria-label="切换审查视图">
        <button
          aria-pressed={mobile === "text"}
          onClick={() => setMobile("text")}
        >
          原文
        </button>
        <button
          aria-pressed={mobile === "cards"}
          onClick={() => setMobile("cards")}
        >
          问题 {issues.length}
        </button>
      </nav>
    </div>
  );
}

function FeedbackReason({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      aria-label="反馈原因"
      placeholder="补充原因（可选，离开输入框时保存）"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}

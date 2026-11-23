import type { Basis } from "../../../../packages/shared/src/domain";

export function BasisEditor({
  value,
  onChange,
}: {
  value: Basis;
  onChange: (value: Basis) => void;
}) {
  return (
    <div className="basis-fields">
      <label className="field-label">
        <span>
          <b>01</b>研究问题
        </span>
        <small>审查将检查论证是否围绕该问题展开</small>
        <textarea
          aria-label="研究问题"
          value={value.question}
          placeholder="用一句话说明本片段要回答的问题"
          onChange={(e) => onChange({ ...value, question: e.target.value })}
        />
      </label>
      <section>
        <h3>
          <b>02</b>核心观点
        </h3>
        <small>用于判断论据是否支持观点、结论是否超出范围</small>
        {value.claims.map((claim, index) => (
          <div className="claim-row" key={index}>
            <textarea
              aria-label={`核心观点 ${index + 1}`}
              value={claim}
              onChange={(e) =>
                onChange({
                  ...value,
                  claims: value.claims.map((c, i) =>
                    i === index ? e.target.value : c,
                  ),
                })
              }
            />
            <button
              className="icon-button"
              aria-label={`删除观点 ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  claims: value.claims.filter((_, i) => i !== index),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="text-button"
          onClick={() => onChange({ ...value, claims: [...value.claims, ""] })}
        >
          ＋ 添加观点
        </button>
      </section>
      <section>
        <h3>
          <b>03</b>主要论据
        </h3>
        <small>请核对论据与对应段落，信息不足时继续标记为待补充</small>
        {value.arguments.map((argument, index) => (
          <div className="argument" key={index}>
            <textarea
              aria-label={`主要论据 ${index + 1}`}
              value={argument.text}
              onChange={(e) =>
                onChange({
                  ...value,
                  arguments: value.arguments.map((a, i) =>
                    i === index ? { ...a, text: e.target.value } : a,
                  ),
                })
              }
            />
            <div className="flex-row">
              <span className="tag">{argument.paragraphIds.join(" · ")}</span>
              {argument.pending && (
                <>
                  <span className="small warning-text">
                    待补充 · {argument.pending}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      onChange({
                        ...value,
                        arguments: value.arguments.map((a, i) =>
                          i === index ? { ...a, pending: undefined } : a,
                        ),
                      })
                    }
                  >
                    已在正文中补充
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

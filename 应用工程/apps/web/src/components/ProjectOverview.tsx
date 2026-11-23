import {
  ArrowRight,
  Check,
  Compass,
  Layers3,
  Scale,
  Target,
} from "lucide-react";
import { Modal } from "./Modal";

export function ProjectOverview({
  onClose,
  onDemo,
}: {
  onClose: () => void;
  onDemo: () => void;
}) {
  return (
    <Modal
      title="项目说明"
      subtitle="法学论衡 · 产品评审与演示指南 · v0.2"
      onClose={onClose}
      wide
    >
      <div className="overview-body">
        <div className="overview-hero">
          <Scale size={28} />
          <span className="release-label">LEGAL REASONING WORKSPACE</span>
          <h3>让每一条修改建议，都有原文可循。</h3>
          <p>
            面向法学本科生与硕士生，帮助作者在初稿提交导师前识别论证缺口、推敲表达，并追踪修改后的处理结果。
          </p>
        </div>
        <div className="overview-grid">
          <section>
            <h3>
              <Target size={17} />
              用户与使用时机
            </h3>
            <p>
              聚焦已有初稿、正在修改的法学学生。以 1500—5000
              字的完整论证片段为单位，结合研究问题、提纲与引用材料开展自查。
            </p>
            <p>
              重点检查概念混用、论据支持范围、前后矛盾与分析层次，再处理歧义、指代与法律措辞。
            </p>
          </section>
          <section>
            <h3>
              <Compass size={17} />
              核心使用流程
            </h3>
            <ol className="overview-steps">
              <li>
                <b>01</b>输入论文，补充背景材料。
              </li>
              <li>
                <b>02</b>作者确认研究问题与核心观点。
              </li>
              <li>
                <b>03</b>定位原文，查看依据并逐段修改。
              </li>
              <li>
                <b>04</b>复查问题，回看轮次并导出报告。
              </li>
            </ol>
          </section>
          <section>
            <h3>
              <Check size={17} />
              当前交付范围
            </h3>
            <p>
              已实现文件解析、DeepSeek
              接口、结构化审查、原文锚点校验、作者反馈、历史快照与报告导出。
            </p>
            <p>
              预设示例可直接体验。真实审查使用自带 API Key。查重率与 AI
              率依赖后续接入的独立检测服务。
            </p>
          </section>
          <section>
            <h3>
              <Layers3 size={17} />
              下一阶段验证
            </h3>
            <p>
              计划邀请 30—40 位本科与硕士用户，先访谈 8 人，再安排 10—12
              人使用真实初稿试用。本页人数为招募计划。
            </p>
            <p>
              对比同一模型的通用提示词，记录问题准确率、关键问题发现率、修改耗时与再次使用情况；专业结论由法学评审人员复核。
            </p>
          </section>
        </div>
        <section className="overview-roadmap">
          <h3>基于验证结果迭代</h3>
          <div>
            <span>当前 · 跑通审查与修改流程</span>
            <ArrowRight size={15} />
            <span>下一步 · 真实用户与专业评审</span>
            <ArrowRight size={15} />
            <span>后续 · 沉淀专项审查 Skill</span>
          </div>
          <p>
            将真实失败案例沉淀为检查规则、参考材料与测试样本，逐项比较新增 Skill
            后的准确性、耗时和成本。
          </p>
        </section>
        <p className="overview-note">
          论文与记录保存在当前会话。请在刷新或关闭页面前导出报告。真实模型的审查效果与账户权限需使用有效密钥和法学样本验证。
        </p>
      </div>
      <footer className="modal-footer">
        <button className="secondary" onClick={onClose}>
          返回工作台
        </button>
        <button className="primary" onClick={onDemo}>
          体验示例演示
          <ArrowRight size={15} />
        </button>
      </footer>
    </Modal>
  );
}

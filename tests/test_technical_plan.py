"""技术方案的产品约束、结构与关键一致性规则检查。"""

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TechnicalPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = (PROJECT_ROOT / "docs" / "技术方案.md").read_text(
            encoding="utf-8"
        )
        cls.product = (PROJECT_ROOT / "产品设计文档.md").read_text(encoding="utf-8")

    def test_plan_has_version_basis_and_implementation_sections(self):
        self.assertIn("版本 v0.1 · Web MVP", self.plan)
        self.assertIn("《产品设计文档》v0.2", self.plan)
        headings = re.findall(r"^## (.+)$", self.plan, flags=re.MULTILINE)
        self.assertEqual(len(headings), 10)
        self.assertEqual(len(headings), len(set(headings)))
        for topic in (
            "方案概览", "整体结构", "前端工作台", "审查 Agent 与执行流程",
            "数据、定位与轮次一致性", "文件解析", "接口与任务恢复",
            "密钥、会话与数据清理", "检测服务与部署", "实施顺序与验证",
        ):
            with self.subTest(topic=topic):
                self.assertTrue(any(heading.endswith(topic) for heading in headings))

    def test_plan_records_agreed_web_stack_and_confirmation_boundary(self):
        for technology in (
            "React", "TypeScript", "Vite", "Tailwind CSS", "Node.js",
            "Fastify", "Zod", "PDF.js", "Mammoth", "DeepSeek",
        ):
            with self.subTest(technology=technology):
                self.assertIn(technology, self.plan)
        self.assertIn("单个受控审查 Agent", self.plan)
        self.assertIn("用户确认后才提交审查任务", self.plan)
        self.assertIn("程序工具负责分段计数、文件解析、原文匹配", self.plan)

    def test_input_models_and_file_formats_align_with_product(self):
        word_range = re.search(r"(\d+—\d+) 字", self.product)
        file_size = re.search(r"单文件上限为 (\d+ MB)", self.product)
        self.assertIsNotNone(word_range)
        self.assertIsNotNone(file_size)
        self.assertIn(word_range.group(1), self.plan)
        self.assertIn(file_size.group(1), self.plan)
        for model in set(re.findall(r"`(deepseek-[^`]+)`", self.product)):
            with self.subTest(model=model):
                self.assertIn(model, self.plan)
        for extension in (".pdf", ".doc", ".docx", ".txt", ".md"):
            with self.subTest(extension=extension):
                self.assertIn(extension, self.product)
                self.assertIn(extension, self.plan)
        self.assertIn("LibreOffice", self.plan)
        self.assertIn("扫描版 PDF", self.plan)

    def test_review_states_and_feedback_align_with_product(self):
        for value in (
            "概念混用", "论据与结论脱节", "前后矛盾", "分析层次混淆",
            "文本内可确认", "论证待补充", "学术争议", "外部材料待核验",
            "已解决", "仍需补充", "需重新判断",
            "有帮助", "判断不成立", "暂不处理",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.product)
                self.assertIn(value, self.plan)

    def test_versioning_and_task_safety_are_specified(self):
        for rule in (
            "RoundSnapshot", "UTF-16", "左闭右开", "revision 乐观校验",
            "Idempotency-Key", "AbortController", "配置代次",
            "实际使用的模型", "历史轮次报告从对应快照生成",
            "轮次仅在全部必要步骤成功后发布",
        ):
            with self.subTest(rule=rule):
                self.assertIn(rule, self.plan)
        endpoints = re.findall(r"^\| ((?:GET|POST|PUT|DELETE) /api/\S+) \|", self.plan, re.MULTILINE)
        self.assertGreater(len(endpoints), 0)
        self.assertEqual(len(endpoints), len(set(endpoints)))

    def test_session_limits_and_new_retention_assumption_are_explicit(self):
        self.assertIn("成功测试后设置 2 小时有效期", self.product)
        self.assertIn("成功测试后有效期为 2 小时", self.plan)
        self.assertIn("重新测试成功后重新计时", self.plan)
        self.assertIn("刷新或关闭页面", self.plan)
        self.assertIn("后端遗留会话的 2 小时清理窗口为本方案提出的初始技术假设", self.plan)
        self.assertIn("服务端到期清理负责处理遗留会话", self.plan)
        self.assertIn("仅在配置代次仍一致时写回", self.plan)

    def test_document_format_and_delivery_validation(self):
        self.assertEqual(self.plan.count("```") % 2, 0)
        table_width = None
        in_code_block = False
        for line_number, line in enumerate(self.plan.splitlines(), start=1):
            if line.startswith("```"):
                in_code_block = not in_code_block
            if not in_code_block and line.startswith("|"):
                width = len(line.split("|"))
                if table_width is None:
                    table_width = width
                self.assertEqual(width, table_width, f"表格第 {line_number} 行列数不一致")
            else:
                table_width = None
        for requirement in (
            "自动化验证", "真实服务联调", "法学背景评审",
            "git log --graph --oneline --decorate --all",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, self.plan)


if __name__ == "__main__":
    unittest.main()

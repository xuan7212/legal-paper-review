"""校验产品设计文档与独立 HTML Demo 的关键约束和实现边界。"""

from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class ProductDesignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.design = (PROJECT_ROOT / "docs" / "产品设计文档.md").read_text(encoding="utf-8")
        cls.demo = (PROJECT_ROOT / "archive" / "法学论文审查助手-Demo.html").read_text(
            encoding="utf-8"
        )

    def test_document_identifies_reference_and_version(self):
        self.assertIn("版本 v0.2", self.design)
        self.assertIn("../archive/法学论文审查助手-Demo.html", self.design)
        self.assertIn("## 八、MVP 验证与待确认事项", self.design)

    def test_input_limits_match_demo(self):
        limits = re.search(r"gn=(\d+),_n=([\de]+)", self.demo)
        self.assertIsNotNone(limits)
        minimum, maximum = (int(float(value)) for value in limits.groups())
        self.assertIn(f"{minimum}—{maximum} 字", self.design)
        self.assertIn("去除空白字符后的字符数", self.design)
        self.assertIn("按换行拆分段落", self.design)

        upload_limit = re.search(r"e\.size>(\d+)\*1024\*1024", self.demo)
        self.assertIsNotNone(upload_limit)
        self.assertIn(f"单文件上限为 {upload_limit.group(1)} MB", self.design)
        accepted = re.search(r"type:`file`,accept:`([^`]+)`", self.demo)
        self.assertIsNotNone(accepted)
        for extension in accepted.group(1).split(","):
            with self.subTest(extension=extension):
                self.assertIn(extension, self.design)

    def test_models_and_expiration_match_demo(self):
        models = set(re.findall(r"id:`(deepseek-[^`]+)`", self.demo))
        self.assertEqual(len(models), 2)
        for model in models:
            with self.subTest(model=model):
                self.assertIn(f"`{model}`", self.design)
        expiration = re.search(r"expiresAt:Date\.now\(\)\+(\d+)\*3600\*1e3", self.demo)
        self.assertIsNotNone(expiration)
        self.assertIn(f"{expiration.group(1)} 小时有效期", self.design)
        self.assertIn("https://api.deepseek.com", self.demo)
        self.assertIn("`https://api.deepseek.com`", self.design)
        self.assertIn("重新测试成功后重新计时", self.design)

    def test_navigation_and_review_controls_are_documented(self):
        controls = (
            "新建审查", "查重率检测", "AI 率检测", "背景信息", "示例片段",
            "确认并开始审查", "审查依据", "论证问题", "表达修改", "待补材料",
            "未解决", "替换原句", "删除该表述", "采纳建议句", "修改后复查",
            "有帮助", "判断不成立", "暂不处理", "复制全文", "删除并新建",
        )
        for control in controls:
            with self.subTest(control=control):
                self.assertIn(f"`{control}`", self.demo)
                self.assertIn(control, self.design)
        self.assertIn("历史文本为只读", self.design)
        self.assertIn("窄屏", self.design)

    def test_processing_states_match_demo(self):
        states = re.search(r"qr=\{([^}]+)\}", self.demo)
        self.assertIsNotNone(states)
        for state in re.findall(r":`([^`]+)`", states.group(1)):
            with self.subTest(state=state):
                self.assertIn(state.replace(" · ", ""), self.design.replace(" · ", ""))
        for result in ("已解决", "仍需补充", "需重新判断"):
            with self.subTest(result=result):
                self.assertIn(f"state:`{result}`", self.demo)
                self.assertIn(result, self.design)

    def test_simulated_services_are_explicit(self):
        implementation = self.design.split("### 当前 Demo 的实现范围\n", 1)[1]
        implementation = implementation.split("\n## 七、", 1)[0]
        for capability in ("文件解析", "提取与初审", "修改后复查", "连接测试", "检测服务", "版本与报告"):
            with self.subTest(capability=capability):
                self.assertRegex(implementation, rf"\| {capability} \| .+ \| .+ \|")
        self.assertIn("TXT / .md 读取真实文本，PDF / Word 使用示例正文模拟", implementation)
        self.assertIn("模型与检测流程均采用本地模拟", implementation)
        self.assertIn("材料勾选与反馈仍使用当前共享状态", implementation)
        self.assertIn("e.text()", self.demo)
        self.assertIn("r===`txt`?", self.demo)
        self.assertIn("模拟下一次模型调用失败", implementation)
        self.assertIn("模拟会话立即到期", implementation)

    def test_detection_examples_are_labeled_and_actual_priority_is_open(self):
        detection = self.design.split("## 五、检测模块\n", 1)[1]
        detection = detection.split("\n## 六、", 1)[0]
        percentages = re.search(r"r=n\?([\d.]+):([\d.]+),i=n\?", self.demo)
        self.assertIsNotNone(percentages)
        for percentage in percentages.groups():
            with self.subTest(percentage=percentage):
                self.assertIn(f"固定为 {percentage}%", detection)
        self.assertIn("两类服务均为待接入", detection)
        self.assertIn("首个实际接入的检测服务仍待确定", detection)


if __name__ == "__main__":
    unittest.main()

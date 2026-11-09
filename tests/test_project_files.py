"""项目规则和独立 Demo 文件的基础完整性检查。"""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class DemoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.declarations = []
        self.ids = []
        self.scripts = []
        self.tags = set()

    def handle_decl(self, declaration):
        self.declarations.append(declaration.lower())

    def handle_starttag(self, tag, attributes):
        self.tags.add(tag)
        attributes = dict(attributes)
        if "id" in attributes:
            self.ids.append(attributes["id"])
        if tag == "script":
            self.scripts.append(attributes)


class ProjectFilesTests(unittest.TestCase):
    def test_version_delivery_rules_are_documented(self):
        instructions = (PROJECT_ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("每轮完成并通过验证的修改为一个版本", instructions)
        self.assertIn("Git commit 编号、改动摘要和验证结果", instructions)
        self.assertIn("git log --graph --oneline --decorate --all", instructions)

    def test_demo_contains_complete_document_and_app_entry(self):
        source = (PROJECT_ROOT / "法学论文审查助手-Demo.html").read_text(
            encoding="utf-8"
        )
        parser = DemoParser()
        parser.feed(source)
        parser.close()

        self.assertIn("doctype html", parser.declarations)
        self.assertTrue({"html", "head", "title", "body"}.issubset(parser.tags))
        self.assertEqual(parser.ids.count("root"), 1)
        duplicates = [name for name, count in Counter(parser.ids).items() if count > 1]
        self.assertEqual(duplicates, [])
        self.assertTrue(any(script.get("type") == "module" for script in parser.scripts))
        self.assertIn("</script>", source)
        self.assertTrue(source.rstrip().endswith("</html>"))


if __name__ == "__main__":
    unittest.main()

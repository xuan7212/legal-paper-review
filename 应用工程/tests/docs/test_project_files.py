"""项目规则和独立 Demo 文件的基础完整性检查。"""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
from urllib.parse import unquote


ENGINEERING_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = ENGINEERING_ROOT.parent


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
    def test_documentation_links_resolve_after_directory_reorganization(self):
        for relative_path in (
            "README.md",
            "应用工程/README.md",
            "设计资料/产品设计文档.md",
            "设计资料/技术方案.md",
        ):
            document = PROJECT_ROOT / relative_path
            links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", document.read_text(encoding="utf-8"))
            self.assertTrue(links, f"{relative_path} 应提供文档导航")
            for link in links:
                if "://" in link or link.startswith("#"):
                    continue
                target = document.parent / unquote(link.split("#", 1)[0])
                with self.subTest(document=relative_path, link=link):
                    self.assertTrue(target.is_file(), f"链接目标不存在：{target}")

    def test_application_name_is_consistent(self):
        for relative_path in (
            "apps/web/index.html",
            "apps/web/src/App.tsx",
            "apps/server/src/index.ts",
            "README.md",
        ):
            with self.subTest(path=relative_path):
                source = (ENGINEERING_ROOT / relative_path).read_text(encoding="utf-8")
                self.assertIn("法学论衡", source)
                self.assertNotIn("律稿", source)

    def test_project_top_level_has_five_clear_entries(self):
        entries = {path.name for path in PROJECT_ROOT.iterdir() if not path.name.startswith(".")}
        self.assertEqual(entries, {"README.md", "AGENTS.md", "应用工程", "设计资料", "历史归档"})
        for name in ("apps", "packages", "config", "tests", "scripts"):
            with self.subTest(directory=name):
                self.assertTrue((ENGINEERING_ROOT / name).is_dir())

    def test_version_delivery_rules_are_documented(self):
        instructions = (PROJECT_ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("每轮完成并通过验证的修改为一个版本", instructions)
        self.assertIn("Git commit 编号、改动摘要和验证结果", instructions)
        self.assertIn("git log --graph --oneline --decorate --all", instructions)

    def test_demo_contains_complete_document_and_app_entry(self):
        source = (PROJECT_ROOT / "历史归档" / "法学论文审查助手-Demo.html").read_text(
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

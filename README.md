# 律稿 · 法学论文审查助手

根据产品设计文档和技术方案实现的 Web MVP，采用 React、TypeScript、Vite、Tailwind CSS、Fastify 和 DeepSeek。支持论文输入与文件解析、研究问题确认、逻辑与表达审查、逐段修改、多轮复查、材料和反馈、历史报告复制。

## 本地启动

准备 Node.js 22.13 及以上版本，以及 pnpm 11.25。旧版 Word 解析需要 LibreOffice，其 `soffice` 命令应在 PATH 中，也可通过 `SOFFICE_BIN` 指定可执行文件。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开 http://127.0.0.1:5173。在“设置 → 模型与 API 配置”中输入自己的 DeepSeek API Key，选择模型并测试连接，然后载入示例或上传自己的片段开始审查。

```sh
pnpm build
pnpm start
```

生产构建由 Fastify 同时提供页面与 API，默认地址为 http://127.0.0.1:3001。可通过 `HOST`、`PORT` 配置监听地址，通过 `PUBLIC_ORIGIN` 指定公开站点的完整来源。公开部署时使用同域 HTTPS 反向代理，并为 LibreOffice 转换进程提供受限运行环境。

## 使用与数据处理

- 论文片段按去除空白字符后的 UTF-16 长度计数，范围为 1500—5000 字，单个上传文件最大 20 MB。
- TXT、MD、DOCX 和文字型 PDF 读取真实内容，旧版 DOC 通过独立 LibreOffice 进程转换。解析后请核对 PDF 的文字顺序，扫描版 PDF 需要先进行 OCR。
- 提取与审查之间需要作者确认研究问题和观点。审查包含模型回读与原文校验，修改后按上一轮问题进行复查。
- 同一会话中可切换历史轮次并复制报告。最新报告的工作副本附录标明尚待复查的材料与反馈。
- 密钥保存在后端会话内存，成功测试后有效 2 小时。新建审查保留模型配置，清除密钥保留已完成结果。
- 浏览器刷新或关闭后创建新会话，离开页面时尝试清理服务端数据，遗留会话在最后有效操作后 2 小时清理。进程重启后内存数据释放。
- 真实模型调用需要有效的自带密钥，并使用对应 DeepSeek 账户的额度。
- 查重率和 AI 率提供独立的待接入入口，供应商确认后接入实际检测报告。法律资料核验显示所需材料与人工核对状态。

## 验证

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test` 包含业务、接口、组件、模型适配、文件解析测试及原有 Python 文档检查。旧版 DOC 转换测试需要 LibreOffice，Python 文档检查与测试文件生成需要 Python 3。

端到端测试默认使用已安装的 Chrome。也可先执行 `pnpm exec playwright install chromium`，再使用 `PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e`。测试入口仅监听本机，注入固定响应替身，覆盖完整审查流程与移动端上传。正式启动入口调用 DeepSeek 服务。

模型输出质量与两个模型的实际账户权限，需要使用有效密钥和法学评审样本单独联调。80% 准确率作为产品内部评估目标，由实际试用统计。

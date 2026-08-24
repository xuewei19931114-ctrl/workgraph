# Workgraph — AI 原生职业网络

一个移动端优先的 Web 应用：在浏览器里解析 AI 聊天导出，确认后再把**归一化文本**发给本地 Fastify 后端，由 GPT-5.6 生成一份有证据、可追溯的职业画像（Candidate Model）。岗位推荐、职业对话和登录仍是 mock。

界面与信息架构参考了 [workgraph-career-network](https://workgraph-career-network.tony1992111.chatgpt.site/) 的产品设计。

## 快速开始

```bash
cp server/.env.example server/.env   # 填入 GPT56_BASE_URL（代理 origin）和 GPT56_API_KEY
npm install
npm run dev
```

打开 http://localhost:5173 。Vite 会把 `/api` 代理到 Fastify（默认 `127.0.0.1:8787`）。

公网部署用 `npm start`（不要用 `npm run dev`）。Railway 会注入 `PORT`，进程监听 `0.0.0.0`，并同时提供前端静态页和 `/api`。必须在平台里填写 `GPT56_API_KEY` 和 `GPT56_BASE_URL`，不要把密钥写进仓库。

后端说明、环境变量、取消语义和隐私边界见 [server/README.md](server/README.md)。

其他命令：

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 类型检查并打包到 `dist/` |
| `npm start` | 生产启动：同一端口提供前端和 `/api` |
| `npm run preview` | 本地预览打包产物 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行 Vitest（不调用真实模型） |
| `npm run smoke:profile` | **付费** GPT-5.6 smoke，需显式设置密钥；见 server README |

## 数据边界

1. **本地解析**：ZIP / HTML / TXT / JSON / DOCX 在浏览器内解析（`src/lib/parseArchive.ts`），原始文件不会上传。
2. **确认后发送**：点击「开始分析」后，归一化 Transcript 会发送到 Workgraph 后端，再转发到配置的 GPT-5.6 代理。不要再声称聊天正文从不离开设备。
3. **仍为 mock**：对话页、岗位推荐、URL 导入和登录/认证继续使用本地 mock，不走真实后端。

## 四个标签页

**导入** — 上传本地文件（ZIP / HTML / TXT / JSON / DOCX，可多选），或粘贴公开分享链接（链接导入仍为 mock）。确认分析前可预览解析统计；确认后创建真实画像任务。

**对话** — 职业智能体（mock）。空状态提供三个话题入口，回复带打字机动画。

**岗位** — 每天三个岗位（mock），附匹配度、推荐理由和需要确认的问题。

**我的** — 画像标题、工作特质、导入记录、账号状态，以及清空画像。

## 主要交互流程

1. 未登录时上传入口是禁用的，点击会弹出登录弹窗（mock：邮箱 / ChatGPT / 直接体验）。
2. 选择文件后立即在浏览器内解析，弹出预览弹窗展示每份文件的对话段数与消息条数。
3. 点击确认后创建后端 job：进度条和阶段文案来自真实任务状态，不再用时间模拟。
4. 完成后拉取 Candidate Model 报告；取消会向后端发送 `DELETE`。
5. 报告可以保存到本机；canonical model 与 UI model 分开保留。

## 关于 mock 与真实后端

画像生成和对话智能体都接入 Fastify + GPT-5.6。以下仍为 mock：

- `src/data/jobs.ts` — 每日推荐岗位
- 登录 / 认证状态
- 网址导入

## 目录结构

```
src/                    前端：解析、任务轮询、报告 UI
server/                 Fastify 画像 API、推理 pipeline、SQLite
shared/                 Transcript / Candidate Model schema
test/fixtures/          合成解析与 smoke fixture（无真实聊天）
```

## 技术栈

React 19 · TypeScript · Vite 7 · Fastify · SQLite · Zod · Vitest

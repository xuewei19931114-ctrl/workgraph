# Workgraph 画像后端

Fastify + SQLite 服务：接收浏览器归一化后的 Transcript，调用 GPT-5.6 生成 Candidate Model。职业对话、岗位推荐和登录认证仍在前端 mock，不经过本服务。

## 环境变量

复制 `server/.env.example` 为 `server/.env`（或导出到进程环境）。进程启动时会读取 `server/.env`；**已存在的进程环境变量优先，不会被文件覆盖。不要写入真实密钥。**

| 变量 | 说明 |
| --- | --- |
| `HOST` | 监听地址，默认 `127.0.0.1` |
| `PORT` | 监听端口，默认 `8787` |
| `GPT56_BASE_URL` | **代理 origin**。客户端会拼接 `/openai/v1/responses`，不要把完整 Responses 路径写进该变量。 |
| `GPT56_API_KEY` | 仅服务端读取，通过 `x-api-key` 发给代理。不会进入浏览器 bundle、SQLite 或日志正文。 |
| `GPT56_MODEL` | 固定为 `openai.gpt-5.6-sol` |
| `GPT56_REASONING_EFFORT` | 固定为 `high` |
| `GPT56_TIMEOUT_MS` | 单次 provider 超时 |
| `PROFILE_CONTEXT_TOKEN_LIMIT` | 超过后走并行 Evidence Extractor，再进行一次 Core Inference |
| `PROFILE_EXTRACTOR_CONCURRENCY` | Extractor 并发 |
| `PROFILE_ENABLE_CRITIC` | 默认 `false`。为 `true` 时服务端会开启一次 Critic；请求里的 `options.enableCritic: true` 也可以单独打开。Critic 最多一次，且不会自动重跑 Core |
| `WORKGRAPH_DB_PATH` | SQLite 路径；`:memory:` 仅用于测试 |
| `TRANSCRIPT_RETENTION_DAYS` | Transcript 默认保留 7 天 |
| `PROFILE_MAX_BODY_BYTES` | 请求体上限 |

占位示例：

```bash
GPT56_BASE_URL=https://example-proxy.invalid
GPT56_API_KEY=replace-with-your-api-key
```

当前 HTTP 代理只适用于受控开发环境：明文传输 API key 和聊天正文在生产中不可接受，生产至少要求 HTTPS。

## 启动与 migration

SQLite migration 在创建 repository 时自动执行（`server/src/db/migrate.ts`），没有单独的 migrate CLI。

```bash
# 仓库根目录
cp server/.env.example server/.env   # 填入代理 origin 和密钥后再启动
npm install
npm run dev                          # Vite :5173 + Fastify :8787
# 或只起后端
npm run dev:server
```

开发时 Vite 把 `/api` 代理到 Fastify。健康检查：

```bash
curl -s http://127.0.0.1:8787/api/health
# {"ok":true}
```

## API 示例

密钥只放在服务端环境变量里，浏览器请求不要带 `GPT56_API_KEY`。

创建任务（`202`）：

```bash
curl -s -X POST http://127.0.0.1:8787/api/profile/jobs \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: replace-with-client-key' \
  -d '{"candidateId":"candidate_123","transcript":{},"options":{"enableCritic":false}}'
```

轮询 / 取消 / 读取 / 删除：

```bash
curl -s http://127.0.0.1:8787/api/profile/jobs/job_123
curl -s -X DELETE http://127.0.0.1:8787/api/profile/jobs/job_123
curl -s http://127.0.0.1:8787/api/profile/models/model_123
curl -s -X DELETE 'http://127.0.0.1:8787/api/profile/models?candidateId=candidate_123'
```

`DELETE /api/profile/jobs/:jobId` 会把 AbortSignal 传到当前 provider 调用以及并行 extraction sibling。重复取消幂等。`DELETE /api/profile/models` 只删画像，保留 transcript、导入记录和聊天历史。

## 存储与保留

- Transcript 默认保留 `TRANSCRIPT_RETENTION_DAYS`（7）天后过期删除。服务启动时会清扫一次，之后每天再清扫；只记录删除条数，不记录正文。
- Candidate Model 与无正文 telemetry（`provider_calls`）长期保留，直到用户清除画像。
- `provider_calls` 不存 API key、prompt、transcript 或模型正文。
- SQLite、WAL 和 `.env` 已加入 `.gitignore`。

## 付费 smoke（需显式授权）

普通测试不调用真实模型。只有同时设置了 `GPT56_API_KEY` 和 `GPT56_BASE_URL` 时，`npm run smoke:profile` 才会运行；缺任一变量会直接拒绝。该命令使用合成 fixture，预期 **1** 次 Core 调用（direct 路径，Critic 关闭），会打印费用警告、模型名、token usage 和 request ID，不会打印密钥、prompt 或 transcript 正文。未解决或失败时非零退出。

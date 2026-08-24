# Workgraph Candidate Profile Backend Design

## 1. 目标与范围

在现有 Vite + React 项目中新增独立 Fastify + TypeScript 后端，实现从聊天记录到 Candidate Model 的真实画像生成链路：

1. 确定性解析与归一化；
2. 上下文足够时执行一次 GPT-5.6 核心推理；
3. 上下文过长时并行抽取高信号 Episode，再执行一次核心推理；
4. 可选执行一次 Critic；
5. 校验结构化结果并确定性映射到现有报告 UI；
6. 提供真实任务状态、取消、遥测与 SQLite 持久化。

本次不实现职业智能体对话、岗位推荐和真实认证后端；这三部分继续使用现有 mock。

规范来源为 `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1` 全部文件。运行时架构遵循该规范的“单次深推理 + 可选一次 Critic”，不把 17 步审阅思维序列拆成多次串行模型调用。

## 2. 已确认的技术决策

- 后端：独立 Fastify + TypeScript 服务，位于当前仓库 `server/`。
- 数据库：SQLite，使用版本化 SQL migration。
- 模型：`openai.gpt-5.6-sol`。
- API：OpenAI Responses 兼容代理，URL 由环境变量配置。
- 鉴权 header：`x-api-key`，密钥仅从服务端环境变量读取。
- Reasoning effort：`high`。
- 数据边界：上下文允许时发送完整归一化正文；超限时分块抽取 Episode。
- Critic：实现但默认关闭；只有评估证明存在重复性失败后才开启。
- 前端：保留 Vite，不迁移 Next.js；通过 Vite `/api` proxy 连接 Fastify。
- Canonical Candidate Model 以 reviewer brain schema 为准，现有 UI 通过 adapter 消费。

## 3. 系统架构

```text
Browser
  ├─ deterministic file parsing
  ├─ Transcript normalization
  └─ POST /api/profile/jobs
          │
          ▼
Fastify API
  ├─ request/schema validation
  ├─ SQLite job persistence
  └─ InferencePipeline
       ├─ ContextStrategy
       │    ├─ direct ───────────────┐
       │    └─ evidence fallback     │
       │         ├─ chunk by conversation
       │         ├─ parallel extractors
       │         └─ deterministic merge
       ├─ ONE core inference ◄───────┘
       ├─ optional ONE critic
       ├─ schema + policy invariants
       └─ deterministic UI adapter
```

模块边界：

- `parser/normalize`：纯确定性，无模型调用和职业推断。
- `schemas`：Zod/JSON Schema 与政策 invariant。
- `provider`：Responses API、重试、取消与调用遥测，不含业务推理规则。
- `inference`：路径选择、并行抽取、合并、核心推理和 Critic 编排。
- `prompts`：运行时 prompt 模板，不包含执行逻辑。
- `report`：Canonical Model 到 UI Model 的纯函数映射。
- `api`：HTTP 契约、状态码与连接中断取消。
- `eval`：离线门禁，不被生产请求依赖。

## 4. 数据流

### 4.1 解析与归一化

浏览器解析文件后生成：

```ts
interface Transcript {
  candidate_id: string
  source_type: string
  conversations: Array<{
    conversation_id: string
    title: string
    messages: Array<{
      message_id: string
      role: 'user' | 'assistant' | 'system' | 'tool'
      content: string
      timestamp: string | null
      authorship: 'user' | 'assistant' | 'third_party' | 'mixed' | 'unknown'
    }>
  }>
}
```

conversation/message ID 必须由来源位置和内容哈希确定，重复解析同一文件得到相同 ID。解析器不能把 AI 输出归属于用户。纯文本无法确定作者时标记 `unknown`，不猜测。

### 4.2 Direct 路径

估算完整 core prompt、schema 和 transcript 的 token 数；不超过配置阈值时，将完整归一化 transcript 发送给一次 core inference。

### 4.3 Evidence fallback

超过阈值时：

1. 按完整 conversation 边界分块；
2. 单段 conversation 仍过大时再按 message 边界切分，并保留相邻一条消息作为序列上下文；
3. 以受控并发调用 Evidence Extractor；
4. 输出完整 Episode schema，包括 source message IDs 和 agency 分解；
5. 按来源 ID 集合去重；
6. 同源冲突保留较低 signal strength，并写入冲突标记；
7. 按跨场景覆盖优先、信号强度次优先排序；
8. 将合并后的 Episode map 发送给一次 core inference。

fallback 不再附带完整 transcript，避免再次超限；但每个结论必须可追溯到 source message IDs。

### 4.4 Core inference

一次调用内部完成 reviewer brain 的 17 步推理序列。模型必须：

- 优先 correction、rejection、reframing、constraint、boundary、trade-off、action 与 convergence；
- 区分 user authorship、judgment、correction、reframing 和 AI/third-party contamination；
- 对每个机制产生预测并检查 confirmed、missing、contradictory；
- 明确 `missing != contradiction != weakness`；
- 生成至少五类竞争原型，包括 null/under-resolved；
- 分离 explanatory confidence 和 outcome-validation confidence；
- 从机制而非话题推导 role family；
- 分离 natural fit、readiness 和 seniority evidence；
- 允许在证据不足时返回 under-resolved。

### 4.5 Critic

Critic 仅检查 material issues，不重新生成画像。默认关闭。开启后：

- `pass`：继续校验并完成；
- `unresolved`：任务完成为 `unresolved`，保留模型和 issues；
- `revise`：同样标记 `unresolved`，不自动重跑 core，避免增加第三个串行推理波次和重复计费。

修订由后续人工纠错或显式重新提交完成。

## 5. Schema 与政策补齐

Canonical schema 采用 reviewer brain 的 Candidate Model，并作以下明确补齐：

1. `high_signal_episodes` 使用完整 Episode schema。
2. `strength_risk_pairs` 每项包含：
   - `capability_id`
   - `risk_claim`
   - `evidence_status_ceiling: observed | inferred | unknown`
   - `supporting_evidence_ids`
3. `role_fit` 增加 `seniority_evidence`，没有证据时必须为 `unknown`。
4. 所有 evidence ID 必须存在于 Transcript message IDs 或 Episode IDs。
5. risk 的 evidence ceiling 不得高于对应 capability 的证据状态。
6. AI/third-party 内容不能在没有用户 judgment/correction/transfer 证据时支持用户 capability。
7. 缺失证据只能产生 unknown/unvalidated，不能产生负面能力断言。

现有前端 `CandidateModel` 不再作为后端契约。`report/to-ui-candidate-model.ts` 负责确定性映射：

- 数值 confidence `>= 0.75` → `high`
- `>= 0.45` → `medium`
- 其他 → `unknown`

Canonical JSON 原样持久化，adapter 不得覆盖或丢弃它。

## 6. API 契约

### `POST /api/profile/jobs`

请求：

```json
{
  "candidateId": "candidate_123",
  "transcript": {},
  "options": { "enableCritic": false }
}
```

header 可包含 `Idempotency-Key`。相同 key 与相同请求哈希返回同一 job，避免重复调用和计费。

响应：`202`

```json
{ "jobId": "job_123", "status": "queued" }
```

### `GET /api/profile/jobs/:jobId`

状态：

```text
queued | parsing | extracting | inferring | criticizing |
validating | completed | unresolved | failed | cancelled
```

响应包含 `progress`、`stageMessage`、`modelId`、`criticVerdict` 和安全的错误信息。进度只由真实阶段转换产生，不根据时间伪造。

### `DELETE /api/profile/jobs/:jobId`

取消任务并将 AbortSignal 传播至当前 provider 调用以及所有并行 extraction sibling。重复取消保持幂等。

### `GET /api/profile/models/:modelId`

返回：

```json
{
  "candidateModel": {},
  "uiModel": {},
  "critic": null,
  "status": "completed"
}
```

### `DELETE /api/profile/models?candidateId=...`

删除该候选人的画像；保留 transcript、import records 和聊天历史。

## 7. SQLite 设计

### `transcripts`

- `id`
- `candidate_id`
- `source_type`
- `content_json`
- `content_hash`
- `created_at`
- `expires_at`

### `analysis_jobs`

- `id`
- `candidate_id`
- `transcript_id`
- `idempotency_key`
- `request_hash`
- `status`
- `progress`
- `stage_message`
- `options_json`
- `model_id`
- `critic_verdict`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

### `candidate_models`

- `id`
- `candidate_id`
- `job_id`
- `canonical_json`
- `ui_json`
- `critic_json`
- `created_at`

### `provider_calls`

- `id`
- `job_id`
- `provider_request_id`
- `provider_response_id`
- `stage`
- `model`
- `reasoning_effort`
- `status`
- `started_at`
- `ended_at`
- `wall_ms`
- `input_tokens`
- `output_tokens`
- `reasoning_tokens`
- `incomplete_details`
- `error_code`

不存 API key，不在该表存 transcript/prompt/response 正文。

## 8. Provider 客户端

环境变量：

```text
GPT56_BASE_URL
GPT56_API_KEY
GPT56_MODEL=openai.gpt-5.6-sol
GPT56_REASONING_EFFORT=high
GPT56_TIMEOUT_MS=120000
PROFILE_CONTEXT_TOKEN_LIMIT
PROFILE_EXTRACTOR_CONCURRENCY=3
PROFILE_ENABLE_CRITIC=false
WORKGRAPH_DB_PATH=server/data/workgraph.db
TRANSCRIPT_RETENTION_DAYS=7
```

Responses 请求使用：

```http
POST {GPT56_BASE_URL}/openai/v1/responses
x-api-key: ${GPT56_API_KEY}
Content-Type: application/json
```

优先使用 `text.format.type=json_schema`。若代理明确返回“不支持 json_schema”，允许退化为严格 JSON 文本；该结果仍须经过相同 Zod 与 invariant 校验，无法校验时任务失败或 unresolved，不能接受 prose。

重试仅覆盖网络断开、超时、429、502、503、504，最多 2 次指数退避并加入 jitter。结构化输出无效时只允许一次受限 JSON repair 调用，不重跑整条 pipeline。

## 9. 状态码与错误处理

- `400 INVALID_TRANSCRIPT`：输入或 schema 不合法。
- `404 JOB_NOT_FOUND | MODEL_NOT_FOUND`。
- `409 IDEMPOTENCY_CONFLICT`：同 key 不同请求。
- `413 TRANSCRIPT_TOO_LARGE`：超过可配置的总导入上限。
- `422 MODEL_POLICY_VIOLATION`：输出违反 schema/invariant。
- `499 CANCELLED`：客户端取消。
- `502 PROVIDER_FAILED`：代理失败、拒绝、空输出或不可恢复的 incomplete。
- `504 PROVIDER_TIMEOUT`。

服务端日志与 API 错误不能包含 API key、完整正文、完整 prompt 或原始 provider response。开发模式可记录 message ID 和内容哈希，不记录内容。

## 10. 隐私与保留

- 文件首先在浏览器本地解析。
- 用户点击确认后，归一化正文发送给 Workgraph 后端及配置的 GPT-5.6 代理。
- UI 文案必须明确上述边界，不能继续宣称“聊天记录不上传”。
- Transcript 默认保留 7 天，通过 `TRANSCRIPT_RETENTION_DAYS` 配置。
- Candidate Model 与无正文 telemetry 长期保留，直到用户清除。
- SQLite 文件、WAL 文件和 `.env` 必须加入 `.gitignore`。
- 生产环境至少要求 HTTPS；当前 HTTP 代理仅适用于受控开发环境，因为明文传输 API key 和聊天正文不可接受。

## 11. 前端接入

1. `parseArchive` 改为同时返回 stats 和 normalized Transcript，不再丢弃正文。
2. `App.finishAnalysis` 改为创建 job。
3. `AnalyzingModal` 接收后端 job 状态，不再运行时间模拟。
4. 轮询间隔为 1 秒；组件卸载或用户取消时发送 DELETE。
5. 完成后获取 model，并把 `uiModel` 传给现有 `ReportModal`。
6. 保存时仍写入当前本地状态；canonical model 同时保留以便未来 UI 扩展。
7. 隐私文案改为“确认分析后发送归一化文本”。
8. Vite 开发代理把 `/api` 转发到 Fastify。

本次不改变对话、岗位和登录 mock。

## 12. 测试与验收

采用 Vitest。

### 单元测试

- parser/normalizer：稳定 ID、ChatGPT mapping、HTML/TXT、角色和 authorship。
- schemas：合法/非法 Transcript、Episode、Candidate Model。
- invariants：missing≠weakness、AI attribution、third-party contamination、role inflation、risk evidence ceiling、无效 evidence ID。
- context strategy：direct 与 fallback 阈值。
- episode merger：去重、冲突降级、跨场景优先。
- UI adapter：confidence 阈值及不修改 canonical model。

### Provider 测试

使用 mock HTTP server 覆盖：

- 标准 Responses 成功结构；
- json_schema 不支持时的严格 JSON fallback；
- 429/5xx 重试；
- timeout；
- AbortSignal；
- refusal/empty/incomplete；
- malformed JSON 与一次 repair 上限；
- telemetry 不含密钥和正文。

### Pipeline 测试

- direct 路径恰好一次 core call；
- fallback 路径 N 次并行 extractor + 恰好一次 core call；
- critic 默认零调用；
- critic 开启最多一次；
- sibling cancellation；
- Critic revise/unresolved 不自动重跑 core。

### API 集成测试

使用 Fastify `inject` 覆盖任务创建、幂等、状态转换、取消、获取模型和删除画像。

### 前后端验收

用固定 fixture 验证：

```text
选择文件 → 本地解析 → 确认 → 创建 job → 真实进度 →
完成/未解决 → 展示报告 → 保存画像
```

普通测试不调用真实模型。真实 GPT-5.6 smoke test 仅在显式设置环境变量后运行。

完成标准：

- TypeScript、ESLint、全部单元和集成测试通过；
- direct/fallback/取消/失败路径均有测试；
- API key 不进入浏览器 bundle、数据库、日志或版本控制；
- 所有画像断言可追溯到 message/episode ID；
- 现有报告页可以展示真实结果；
- 真实 smoke 命令成功生成一个 schema-valid Candidate Model。

## 13. 明确不做

- 不增加 Manager、Founder、Hiring 等 role-conditioned lens。
- 不把 `REVIEWER_DISTILLATION_PROMPT` 加入运行时。
- 不实现 Redis、分布式 worker 或多节点 job 调度。
- 不实现真实登录、岗位推荐或职业对话后端。
- 不用多阶段模型链拆分 17 步推理。
- 不在 Critic revise 后自动重跑完整分析。
- 不把 topic frequency、自述或未修改的 AI 输出当作能力证据。


# Candidate Profile Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Workgraph Vite 应用中新增 Fastify + SQLite 后端，并把“上传聊天记录 → GPT-5.6 画像推理 → 真实进度 → Candidate Model 报告”从 mock 替换为可取消、可追溯、可测试的真实链路。

**Architecture:** 浏览器确定性解析文件并生成稳定的 Transcript；Fastify 将 Transcript、任务和模型结果持久化到 SQLite。上下文足够时只调用一次 GPT-5.6 Core Inference，过长时并行抽取 Episode 后再调用一次 Core；Critic 为默认关闭的单次可选调用。Canonical Candidate Model 经过 schema/invariant 校验，再由纯函数映射到现有 UI 类型。

**Tech Stack:** React 19、Vite 7、TypeScript 5.9、Fastify、Zod、SQLite（better-sqlite3）、Vitest、OpenAI Responses 兼容 HTTP API。

## Global Constraints

- 设计依据：`docs/superpowers/specs/2026-08-21-candidate-profile-backend-design.md`。
- 模型必须为 `openai.gpt-5.6-sol`，reasoning effort 默认 `high`。
- 代理 URL、API key、token 阈值和数据库路径必须来自服务端环境变量。
- API key 不得进入浏览器 bundle、SQLite、日志、fixture 或提交文件。
- 运行时最多一次 Core Inference；上下文超限时可有 N 次并行 Evidence Extractor；Critic 最多一次且默认关闭。
- 缺失证据必须保持 unknown，不能转成 weakness。
- AI/第三方内容不能直接支持候选人能力。
- natural fit、readiness、seniority evidence 必须分离。
- 所有重要结论必须追溯到 message ID 或 Episode ID。
- 本次只接画像生成；对话、岗位和登录继续使用 mock。
- 当前目录不是 Git 仓库；不得自行初始化 Git 或创建提交。

## File Map

### Shared

- Create `shared/profile-schemas.ts`：Transcript、Episode、Canonical Candidate Model、API DTO 的 Zod schema 与类型。
- Create `shared/ui-model.ts`：前后端共享的 UI Candidate Model 类型。

### Server

- Create `server/src/config.ts`：环境变量解析与安全默认值。
- Create `server/src/app.ts`：Fastify app factory。
- Create `server/src/index.ts`：服务启动入口。
- Create `server/src/db/migrate.ts`、`server/src/db/repository.ts`：SQLite migration 与 repository。
- Create `server/src/provider/responses-client.ts`：GPT-5.6 Responses API 客户端。
- Create `server/src/provider/call-recorder.ts`：无正文遥测。
- Create `server/src/prompts/*.ts`：Core、Extractor、Critic prompt。
- Create `server/src/inference/*.ts`：上下文策略、合并、runner 与 pipeline。
- Create `server/src/report/to-ui-model.ts`：Canonical → UI 纯映射。
- Create `server/src/routes/profile.ts`：画像任务 API。
- Create `server/src/jobs/job-manager.ts`：进程内任务执行、状态与取消。
- Create `server/migrations/001_initial.sql`。
- Create `server/.env.example`。

### Frontend

- Modify `src/types.ts`：加入 normalized Transcript、分析任务和 canonical model 引用。
- Modify `src/lib/parseArchive.ts`：返回 stats + Transcript，不再丢弃正文。
- Create `src/lib/profileApi.ts`：创建、轮询、取消、读取模型 API。
- Modify `src/App.tsx:89-174`：用真实任务替换 mock `buildCandidateModel`。
- Modify `src/components/AnalyzingModal.tsx`：展示真实 job 状态并允许取消。
- Modify `src/pages/UploadPage.tsx`：修正隐私文案。
- Modify `vite.config.ts`：`/api` 代理至 Fastify。

### Tests

- Create `server/test/**`：schema、provider、pipeline、API 集成测试。
- Create `src/lib/parseArchive.test.ts`、`src/lib/profileApi.test.ts`。
- Create `test/fixtures/chatgpt-conversations.json` 与安全的 synthetic fixtures。

---

### Task 1: Workspace Tooling and Fastify Bootstrap

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vitest.config.ts`
- Create: `server/src/config.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Create: `server/.env.example`
- Modify: `.gitignore`
- Test: `server/test/config.test.ts`
- Test: `server/test/health.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): ServerConfig`
- Produces: `buildApp(deps?: AppDependencies): Promise<FastifyInstance>`

- [ ] **Step 1: Install runtime and test dependencies**

Run:

```bash
npm install fastify @fastify/cors zod better-sqlite3
npm install -D @types/better-sqlite3 tsx vitest
```

Expected: `package-lock.json` updates and `npm audit` reports no critical vulnerability.

- [ ] **Step 2: Add server and test scripts**

Add these scripts to `package.json`:

```json
{
  "dev": "concurrently -k \"npm:dev:web\" \"npm:dev:server\"",
  "dev:web": "vite",
  "dev:server": "tsx watch server/src/index.ts",
  "build": "tsc -b && tsc -p tsconfig.server.json && vite build",
  "typecheck": "tsc -b && tsc -p tsconfig.server.json --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "smoke:profile": "tsx server/scripts/smoke-profile.ts"
}
```

Install `concurrently` with `npm install -D concurrently`.

- [ ] **Step 3: Write failing configuration tests**

`server/test/config.test.ts` must assert:

```ts
expect(() => loadConfig({})).toThrow(/GPT56_API_KEY/)
expect(loadConfig(validEnv).model).toBe('openai.gpt-5.6-sol')
expect(loadConfig(validEnv).reasoningEffort).toBe('high')
expect(loadConfig(validEnv).enableCritic).toBe(false)
```

- [ ] **Step 4: Run the configuration test and verify failure**

Run: `npm test -- server/test/config.test.ts`

Expected: FAIL because `server/src/config.ts` does not exist.

- [ ] **Step 5: Implement strict environment parsing**

`ServerConfig` must include:

```ts
interface ServerConfig {
  host: string
  port: number
  baseUrl: string
  apiKey: string
  model: 'openai.gpt-5.6-sol'
  reasoningEffort: 'high'
  timeoutMs: number
  contextTokenLimit: number
  extractorConcurrency: number
  enableCritic: boolean
  dbPath: string
  transcriptRetentionDays: number
}
```

Reject missing key, non-HTTP URL, non-positive limits, and any model other than `openai.gpt-5.6-sol`.

- [ ] **Step 6: Write and pass a health-route test**

`server/test/health.test.ts`:

```ts
const app = await buildApp({ config: testConfig })
const response = await app.inject({ method: 'GET', url: '/api/health' })
expect(response.statusCode).toBe(200)
expect(response.json()).toEqual({ ok: true })
```

Implement app factory and `server/src/index.ts`; `index.ts` is the only file that calls `app.listen`.

- [ ] **Step 7: Add safe environment and ignore files**

`server/.env.example` contains variable names and non-secret examples; `.gitignore` adds:

```gitignore
.env
.env.*
!server/.env.example
server/data/
*.db
*.db-shm
*.db-wal
```

- [ ] **Step 8: Verify the bootstrap**

Run: `npm run typecheck && npm test -- server/test/config.test.ts server/test/health.test.ts`

Expected: PASS.

---

### Task 2: Canonical Schemas and Policy Invariants

**Files:**
- Create: `shared/profile-schemas.ts`
- Create: `shared/ui-model.ts`
- Create: `server/src/schemas/invariants.ts`
- Test: `server/test/schemas/profile-schemas.test.ts`
- Test: `server/test/schemas/invariants.test.ts`

**Interfaces:**
- Produces: `TranscriptSchema`, `EpisodeSchema`, `CandidateModelSchema`
- Produces: `CreateProfileJobRequestSchema`, `ProfileJobSchema`, `ProfileModelResponseSchema`
- Produces: `validateCandidateInvariants(model, transcript): InvariantIssue[]`

- [ ] **Step 1: Write failing schema tests**

Tests must cover:

```ts
TranscriptSchema.parse(validTranscript)
expect(() => TranscriptSchema.parse(messageWithoutId)).toThrow()
CandidateModelSchema.parse(validUnderResolvedModel)
expect(() => CandidateModelSchema.parse(roleWithoutSeniorityEvidence)).toThrow()
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- server/test/schemas/profile-schemas.test.ts`

Expected: FAIL because schemas are absent.

- [ ] **Step 3: Implement exact Zod schemas**

Implement all fields from reviewer brain:

- working archetype with two confidence values;
- core loop;
- full high-signal Episodes;
- mechanisms with prediction/confirmation/missing/counter-evidence;
- capabilities linked to mechanism IDs;
- five archetype competition types;
- strongest counterargument;
- strength-risk pairs with evidence ceiling;
- role fit with natural fit, readiness, and seniority evidence;
- evidence boundaries and hiring manager summary.

Every schema uses `.strict()`. Confidence is constrained to `[0, 1]`. Under-resolved is represented by a null archetype competition winner and conservative confidence, not by fabricated fields.

- [ ] **Step 4: Write invariant tests for hard failures**

Use synthetic fixtures to assert issues for:

1. capability cites a nonexistent Episode;
2. Episode cites nonexistent message ID;
3. AI-authored text supports capability without user judgment/correction;
4. missing evidence appears as a weakness claim;
5. seniority is asserted while `seniority_evidence.status === 'unknown'`;
6. risk evidence ceiling exceeds capability evidence;
7. fewer than five competition categories.

- [ ] **Step 5: Implement invariant validator**

Return stable machine-readable issues:

```ts
interface InvariantIssue {
  code:
    | 'INVALID_EVIDENCE_REFERENCE'
    | 'AI_ATTRIBUTION_LEAK'
    | 'THIRD_PARTY_ATTRIBUTION_LEAK'
    | 'MISSING_AS_WEAKNESS'
    | 'ROLE_INFLATION'
    | 'RISK_EVIDENCE_CEILING'
    | 'INCOMPLETE_ARCHETYPE_COMPETITION'
  path: string
  message: string
}
```

- [ ] **Step 6: Verify schemas and invariants**

Run: `npm test -- server/test/schemas`

Expected: all tests PASS.

---

### Task 3: Deterministic Transcript Parsing and Normalization

**Files:**
- Modify: `src/types.ts`
- Rewrite: `src/lib/parseArchive.ts`
- Create: `src/lib/transcriptIds.ts`
- Test: `src/lib/parseArchive.test.ts`
- Create: `test/fixtures/chatgpt-conversations.json`
- Create: `test/fixtures/simple-chat.html`
- Create: `test/fixtures/simple-chat.txt`

**Interfaces:**
- Produces: `parseArchive(file: File, candidateId: string): Promise<ParsedArchive>`
- Produces:

```ts
interface ParsedArchive {
  stats: ArchiveStats
  transcript: Transcript
}
```

- [ ] **Step 1: Add synthetic parser fixtures**

Fixtures contain no real user data. JSON fixture must include one ChatGPT `mapping` tree with user and assistant messages; HTML/TXT fixtures include explicit `User:` and `Assistant:` markers.

- [ ] **Step 2: Write failing parser tests**

Assert:

```ts
expect(result.stats).toEqual({ conversations: 1, messages: 4 })
expect(result.transcript.conversations[0].messages[0].role).toBe('user')
expect(result.transcript.conversations[0].messages[1].authorship).toBe('assistant')
expect(secondParse.transcript).toEqual(firstParse.transcript)
```

Also verify plain text without role markers uses `authorship: 'unknown'` rather than `user`.

- [ ] **Step 3: Run and verify failure**

Run: `npm test -- src/lib/parseArchive.test.ts`

Expected: FAIL because current parser returns only stats.

- [ ] **Step 4: Implement stable IDs**

Use Web Crypto SHA-256 over normalized source coordinates:

```ts
messageId = sha256(`${sourceType}:${conversationIndex}:${messageIndex}:${role}:${content}`)
conversationId = sha256(`${sourceType}:${conversationIndex}:${title}`)
```

Do not include `Date.now()` or random values.

- [ ] **Step 5: Implement ChatGPT mapping traversal**

Follow `current_node` parent links when present to select the active branch; otherwise sort valid messages by `create_time` and stable source position. Map author roles exactly and extract text content from message parts.

- [ ] **Step 6: Implement HTML/TXT/DOCX normalization**

Preserve user/assistant markers when present. For unstructured text, create one conversation and messages with `role: 'user'`, `authorship: 'unknown'` only as a transport role; never treat that authorship as candidate evidence.

- [ ] **Step 7: Update `PickedFile`**

Replace `archive?: ArchiveStats` with:

```ts
archive?: ParsedArchive
```

Update all stats reads to `file.archive?.stats`.

- [ ] **Step 8: Verify parser regression**

Run: `npm test -- src/lib/parseArchive.test.ts && npm run typecheck`

Expected: PASS.

---

### Task 4: SQLite Migrations and Repository

**Files:**
- Create: `server/migrations/001_initial.sql`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/repository.ts`
- Test: `server/test/db/repository.test.ts`

**Interfaces:**
- Produces: `createRepository(dbPath): ProfileRepository`
- Consumes shared schemas from Task 2.

- [ ] **Step 1: Write repository contract tests**

Tests use a temporary database and cover:

```ts
const transcript = repo.createTranscript(validTranscript, retentionDate)
const job = repo.createJob({ candidateId, transcriptId: transcript.id, idempotencyKey, requestHash })
expect(repo.findIdempotentJob(idempotencyKey, requestHash)?.id).toBe(job.id)
expect(() => repo.findIdempotentJob(idempotencyKey, 'different')).toThrow(/IDEMPOTENCY_CONFLICT/)
```

Also cover legal/illegal status transitions and model deletion preserving transcripts.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- server/test/db/repository.test.ts`

Expected: FAIL because repository is absent.

- [ ] **Step 3: Implement migration**

Create the four tables exactly as designed: `transcripts`, `analysis_jobs`, `candidate_models`, `provider_calls`; add indexes for candidate, job status, created time and unique non-null idempotency key.

- [ ] **Step 4: Implement repository methods**

Required methods:

```ts
createTranscript()
getTranscript()
createJob()
findIdempotentJob()
updateJobStatus()
getJob()
saveModel()
getModel()
deleteModelsByCandidate()
recordProviderCall()
deleteExpiredTranscripts()
```

All JSON reads are parsed through Zod schemas. Invalid stored JSON throws a typed persistence error.

- [ ] **Step 5: Enforce state transitions**

Allow only:

```text
queued → parsing
parsing → inferring | extracting | failed | cancelled
extracting → inferring | failed | cancelled
inferring → criticizing | validating | unresolved | failed | cancelled
criticizing → validating | unresolved | failed | cancelled
validating → completed | unresolved | failed
```

Terminal states cannot transition.

- [ ] **Step 6: Verify repository**

Run: `npm test -- server/test/db/repository.test.ts`

Expected: PASS with temporary DB cleanup.

---

### Task 5: GPT-5.6 Responses Client, Retries, Cancellation, and Telemetry

**Files:**
- Create: `server/src/provider/types.ts`
- Create: `server/src/provider/responses-client.ts`
- Create: `server/src/provider/call-recorder.ts`
- Test: `server/test/provider/responses-client.test.ts`
- Test: `server/test/provider/redaction.test.ts`

**Interfaces:**
- Produces:

```ts
callStructured<T>(request: StructuredCall<T>, signal: AbortSignal): Promise<ProviderResult<T>>
```

- [ ] **Step 1: Write mock-server provider tests**

Cover:

- standard `output[].content[].type === 'output_text'`;
- request body model and `reasoning.effort`;
- `x-api-key` header;
- 429 then success;
- 503 twice then failure;
- timeout;
- abort;
- refusal/empty/incomplete;
- malformed JSON;
- proxy rejection of `json_schema`.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- server/test/provider/responses-client.test.ts`

Expected: FAIL because client is absent.

- [ ] **Step 3: Implement response extraction and typed completion states**

States:

```ts
type ProviderState =
  | 'completed'
  | 'incomplete'
  | 'refusal_empty'
  | 'failed'
  | 'cancelled'
```

Extract only final `output_text`; reject empty or non-completed output with typed errors.

- [ ] **Step 4: Implement retry and timeout**

Retry only network errors, timeout, 429, 502, 503, 504; maximum 2 retries. Backoff is `250ms * 2^attempt + jitter(0..100ms)`. Abort immediately cancels backoff and fetch.

- [ ] **Step 5: Implement structured-output fallback**

First request uses `text.format.type = 'json_schema'`. Only if provider explicitly reports unsupported format, retry the same logical call in strict JSON text mode. Parse and validate with the provided Zod schema.

Malformed output permits exactly one JSON-repair call with a prompt containing the invalid JSON and target schema; it does not rerun the inference prompt.

- [ ] **Step 6: Implement telemetry redaction**

Persist request/response IDs, stage, model, reasoning, times, wall time, provider status, token usage, incomplete details and error code. Tests assert serialized telemetry contains neither API key nor transcript text.

- [ ] **Step 7: Verify provider layer**

Run: `npm test -- server/test/provider`

Expected: all provider tests PASS.

---

### Task 6: Prompts, Context Strategy, Episode Merge, and UI Adapter

**Files:**
- Create: `server/src/prompts/core-inference.ts`
- Create: `server/src/prompts/evidence-extractor.ts`
- Create: `server/src/prompts/critic.ts`
- Create: `server/src/inference/context-strategy.ts`
- Create: `server/src/inference/episode-merger.ts`
- Create: `server/src/report/to-ui-model.ts`
- Test: `server/test/inference/context-strategy.test.ts`
- Test: `server/test/inference/episode-merger.test.ts`
- Test: `server/test/report/to-ui-model.test.ts`

**Interfaces:**
- Produces: `chooseContextPath(transcript, config): 'direct' | 'evidence'`
- Produces: `chunkTranscript(transcript, maxEstimatedTokens): TranscriptChunk[]`
- Produces: `mergeEpisodes(batches, transcript): Episode[]`
- Produces: `toUiCandidateModel(canonical, metadata): CandidateModel`

- [ ] **Step 1: Port prompts verbatim into versioned constants**

Each prompt exports `PROMPT_VERSION` and a builder. Core builder includes the 17-step reasoning policy, hard prohibitions, competing archetypes and exact JSON output contract. Distillation prompt is not added.

- [ ] **Step 2: Write context strategy tests**

Tests verify:

- small transcript chooses direct;
- over-limit transcript chooses evidence;
- chunks never split a normal conversation;
- oversized single conversation splits only at message boundaries;
- a split carries one adjacent context message marked `context_only`;
- token estimate is deterministic.

- [ ] **Step 3: Implement conservative token estimation**

Use `Math.ceil(serializedText.length / 3)` plus fixed prompt/schema reserve. The configured limit is a safety threshold, not the provider maximum.

- [ ] **Step 4: Write and implement Episode merge tests**

Rules:

- identical sorted source ID sets deduplicate;
- conflict keeps lower signal strength and both alternative explanations;
- invalid source IDs are rejected;
- final ordering prefers distinct conversation coverage, then signal strength;
- no LLM call occurs during merge.

- [ ] **Step 5: Write and implement UI adapter tests**

Verify confidence thresholds `0.75` and `0.45`, role verdict mapping, evidence quotations/source IDs, unknown boundaries, and that `structuredClone(canonical)` remains equal after mapping.

- [ ] **Step 6: Verify deterministic components**

Run: `npm test -- server/test/inference server/test/report`

Expected: PASS.

---

### Task 7: Inference Runners and End-to-End Pipeline

**Files:**
- Create: `server/src/inference/evidence-runner.ts`
- Create: `server/src/inference/core-runner.ts`
- Create: `server/src/inference/critic-runner.ts`
- Create: `server/src/inference/pipeline.ts`
- Test: `server/test/inference/pipeline.test.ts`

**Interfaces:**
- Produces:

```ts
runProfileInference(input: PipelineInput): Promise<PipelineResult>
```

- Consumes provider client, repository, schemas, invariants and deterministic components from Tasks 2–6.

- [ ] **Step 1: Write direct-path failing test**

With an injected fake provider:

```ts
expect(result.status).toBe('completed')
expect(fakeProvider.callsByStage('core')).toHaveLength(1)
expect(fakeProvider.callsByStage('extractor')).toHaveLength(0)
expect(fakeProvider.callsByStage('critic')).toHaveLength(0)
```

- [ ] **Step 2: Write fallback-path failing test**

Assert N extractor calls run with bounded concurrency, exactly one core call follows, and merged Episodes retain valid source IDs.

- [ ] **Step 3: Write cancellation test**

Abort while extractors are active and assert every sibling receives abort, no core call starts, and status becomes cancelled.

- [ ] **Step 4: Write Critic tests**

Critic disabled: zero calls. Enabled pass: one call. Enabled revise/unresolved: one call, pipeline returns unresolved, and core is not rerun.

- [ ] **Step 5: Implement runners**

Each runner owns one prompt/schema pair and delegates HTTP only to `responses-client`. It cannot call another runner.

- [ ] **Step 6: Implement pipeline orchestration**

Pipeline updates persisted job stages, selects path, runs core, optionally runs Critic, validates schema/invariants, maps UI model and saves both canonical/UI JSON atomically.

If invariants fail, return `unresolved` for evidence ambiguity and `failed` with `MODEL_POLICY_VIOLATION` for hard attribution/reference violations.

- [ ] **Step 7: Verify model-call ceilings**

Run: `npm test -- server/test/inference/pipeline.test.ts`

Expected: all tests PASS and assertions prove the call ceilings.

---

### Task 8: Job Manager and Fastify Profile Routes

**Files:**
- Create: `server/src/jobs/job-manager.ts`
- Create: `server/src/routes/profile.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/routes/profile.test.ts`

**Interfaces:**
- Produces all `/api/profile/*` routes defined in the design.

- [ ] **Step 1: Write route integration tests with Fastify inject**

Cover:

```text
POST /api/profile/jobs → 202
same idempotency key + same body → same job
same key + different body → 409
GET job → real state DTO
DELETE job → cancelled and idempotent
GET model → canonical + uiModel
DELETE models → model gone, transcript retained
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- server/test/routes/profile.test.ts`

Expected: 404 or missing module failures.

- [ ] **Step 3: Implement JobManager**

Use an in-process `Map<jobId, AbortController>` only for live cancellation; SQLite remains source of truth for durable status. On process restart, jobs left in nonterminal states become failed with `SERVER_RESTARTED`; v1 does not resume paid calls invisibly.

- [ ] **Step 4: Implement request validation and error mapping**

Map typed errors to 400/404/409/413/422/499/502/504. Responses expose stable `code` and safe `message`; stack traces and provider bodies remain server-only.

- [ ] **Step 5: Implement disconnect cancellation**

If the HTTP connection closes during job creation before 202 is sent, abort creation. After 202, the job belongs to the returned job ID and is cancelled only via DELETE; polling disconnect does not cancel it.

- [ ] **Step 6: Verify API**

Run: `npm test -- server/test/routes/profile.test.ts`

Expected: PASS.

---

### Task 9: Frontend API Client and Real Analysis UI

**Files:**
- Create: `src/lib/profileApi.ts`
- Test: `src/lib/profileApi.test.ts`
- Modify: `src/App.tsx:89-174`
- Modify: `src/components/AnalyzingModal.tsx`
- Modify: `src/components/FilePreviewModal.tsx`
- Modify: `src/pages/UploadPage.tsx`
- Modify: `vite.config.ts`
- Modify: `src/data/analysis.ts`

**Interfaces:**
- Produces:

```ts
createProfileJob(request, idempotencyKey): Promise<{ jobId: string }>
getProfileJob(jobId): Promise<ProfileJob>
cancelProfileJob(jobId): Promise<void>
getProfileModel(modelId): Promise<ProfileModelResponse>
pollProfileJob(jobId, options): Promise<ProfileJob>
```

- [ ] **Step 1: Write API client tests**

Mock `fetch` and cover 202 creation, 409, polling to completed, polling to unresolved, safe error mapping and abort-triggered DELETE.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/lib/profileApi.test.ts`

Expected: FAIL because client is absent.

- [ ] **Step 3: Implement API client**

Poll every 1000ms. Accept an AbortSignal. Do not retry 4xx. Retry one transient polling GET failure, then expose the error while leaving the server job queryable.

- [ ] **Step 4: Replace fake analysis flow in App**

`confirmAnalyze` merges ready file transcripts into one Transcript with stable IDs, creates a job and stores `activeJobId`.

Remove `buildCandidateModel` from `finishAnalysis`. On completion, fetch model, set `model` from `uiModel`, derive `CareerProfile`, append import records, clear picked files and open report.

- [ ] **Step 5: Convert AnalyzingModal to controlled status**

New props:

```ts
interface Props {
  job: ProfileJob
  fileCount: number
  onCancel: () => void
}
```

Remove timers, elapsed estimates and `onDone`. Map persisted statuses to the displayed stage list; display exact progress/stageMessage and a cancel button.

- [ ] **Step 6: Handle failed and unresolved outcomes**

Failed/cancelled closes modal and shows actionable toast. Unresolved fetches and displays the conservative model plus Critic issues; it must not display “生成成功” unconditionally.

- [ ] **Step 7: Correct privacy copy**

Replace promises that records are never uploaded with:

```text
文件先在本地解析。只有点击“开始分析”后，归一化后的聊天文本才会发送给 Workgraph 后端和配置的 AI 服务。
```

- [ ] **Step 8: Add Vite proxy**

```ts
server: {
  port: 5173,
  open: true,
  proxy: {
    '/api': 'http://127.0.0.1:8787',
  },
}
```

- [ ] **Step 9: Verify frontend integration**

Run: `npm test -- src/lib && npm run typecheck && npm run build`

Expected: PASS.

---

### Task 10: Adversarial Invariants, Smoke Script, Documentation, and Final Verification

**Files:**
- Create: `server/test/eval/adversarial.test.ts`
- Create: `server/scripts/smoke-profile.ts`
- Create: `test/fixtures/profile-smoke-transcript.json`
- Modify: `README.md`
- Create: `server/README.md`

**Interfaces:**
- Produces: opt-in real-model smoke command.

- [ ] **Step 1: Encode deterministic adversarial gates**

At minimum encode A1, A6, A7, A8, A9, A10, A11, A12 and A14 as invariant/fixture tests. These tests validate output properties, not exact prose.

- [ ] **Step 2: Add real smoke script**

The script:

1. requires `GPT56_API_KEY` and `GPT56_BASE_URL`;
2. prints expected call count and warns that it incurs cost;
3. loads only the synthetic smoke transcript;
4. runs direct path with Critic disabled;
5. validates Candidate Model and invariants;
6. prints model/usage/request ID, never the API key;
7. exits nonzero on unresolved/failed.

- [ ] **Step 3: Document setup and privacy**

`server/README.md` includes environment variables, migration/start commands, API examples with placeholder key, storage/retention behavior, cancellation semantics, and HTTP proxy warning.

Root README distinguishes local parse from model upload and marks dialogue/jobs/auth as mock.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Run local API smoke without paid model**

Start server with a mock provider and run:

```bash
curl -s http://127.0.0.1:8787/api/health
```

Expected:

```json
{"ok":true}
```

Use Fastify integration tests—not production credentials—to verify create/poll/model/delete.

- [ ] **Step 6: Run paid smoke only with explicit approval**

Run only after the user explicitly authorizes a real paid request:

```bash
GPT56_BASE_URL="http://example-proxy" \
GPT56_API_KEY="<secret>" \
npm run smoke:profile
```

Expected: one Core call, schema-valid Candidate Model, invariant pass, telemetry containing request ID and token usage.

- [ ] **Step 7: Final secret and artifact scan**

Search tracked source/config/docs for `sk-`, the supplied real key, transcript fixture leaks, `.db` and `.env`. Expected: no secret or real transcript content; only `.env.example` placeholders.

## Plan Self-Review

- Spec coverage: parser, direct/fallback paths, optional Critic, schema gaps, SQLite, telemetry, cancellation, privacy, UI adapter and frontend polling each have an implementation task.
- Placeholder scan: no TBD/TODO/“implement later” placeholders.
- Type consistency: `Transcript`, `Episode`, `CandidateModel`, `ProfileJob`, `ProfileModelResponse`, `ParsedArchive` and API client signatures are introduced before consumers.
- Scope: dialogue, jobs and auth remain explicitly out of scope.
- Model-call ceilings are asserted in pipeline tests.
- Git commits are intentionally omitted because the project is not a Git repository and no authorization to initialize one was given.


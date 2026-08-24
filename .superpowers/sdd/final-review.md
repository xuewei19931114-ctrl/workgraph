# Workgraph Candidate Profile Backend — Final Review

Reviewer: Senior Code Reviewer  
Scope: Fastify + SQLite profile pipeline vs spec `docs/superpowers/specs/2026-08-21-candidate-profile-backend-design.md` and plan `docs/superpowers/plans/2026-08-21-candidate-profile-backend.md` (Tasks 1–10).  
Method: read-only inspection of production files listed in the review brief. No git. Full suite not re-run. Paid GPT-5.6 smoke not treated as a code defect.

---

### Strengths

- **Architecture matches the intended runtime shape.** Parser stays deterministic in the browser; Fastify owns persistence and a single Core Inference; evidence extraction is a bounded parallel fallback; Critic is implemented, default-off, and never auto-reruns Core. Module boundaries (`parser` / `schemas` / `provider` / `inference` / `prompts` / `report` / `api`) are real, not just folders.
- **Model-call ceilings are enforced in code and tests.** Direct path is one `core` call; fallback is N extractors then one `core`; Critic is zero or one. Sibling abort is wired through a shared `AbortController` (`server/src/inference/pipeline.ts` `runExtractorPool`). JSON repair is a separate `json_repair` stage, not a second inference prompt.
- **Provider client is production-shaped.** `x-api-key` is server-only; retries are limited to network/timeout/429/502/503/504 with abortable backoff; `json_schema` → strict JSON fallback is explicit; telemetry records IDs/tokens/status without prompt, transcript, or key (`server/src/provider/responses-client.ts`, `call-recorder.ts`).
- **Policy invariants are actually gates, not comments.** Missing evidence cannot be non-neutral or high-confidence; AI/third-party attribution without user judgment/correction/reframing/transfer fails hard; risk ceiling cannot exceed capability evidence; five archetype categories are required; ambiguous mixed authorship becomes conservative under-resolved rather than a completed leak.
- **Job lifecycle is durable and restart-safe.** SQLite is source of truth; in-memory `AbortController` map is only for live cancel; `recoverAfterRestart()` fails leftover nonterminal jobs with `SERVER_RESTARTED` instead of silently resuming a paid call (`server/src/jobs/job-manager.ts`, `server/src/index.ts`).
- **Frontend wiring is the real job, not a leftover mock path.** `App.confirmAnalyze` creates a job, polls at 1s, maps failed/cancelled to toast, unresolved to a conservative report (not “生成成功”), and keeps canonical JSON beside the UI model. Privacy copy on Upload/Preview states local parse then confirmed upload. Chat, jobs, URL import, and auth remain mock as specified.
- **Secrets hygiene in inspected sources is clean.** Key is required at `loadConfig`; `.gitignore` covers `.env`, SQLite, WAL; `.env.example` uses placeholders; smoke CLI redacts `GPT56_API_KEY`; browser `src/` does not reference the key or `x-api-key`.
- **Paid smoke script (unrun) is correctly conservative.** It forces Critic off, pins a 400k token budget so the fixture cannot fall into extraction, and fails if telemetry shows `extractor`/`critic` or core count ≠ 1.

---

### Issues

#### Critical (Must Fix)

None found in the inspected production path.

Cancel via `DELETE /api/profile/jobs/:jobId` does abort the live provider call and extraction siblings. API keys do not enter the browser bundle, SQLite telemetry, or route error bodies. Pipeline tests (as written) pin the call ceilings. Missing-evidence-as-weakness is a hard invariant.

#### Important (Should Fix — would block calling this production-complete)

1. **Stage transitions never write `progress` or `stageMessage`**
   - File: `server/src/inference/pipeline.ts:269-325`; `server/src/db/repository.ts:336-338`, `564-568`; `src/components/AnalyzingModal.tsx:24-45`
   - Issue: `transition(status)` persists status only. Jobs are created with `progress = 0` and `stage_message = ''`. `saveModel` updates status/`model_id` but not progress. After the first poll, the UI overwrites the local “任务已创建…” copy with an empty narration and a 0% bar. The stage list still moves because it maps `job.status`.
   - Why it matters: Spec §6 and plan Task 9 require progress/stageMessage from real stage changes, not time fakes. README claims the same. The advertised “real progress UI” is half-wired.
   - Fix: Map each persisted status to a monotonic progress (e.g. queued 0.05 → parsing 0.15 → extracting 0.4 → inferring 0.7 → criticizing 0.85 → validating 0.95 → completed/unresolved 1) and a short Chinese `stageMessage`. Do this inside `updateJobStatus` or `transition()`, not the frontend timer.

2. **Transcript retention is implemented but never run**
   - File: `server/src/db/repository.ts:649-664`; `server/src/index.ts`; `server/README.md:78-80`
   - Issue: `deleteExpiredTranscripts` exists and skips in-flight jobs, but nothing in process startup, shutdown, or a timer calls it.
   - Why it matters: Spec §10 and the server README promise 7-day transcript deletion. Without a sweeper, chat bodies remain in SQLite indefinitely.
   - Fix: Call the sweeper on boot and on a daily interval (or at job completion). Log only the deleted count, never content.

3. **“清空画像” does not delete server models**
   - File: `src/App.tsx:534-546`; `src/lib/profileApi.ts` (no delete helper); `server/src/routes/profile.ts:175-187`
   - Issue: Confirm-clear only wipes localStorage. `DELETE /api/profile/models?candidateId=` exists and is tested, but the UI never calls it. Telemetry rows also remain.
   - Why it matters: Spec §10: Candidate Model is retained until the user clears. Local-only clear leaves canonical JSON on disk for that candidate.
   - Fix: Add `deleteProfileModels(candidateId)` and call it from the clear confirm path; keep local wipe even if the request fails, and surface a toast if the server copy remains.

4. **Unmount / refresh aborts polling but does not cancel the paid job**
   - File: `src/App.tsx:89-94`, `260-270`; `src/lib/runGeneration.ts:65-70`
   - Issue: App unmount calls `invalidate()`, which aborts the local `AbortController` and swallows `AbortError`. It does not `DELETE` the job. Spec §11.4: “组件卸载或用户取消时发送 DELETE.” Button cancel is correct (`cancelCurrent` → DELETE → provider abort).
   - Why it matters: Closing the tab mid-inference leaves GPT-5.6 running and billing. This is not the Critical “cancel API doesn’t abort provider” case — that path works — but it is a spec miss with real cost.
   - Fix: On unmount/unload, if `run.jobId` is set, fire `cancelProfileJob` (`navigator.sendBeacon` or `fetch` keepalive). Keep the modal copy that button-cancel is explicit.

5. **Documented `server/.env` is never loaded**
   - File: `package.json:6-9`; `server/src/index.ts:13`; `README.md:9-12`; `server/README.md:7-40`
   - Issue: Scripts are `tsx watch server/src/index.ts` with no `--env-file` / `process.loadEnvFile`. There is no `dotenv`. `loadConfig(process.env)` only sees exported environment variables.
   - Why it matters: The documented happy path (`cp server/.env.example server/.env` then `npm run dev`) starts a process that throws on missing `GPT56_API_KEY` even when the file is filled in.
   - Fix: `node --env-file=server/.env` (or `process.loadEnvFile('server/.env')` with a missing-file fallback) in `dev:server` and `smoke:profile`. Do not log values.

6. **`PROFILE_ENABLE_CRITIC` is parsed and documented, then ignored**
   - File: `server/src/config.ts:37-40,66`; `server/src/index.ts:22-34`; `server/src/jobs/job-manager.ts:105`; `src/App.tsx:190`
   - Issue: Production always uses `job.options.enableCritic`. The frontend hard-codes `false`. Setting the env var to `true` does nothing.
   - Why it matters: Operators following the server README will believe Critic can be enabled without a client change. The *default* (off) is correct; the control surface is a lie.
   - Fix: Either apply `config.enableCritic || job.options.enableCritic` (request can still force on) and document it, or delete the env var from config/docs and keep request-only control.

7. **A7: high `natural_fit` is allowed under unknown/missing role evidence**
   - File: `server/src/schemas/invariants.ts:475-488`; `server/src/report/to-ui-model.ts:34-45,128-142`; `server/test/eval/adversarial.test.ts:296-310`
   - Issue: `ROLE_INFLATION` caps `readiness` when `evidence_status` is unknown/missing, and `validateClaim` caps `confidence`/polarity. `natural_fit` is unchecked. UI `roleVerdict` can still return `depends` when `natural_fit >= 0.45` even if role evidence is unknown (readiness is forced ≤ 0.4, so `great` is blocked).
   - Why it matters: Global constraint: natural fit, readiness, and seniority are separate, and missing evidence must stay unknown — not become a positive fit signal.
   - Fix: If `evidence_status` is `unknown`/`missing`, require `natural_fit <= 0.4` (same ceiling as readiness) or treat the role as under-resolved in the adapter. Extend the A7 unknown-evidence fixture accordingly.

8. **A11 operator gate is English-token-only while Core must return Chinese JSON**
   - File: `server/src/schemas/invariants.ts:64-66,413-421`; `server/src/prompts/core-inference.ts:90`
   - Issue: `OPERATOR_WITHOUT_ACTION` only fires when `capability.name` matches `/\boperator\b/i`. The Core prompt requires Chinese JSON, so production names like “执行者 / 操盘手” bypass the gate. A12 is better (`判断` is covered). A8 covers `系统思考者` plus a few English attractors.
   - Why it matters: The adversarial gate that is supposed to stop “critique volume = operator strength” will not see typical model output.
   - Fix: Add Chinese (and maybe 执行/落地/操盘) tokens, or key off `emergent_logic` / behavior types rather than the English word “operator”. Keep A8 extra attractors as polish.

9. **POST create does not abort if the client disconnects before 202**
   - File: `server/src/routes/profile.ts:69-98`
   - Issue: Plan Task 8 Step 5: if the HTTP connection closes during creation before 202, abort creation. The handler creates the row, `jobManager.start()`, then sends 202, with no `request.raw` abort listener.
   - Why it matters: A dropped POST can still start a paid Core call whose `jobId` the client never received (idempotency retry may recover if the key was sent).
   - Fix: If `request.raw.aborted` before `reply.send`, `cancel(jobId)` and do not send 202. After 202, only DELETE cancels (already true for poll disconnect).

10. **JSON repair always retries `json_schema` even after an explicit format fallback**
    - File: `server/src/provider/responses-client.ts:461-498`
    - Issue: If the proxy rejects `json_schema`, the same logical call falls back to `json_object`. A parse failure then repair-calls with `json_schema` again.
    - Why it matters: On a schema-incapable proxy, the only repair attempt is the format already known to fail, so a recoverable malformed JSON becomes `PROVIDER_INVALID_OUTPUT`.
    - Fix: Repair with the last format that the proxy accepted for that call.

#### Minor (Nice to Have)

1. **A8/A12 name-token heuristics (carry-forward, partially still valid)**
   - File: `server/src/schemas/invariants.ts:51-70`
   - A8 still misses Chinese generics beyond `系统思考者` (战略思考者, 问题解决者, 强执行). A12 is acceptable because `判断` is matched. Do not block completion on A8 extras once A11 is fixed.

2. **A1 conservative fixture does not replay the AI-authorship scene**
   - File: `server/test/eval/adversarial.test.ts:240-257`
   - The leak scene is covered by the preceding A1 test. The conservative case only clears capabilities. Optional: run `toConservativeUnderResolvedCopy` against the AI-authored episode so the under-resolved transform is proven on that scene.

3. **Smoke script is outside `tsconfig.server.json`**
   - File: `tsconfig.server.json:19`; `server/scripts/smoke-profile.ts`
   - `npm run typecheck` does not include the smoke entry. It runs via `tsx`. Add `server/scripts` to a small tsconfig or a project reference. Do not block.

4. **Cancel during `validating` is not in the state machine**
   - File: `server/src/db/repository.ts:199`; `server/src/inference/pipeline.ts:321-326`
   - Plan Task 4 omits `validating → cancelled`. Abort after the pre-validate check can throw `INVALID_STATUS_TRANSITION` and leave a job stuck until restart recovery. Window is short (local invariants). Allow `validating → cancelled` or finish save when the provider work is already done.

5. **`buildCandidateModel` mock generator is still in the tree**
   - File: `src/data/model.ts:7`
   - Unused by `App.tsx`. Dead code; remove when touching that file.

6. **GET job uses terminal HTTP codes (422/499/502/504/500) for a DTO**
   - File: `server/src/routes/profile.ts:54-61,117-122`
   - The client parses the job body before `ok`, so polling works. Curl/ops and some proxies treat 499/5xx as hard failure. Prefer 200 for GET with `status`/`error` in the body; keep those codes for POST/DELETE failures.

7. **File preview footer still says “分析前仍在你的设备里”**
   - File: `src/components/FilePreviewModal.tsx:72-76`
   - The lead paragraph is correct. The footer is only misleading if read in isolation.

8. **Default `GPT56_BASE_URL` is `https://api.openai.com/v1`**
   - File: `server/src/config.ts:24-30`; client joins `/openai/v1/responses`
   - Combined with issue 5 this is unlikely to be hit if operators follow the proxy-origin docs. Defaulting to a URL that is not a proxy origin is confusing; require the var like the smoke script does.

9. **Open CORS on a no-auth transcript API**
   - File: `server/src/app.ts:21`
   - Default bind is `127.0.0.1`, so v1 is acceptable. If `HOST` is ever `0.0.0.0`, this becomes a data-exfil surface. Restrict origin before any non-loopback deploy.

---

### Carry-forward triage

| Item | Must fix before “complete”? | Severity |
| --- | --- | --- |
| A8 extra Chinese attractors | No | Minor |
| A11 English `operator` vs Chinese JSON | **Yes** | Important |
| A12 `judgment`/`判断` | No | already adequate |
| Smoke script outside `tsconfig.server.json` | No | Minor |
| A1 conservative fixture does not replay AI scene | No | Minor |
| A7 high `natural_fit` under unknown evidence | **Yes** | Important |

---

### Plan alignment

Aligned and present:

- Shared Zod schemas, strict Candidate Model, UI adapter thresholds 0.75 / 0.45.
- Browser `parseArchive` returns stats + Transcript; unmarked text uses `authorship: 'unknown'`; ChatGPT `mapping` / `current_node` traversal; stable SHA-256 IDs.
- Four SQLite tables, versioned migrations, idempotency, legal status transitions, restart failure.
- Responses client, telemetry redaction, extractor concurrency, one Core, optional one Critic, no distillation prompt, no 17-step split into serial model calls.
- Profile routes: POST 202, GET job, DELETE job, GET model, DELETE models.
- Vite `/api` proxy; AnalyzingModal is status-driven; unresolved is not a success toast.
- Chat / jobs / URL import / auth remain mock.
- Smoke is opt-in and refuses without both env vars.

Deviations (problematic, not justified improvements):

- Progress/stageMessage not produced from stage transitions (spec §6, Task 9).
- No disconnect-before-202 abort (Task 8 Step 5).
- No unmount DELETE (spec §11.4).
- Retention sweeper never scheduled (spec §10).
- UI clear does not hit DELETE models (spec §10 “until user clears”).
- `PROFILE_ENABLE_CRITIC` unused (spec §8 env list).
- Plan Task 4 state machine forbids `validating → cancelled`, which fights Task 8 cancel-any-nonterminal.

Justified deviations:

- Report helper is `to-ui-model.ts` (plan File Map), not spec’s `to-ui-candidate-model.ts`.
- Conservative under-resolved copy on `AMBIGUOUS_ATTRIBUTION` instead of hard-fail — matches spec “允许 under-resolved” and keeps hard leaks as `failed`.
- GET job may return non-200 for terminal errors; client tolerates it.

Out of scope (correctly not built): Manager/Founder lenses, Redis/workers, real auth/jobs/chat backends, auto-rerun after Critic `revise`.

---

### Production readiness

**Ready for local/dev profile generation after the Important items above, not for an unsupervised paid or shared deployment.**

Already in good shape: call ceilings, cancel-aborts-provider (explicit DELETE), secret isolation, schema/invariant gates, restart behavior, mock isolation, docs that distinguish local parse from model upload, HTTP-proxy warning.

Not ready without fixes: retention/clear privacy, env-file loading, real progress fields, disconnect/unmount cost leaks, A7/A11 policy holes against Chinese model output.

**Unverified live integration (not a code defect):** Paid GPT-5.6 smoke was intentionally not run. Direct-path live behavior — schema-valid model, token usage, proxy `json_schema` support, and latency under `GPT56_TIMEOUT_MS` — remains unproven. Do not treat that skip as an implementation bug; do treat a first paid job as a required ops gate before any real candidate data.

Automated tests were not re-run in this review. Implementers reported 324+ passing earlier and 5/5 focused smoke tests after Task 10. That history is accepted, not re-verified.

---

### Recommendations

1. Fix Important items 1–8 before calling the backend complete; 9–10 if touching those files anyway.
2. Run `npm run lint && npm run typecheck && npm test && npm run build` once more after those fixes (this review did not).
3. Run paid `npm run smoke:profile` only with explicit approval, against the real proxy, and keep the call-budget assertions.
4. Do not enable Critic in production until eval shows repetitive Core failures; keep the default off.

---

### Verdict

**Ready to merge? With fixes**

**Reasoning:** The pipeline, provider, invariants, job manager, and frontend job flow implement the planned single-Core architecture and do not have a Critical key-leak / extra-stage / missing-as-weakness / cancel-does-not-abort-provider failure in the inspected path. Completion is still blocked by Important gaps: dead progress fields, retention and clear not actually removing server-side transcripts/models, documented `.env` not loaded, unmount/disconnect cost leaks, inert Critic env flag, and A7/A11 policy holes that Chinese Core output can walk through.

**Task quality analog:** not approved as production-complete until Important 1–8 are fixed; architecture and test design are otherwise at the bar of Tasks 1–10.

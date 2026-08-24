# Workgraph Candidate Profile Backend — Remediation Re-review

Reviewer: Senior Code Reviewer  
Scope: Re-review of Important 1–10 from `/.superpowers/sdd/final-review.md`, plus new regressions from those fixes. Architecture already accepted is not reopened.  
Method: read-only inspection of the listed production files and corresponding tests. No git. Focused Vitest: **12 files, 160 passed**. Full suite (reported 354) and paid GPT-5.6 smoke not re-run.

---

### Strengths

- Remediations landed in the places the first review named: repository stage writes, boot sweeper, UI DELETE paths, `loadOptionalEnvFiles`, JobManager critic OR, invariant gates, `commitCreatedJob`, repair format tracking.
- `validating → cancelled` is now a legal transition, so the leftover cancel-vs-state-machine fight is gone.
- Tests exist for each required item (stage map, sweeper interval/stop, keepalive DELETE, dotenv non-overwrite, critic OR, A7 `natural_fit`, A11 Chinese tokens, disconnect-before-202, `json_object` repair). They passed in this review.

---

### Required items

| # | Item | Result |
| --- | --- | --- |
| 1 | Monotonic `progress` + Chinese `stageMessage` from repository | **Pass** |
| 2 | Transcript sweeper on boot + daily interval; count-only log; stop on shutdown | **Pass** |
| 3 | Clear profile → `DELETE /api/profile/models?candidateId=`; local wipe + toast on failure | **Pass** |
| 4 | Unmount / pagehide / discard-local-run keepalive DELETE; button uses explicit DELETE | **Pass** |
| 5 | `server/.env` loaded at process start; no overwrite; missing file ignored; values not logged | **Pass** |
| 6 | `PROFILE_ENABLE_CRITIC` via `config.enableCritic \|\| job.options.enableCritic`; smoke forces off | **Pass** |
| 7 | A7: unknown/missing role evidence rejects `natural_fit > 0.4` (`ROLE_INFLATION`) | **Pass** |
| 8 | A11: Chinese operator tokens trigger `OPERATOR_WITHOUT_ACTION` | **Pass** |
| 9 | POST create cancels if client gone before 202 (`commitCreatedJob`) | **Pass** (Minor race remains) |
| 10 | JSON repair uses last accepted text format | **Pass** |
| — | `validating → cancelled` allowed | **Pass** |

---

### Issue-by-issue

#### 1. Stage progress / stageMessage — Pass

`server/src/db/job-stage.ts` maps queued 0.05, parsing 0.15, extracting 0.4, inferring 0.7, criticizing 0.85, validating 0.95, completed/unresolved 1, with Chinese `STAGE_MESSAGE`. `failed` / `cancelled` keep last progress (`mapped === null`) and still write `生成失败` / `已取消`. `Math.max` prevents rewind.

Applied in `createOrGetProfileJob`, `createJob`, `updateJobStatus`, and `saveModel` — not in `AnalyzingModal`. The modal reads `job.progress` / `job.stageMessage`. Pipeline `transition()` no longer needs to pass progress; the repository fills it. Local App seed is still `progress: 0` until the first poll (Minor).

#### 2. Transcript retention sweeper — Pass

`startTranscriptRetentionSweep` runs immediately, then `setInterval` at 86_400_000 ms, `unref`s the timer, and `stop()` clears it. `server/src/index.ts` wires `repository.deleteExpiredTranscripts` on boot and logs `{ deleted }` only when `deleted > 0`. Shutdown calls `retention.stop()` after `app.close()` and before repository close. Sweeper still skips in-flight jobs. No transcript bodies in logs.

#### 3. Clear profile deletes server models — Pass

`deleteProfileModels` hits `DELETE /api/profile/models?candidateId=` (encoded). `confirmClearProfile` wipes local state first, then awaits the DELETE; success and failure each have a toast. Local wipe happens even if the request throws.

#### 4. Unmount / pagehide / discard cancel — Pass

`cancelProfileJobOnUnload` is `fetch(..., { method: 'DELETE', keepalive: true })`. App: `pagehide` uses live `jobId`; effect cleanup and `discardLocalRun` call `invalidate()` then keepalive DELETE if a `jobId` exists. Button cancel still uses awaited `cancelProfileJob` (no keepalive). Coordinator `invalidate()` returns the job id for that send.

#### 5. `server/.env` loading — Pass

`loadOptionalEnvFiles()` runs at the top of `server/src/index.ts` before `loadConfig()`, and in smoke CLI `isMainModule()` before `runPaidProfileSmoke()`. Keys are applied only when `env[key] === undefined`. `ENOENT` is ignored. No logging of values. `WORKGRAPH_SKIP_DOTENV=1` skips for tests.

#### 6. `PROFILE_ENABLE_CRITIC` — Pass

JobManager uses `enableCriticByDefault || job.options.enableCritic`. Production index passes `config.enableCritic`. Smoke still forces critic off on config, job options, and pipeline input. Frontend still sends `enableCritic: false` (request can force on; env can enable without a client change).

#### 7. A7 `natural_fit` — Pass

Unknown or missing role evidence with `natural_fit > 0.4` emits `ROLE_INFLATION` on `role_fit[n].natural_fit`. Readiness cap is unchanged. `ROLE_INFLATION` remains a hard policy issue, so inflated fit cannot complete. Adversarial test covers unknown + high `natural_fit` with low readiness.

#### 8. A11 Chinese operator tokens — Pass

`mentionsOperator` matches `operator` plus `执行者|执行力|操盘手|操盘|落地`, on both `name` and `emergent_logic`. Adversarial cases include `执行者` and `操盘手`. Bare `执行` is not matched (reasonable; avoids a common verb).

#### 9. POST disconnect before 202 — Pass, with a small race

`commitCreatedJob` starts a newly created job, cancels if `clientGone`, and the route skips 202 on `'cancelled'`. Reused idempotent jobs are not cancelled. Unit test covers created vs reused.

`request.raw.aborted` is a boolean snapshot taken after insert and passed into `commitCreatedJob` (checked after `start()`). There is still no abort *listener*, so a disconnect between that snapshot and `reply.send(202)` can still start a paid call whose `jobId` the client never received. Window is milliseconds. Not a merge-blocker; see Minor 1.

#### 10. JSON repair format — Pass

`acceptedFormat` starts as `json_schema` and becomes `json_object` after an explicit schema-rejection fallback. Repair uses that format. Test asserts the repair request is `json_object` after fallback.

#### Related: `validating → cancelled` — Pass

`allowedTransitions.validating` includes `cancelled`. Repository table-driven test includes `validating → cancelled`. Pipeline catch can now persist cancel after the pre-validate abort check without `INVALID_STATUS_TRANSITION`.

---

### Critical (Must Fix)

None. No new key leak, extra model stage, missing-as-weakness hole, cancel-does-not-abort-provider, or retention logging of transcript bodies.

Cancel still aborts the live `AbortController` (explicit DELETE and keepalive DELETE share that API). JSON repair remains `json_repair`, not a second Core. `load-env` does not print values.

---

### Important (Should Fix)

None of the original ten required items are still missing. No new merge-blocker found in the remediation paths.

---

### Minor (Nice to Have)

1. **POST abort is a snapshot, not a listener.** `commitCreatedJob` also `start()`s even when `clientGone` is already true, then cancels. Skipping `start()` when already aborted would avoid any pipeline work. Re-check `request.raw.aborted` immediately before `reply.send`, or use Fastify `onRequestAbort`.
2. **Optimistic UI still seeds `progress: 0`** in `App.tsx` until the first poll. Harmless; queued is 0.05 on the server.
3. **AnalyzingModal copy** still says cancel is sent only on explicit click. Unmount/pagehide now DELETE too. The first review asked to keep the button-cancel copy; it is now slightly stale.
4. **A7 fixture covers `unknown` only**, not `missing`. Production branch is the same.
5. Carry-forward from the first review (not reopened as blockers): A8 extra Chinese attractors, A1 conservative fixture, smoke script outside `tsconfig.server.json`, GET job terminal HTTP codes, CORS on non-loopback, default `GPT56_BASE_URL`.

---

### New regressions

None that meet Important. The validating cancel fix is the intended related Minor. Sweeper `unref` + shutdown `stop()` does not leave a timer against a closed DB. Env load does not clobber process env. Smoke still cannot enable Critic via `PROFILE_ENABLE_CRITIC`.

---

### Verification

Focused tests run in this review (not the full 354):

`job-stage`, `repository`, `transcript-retention`, `shutdown`, `load-env`, `job-manager`, `routes/profile`, `eval/adversarial`, `responses-client`, `profileApi`, `runGeneration`, `smoke-profile` — **160 passed**.

Paid `npm run smoke:profile` was not run (same ops gate as the first review).

---

### Verdict

**Approved with notes**

**Reasoning:** Important 1–10 and the related `validating → cancelled` transition are implemented in production code and covered by tests. Nothing in the remediation set reintroduces a Critical leak, extra paid stage, or inert control surface. Remaining notes are a short POST-abort TOCTOU, optimistic 0% until first poll, and leftover polish from the first review.

**Ready for local/dev profile generation.** Unsupervised paid or shared deploy still depends on the first paid smoke against the real proxy, which this review did not run.

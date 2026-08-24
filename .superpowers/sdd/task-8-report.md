# Task 8 Report

## Status

Implemented JobManager, Fastify profile routes, production composition, configurable body limit, and SQLite atomic create/reuse plus restart-recovery queries. No frontend or Git operations were performed. Tests use Fastify `inject`, fake pipelines/managers, and local in-memory or temporary SQLite only; no provider network call is made.

## Files

- Created `server/src/jobs/job-manager.ts`
- Created `server/src/routes/profile.ts`
- Modified `server/src/app.ts`
- Modified `server/src/index.ts`
- Modified `server/src/config.ts`
- Modified `server/src/db/repository.ts`
- Created `server/test/jobs/job-manager.test.ts`
- Created `server/test/routes/profile.test.ts`
- Modified `server/test/db/repository.test.ts`
- Created `.superpowers/sdd/task-8-report.md`

## RED / GREEN evidence

- JobManager RED: `npm test -- server/test/jobs/job-manager.test.ts` failed because `src/jobs/job-manager.js` did not exist.
- JobManager GREEN: the same command passed 6 tests.
- Routes RED: `npm test -- server/test/routes/profile.test.ts` failed all initial 9 route tests with 404 because the routes were not registered.
- Routes GREEN: the same command passed after route registration and implementation.
- Error mapping RED: four persisted failure mapping cases returned 200 instead of 422/499/502/504.
- Error mapping GREEN: the route suite passed all cases after adding safe terminal-status mapping.

## API examples

- `POST /api/profile/jobs` returns `202 {"jobId":"job_...","status":"queued"}`.
- Reusing an `Idempotency-Key` with the same canonical request returns the same job without a second Transcript or pipeline start.
- Reusing the key with another request returns `409` and stable `IDEMPOTENCY_CONFLICT`.
- `GET /api/profile/jobs/:jobId` returns the schema-valid safe job DTO.
- `DELETE /api/profile/jobs/:jobId` aborts and waits for a live pipeline; cancelled jobs map to 499 and repeated cancellation remains unchanged.
- `GET /api/profile/models/:modelId` returns canonical model, UI model, Critic, and terminal status.
- `DELETE /api/profile/models?candidateId=...` deletes only models.

## Restart and cancellation evidence

- JobManager tests prove duplicate `start` calls do not duplicate a pipeline and live handles disappear after settlement.
- Rejected pipeline promises are observed and converted to a safe `INTERNAL_ERROR`; no raw exception is persisted.
- Cancellation propagates the per-job AbortSignal and does not resolve until pipeline settlement.
- `recoverAfterRestart()` queries durable nonterminal jobs and marks each failed with `SERVER_RESTARTED`; no pipeline/provider call is resumed.
- `shutdown()` aborts all live controllers and awaits all promises using observed settlement.
- Polling through GET does not invoke cancellation; job execution is owned by JobManager rather than the polling request.

## Error redaction evidence

- Request validation returns only stable code and safe message, without Zod details or Transcript content.
- Stored raw `error_message` is never returned; API messages are selected from a fixed safe allowlist.
- Repository corruption and unexpected exceptions map to `500 INTERNAL_ERROR` without SQLite details or stack traces.
- 400, 404, 409, 413, 422, 499, 502, and 504 mappings are covered by inject tests.

## Self-review

- Durable state remains in SQLite; the JobManager Map contains only live controllers and observed promises.
- Atomic create/reuse runs Transcript and job insertion under one SQLite IMMEDIATE transaction and checks idempotency under the same lock.
- Canonical request hashing recursively sorts object keys and uses SHA-256.
- `index.ts` is the only listen site and composes repository, telemetry recorder, provider, pipeline, manager, restart recovery, and SIGINT/SIGTERM shutdown.
- Production code has no test-only methods and tests do not invoke a real provider.
- The requested targeted tests, typecheck, lint, and full suite pass.

## Concerns

- The service is intentionally single-process for v1. The live AbortController Map is not shared across multiple server processes, while persisted idempotency and restart recovery remain SQLite-safe.
- Shutdown waits for provider cancellation settlement; a provider implementation that ignores AbortSignal could delay process exit until its own timeout.

## Review remediation append — 2026-08-21

### Status

All seven findings in `task-8-review.md` were addressed without frontend or Git changes.

### Additional files

- Created `server/src/shutdown.ts`
- Created `server/test/shutdown.test.ts`
- Modified `server/src/jobs/job-manager.ts`
- Modified `server/src/routes/profile.ts`
- Modified `server/src/config.ts`
- Modified `server/src/index.ts`
- Modified `server/.env.example`
- Expanded job, route, repository, and config tests

### Additional RED / GREEN evidence

- JobManager review RED: three tests failed because aborted rejection became `failed`, persistence failure was not safely reported/swallowed, and a post-snapshot `start` launched a new pipeline.
- JobManager review GREEN: 9/9 tests passed after preserving abort semantics, wrapping every tracked promise and reporter, and setting a synchronous shutdown gate.
- Safe DELETE DTO RED: raw `SECRET persisted error_message` was returned.
- Safe DELETE DTO GREEN: GET and DELETE now both pass through `toSafeProfileJob`; unknown codes retain only their code and a generic fixed message.
- Canonical hash RED: the requested exported code-point hash function was absent.
- Canonical hash GREEN: keys are compared by Unicode code point, including the U+E000/U+10000 ordering regression.
- Config RED: five tests failed for obsolete environment names and 30-day retention.
- Config GREEN: approved profile variable names load correctly and retention defaults to 7 days; `.env.example` matches.
- Production shutdown RED: the sequence helper was absent.
- Production shutdown GREEN: the idempotent shutdown sequence is Fastify close → manager shutdown → repository close.
- Two-connection SQLite verification passed with two simultaneously released child processes using independent repository connections: exactly one job, one Transcript, and zero orphans. The existing IMMEDIATE transaction already provided the required atomic behavior, so no repository production change was necessary for this finding.

### Additional safety evidence

- Aborted provider/pipeline rejection persists and returns `cancelled/CANCELLED`.
- Repository failures during pipeline failure handling are swallowed by the internally tracked promise and sent to an injected error reporter; the reporter itself cannot create a rejection.
- `shutdown()` sets its gate before taking the live-handle snapshot. A later `start` cannot launch a pipeline and is persisted as `SERVER_SHUTTING_DOWN`.
- Production stops accepting Fastify traffic before taking the manager shutdown snapshot, then awaits active cancellation before closing SQLite.
- No test invokes the real provider.

### Remaining concerns

- The v1 live-job registry remains process-local by design.
- A provider that ignores AbortSignal can delay graceful shutdown until its configured timeout.

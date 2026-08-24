# Task 8: Job Manager and Fastify Profile Routes

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git.
- Strict TDD with Fastify `inject`; fake pipeline/provider only.
- SQLite is durable state; in-memory Map holds only live AbortControllers/promises.
- HTTP responses never expose API key, transcript text, provider body, stack trace, or SQLite internals.
- A returned 202 job continues independently of polling connections.
- Cancellation is explicit through DELETE and idempotent.
- Do not change frontend in this task.

## Files

- Create: `server/src/jobs/job-manager.ts`
- Create: `server/src/routes/profile.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/index.ts`
- Modify as necessary: `server/src/db/repository.ts` and tests for atomic create/restart recovery.
- Test: `server/test/routes/profile.test.ts`
- Test: `server/test/jobs/job-manager.test.ts`

## API

### POST `/api/profile/jobs`

Body validates with `CreateProfileJobRequestSchema`:

```json
{
  "candidateId": "candidate_123",
  "transcript": {},
  "options": { "enableCritic": false }
}
```

Optional `Idempotency-Key`.

Response `202`:

```json
{ "jobId": "job_123", "status": "queued" }
```

Same key + canonical request hash returns same job and does not start another pipeline or create duplicate Transcript. Same key + different hash returns 409.

### GET `/api/profile/jobs/:jobId`

Returns schema-valid job DTO with status, progress, stageMessage, modelId, criticVerdict, safe error.

### DELETE `/api/profile/jobs/:jobId`

Aborts live pipeline, waits for cancellation settlement, persists cancelled, and is idempotent. Cancelling a completed/failed/unresolved job returns its unchanged terminal status.

### GET `/api/profile/models/:modelId`

Returns canonical Candidate Model, UI model, Critic and status.

### DELETE `/api/profile/models?candidateId=...`

Deletes models only; transcripts/jobs remain.

## JobManager interface

```ts
interface JobManager {
  start(jobId: string): void
  cancel(jobId: string): Promise<ProfileJob>
  isRunning(jobId: string): boolean
  recoverAfterRestart(): number
  shutdown(): Promise<void>
}
```

- `start` is non-blocking but internally stores and observes the promise so no unhandled rejection occurs.
- The pipeline receives one AbortController per job.
- On completion/failure the live Map entry is removed.
- `recoverAfterRestart` marks all nonterminal persisted jobs failed with `SERVER_RESTARTED`; v1 never resumes paid calls.
- `shutdown` aborts all active jobs and awaits settlement.

## Required RED tests

JobManager:

- start once; duplicate start does not duplicate pipeline;
- completion removes live handle;
- rejected pipeline is observed and persists safe failure;
- cancel propagates signal and waits;
- cancel idempotent;
- restart recovery fails every nonterminal job;
- shutdown aborts/settles all jobs with no unhandled rejection.

Routes:

- POST valid → 202;
- invalid Transcript → 400 `INVALID_TRANSCRIPT`;
- same idempotency key/body → same job, one Transcript and one pipeline;
- same key/different body → 409 `IDEMPOTENCY_CONFLICT`;
- request body over configured limit → 413;
- GET known/unknown job;
- DELETE live/terminal/unknown job;
- GET known/unknown model;
- DELETE models preserves Transcript/job;
- error mapping: 400/404/409/413/422/499/502/504;
- errors contain stable code/safe message only;
- polling disconnect does not cancel job.

## Persistence and wiring

- Add an atomic repository method for create-or-get idempotent job + Transcript so concurrent POSTs cannot leave orphan Transcript rows.
- Canonical request hash uses deterministic JSON serialization plus SHA-256.
- `buildApp` accepts injected repository/job manager for tests; production `index.ts` creates config, repository, provider, pipeline, manager, runs restart recovery, registers graceful SIGINT/SIGTERM shutdown, and then listens.
- `index.ts` remains the only `app.listen` call site.
- Register a Fastify body limit from config; request-too-large maps to 413.

## Error mapping

- 400 `INVALID_TRANSCRIPT`
- 404 `JOB_NOT_FOUND` / `MODEL_NOT_FOUND`
- 409 `IDEMPOTENCY_CONFLICT`
- 413 `TRANSCRIPT_TOO_LARGE`
- 422 `MODEL_POLICY_VIOLATION`
- 499 `CANCELLED`
- 502 provider network/unavailable/rejected/invalid output
- 504 `PROVIDER_TIMEOUT`
- 500 `INTERNAL_ERROR`

Never return raw `error.message` unless it is an explicitly safe application error.

## Verification

```bash
npm test -- server/test/jobs server/test/routes/profile.test.ts
npm run typecheck
npm run lint
npm test
```

All pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-8-report.md` with status, files, RED/GREEN evidence, API examples, restart/cancellation evidence, error redaction evidence, self-review and concerns. Return only status, test summary and concerns.

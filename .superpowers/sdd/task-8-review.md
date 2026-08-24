# Task 8 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality: REJECTED

## Required fixes

1. Centralize safe job DTO mapping for both GET and DELETE. Never return persisted raw `error_message`; map known error codes to fixed safe messages and use a generic message otherwise.
2. If a pipeline rejects after its signal was aborted, persist/return `cancelled`, not `failed/INTERNAL_ERROR`.
3. Make every internally tracked job promise settle without an unhandled rejection even when repository updates/finalization throw. Add an injected safe error reporter and regression test persistence failure.
4. Eliminate shutdown race:
   - JobManager enters `shuttingDown` before snapshot and rejects/terminally handles new starts;
   - production shutdown stops Fastify from accepting new work before taking the manager shutdown snapshot;
   - abort and await all active jobs before repository close.
5. Align environment variables/defaults with approved design:
   - `PROFILE_CONTEXT_TOKEN_LIMIT`
   - `PROFILE_EXTRACTOR_CONCURRENCY`
   - `PROFILE_ENABLE_CRITIC`
   - `WORKGRAPH_DB_PATH`
   - `TRANSCRIPT_RETENTION_DAYS`
   - retention default 7 days.
   Update config tests and `.env.example`.
6. Replace locale-dependent canonical JSON key sorting with deterministic code-point comparison; test different object key insertion orders produce the same hash/job.
7. Add a two-connection concurrency test proving the same idempotency key/body creates one job and one Transcript without orphan rows.

## Verification

- Strict RED/GREEN; append evidence to task-8-report.md.
- Run job, route, repository, config tests; full suite; typecheck; lint.

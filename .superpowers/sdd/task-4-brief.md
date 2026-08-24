# Task 4: SQLite Migrations and Repository

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git operations.
- Strict TDD with observed RED before production code.
- Use `better-sqlite3` installed in Task 1.
- SQLite is the durable source of truth; all JSON reads must pass Task 2 Zod schemas.
- Do not store API keys, prompt text, transcript snippets, or provider response bodies in telemetry.
- Do not implement provider calls, inference, routes, jobs, or frontend integration.

## Files

- Create: `server/migrations/001_initial.sql`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/repository.ts`
- Test: `server/test/db/repository.test.ts`

## Interface

```ts
createRepository(dbPath: string): ProfileRepository
```

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
close()
```

## Required schema

Create tables from the approved design:

- `transcripts`: id, candidate_id, source_type, content_json, content_hash, created_at, expires_at.
- `analysis_jobs`: id, candidate_id, transcript_id, idempotency_key, request_hash, status, progress, stage_message, options_json, model_id, critic_verdict, error_code, error_message, created_at, updated_at.
- `candidate_models`: id, candidate_id, job_id, canonical_json, ui_json, critic_json, created_at.
- `provider_calls`: id, job_id, provider_request_id, provider_response_id, stage, model, reasoning_effort, status, started_at, ended_at, wall_ms, input_tokens, output_tokens, reasoning_tokens, incomplete_details, error_code.

Indexes: candidate IDs, job status, created times, and unique non-null idempotency key.

## Required TDD behavior

Tests first must cover:

```ts
const transcript = repo.createTranscript(validTranscript, retentionDate)
const job = repo.createJob({ candidateId, transcriptId: transcript.id, idempotencyKey, requestHash })
expect(repo.findIdempotentJob(idempotencyKey, requestHash)?.id).toBe(job.id)
expect(() => repo.findIdempotentJob(idempotencyKey, 'different')).toThrow(/IDEMPOTENCY_CONFLICT/)
```

Also cover:

- migrations are idempotent;
- legal and illegal job status transitions;
- terminal states cannot transition;
- stored Transcript/Canonical/UI JSON is schema-validated on read;
- model deletion preserves Transcript;
- expired Transcript deletion does not delete non-expired rows;
- provider telemetry round trip contains metadata only;
- foreign keys enforced;
- repository close.

Run the repository test and record RED before implementation.

## Allowed state transitions

```text
queued → parsing
parsing → inferring | extracting | failed | cancelled
extracting → inferring | failed | cancelled
inferring → criticizing | validating | unresolved | failed | cancelled
criticizing → validating | unresolved | failed | cancelled
validating → completed | unresolved | failed
```

Terminal states cannot transition.

## Implementation requirements

- Run migrations transactionally and record applied migration versions.
- Enable `PRAGMA foreign_keys = ON` and WAL for file-backed DB; tests may use temporary files.
- Use generated stable opaque IDs with entity prefixes; repository-generated DB entity IDs may use crypto randomness (Transcript message IDs remain deterministic and are outside this task).
- Use transactions for model save + job model/status update where applicable.
- Throw typed repository errors with stable codes, including `IDEMPOTENCY_CONFLICT`, `INVALID_STATUS_TRANSITION`, `NOT_FOUND`, and `CORRUPT_STORED_JSON`.
- Never silently coerce malformed JSON.

## Verification

```bash
npm test -- server/test/db/repository.test.ts
npm run typecheck
```

Both pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-4-report.md` with status, files, RED/GREEN evidence, migration decisions, self-review, concerns. Return only status, one-line test summary and concerns.

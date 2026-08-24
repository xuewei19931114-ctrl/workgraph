# Task 5 Report

## Status

Complete. Added the GPT-5.6 Responses structured client, retry/timeout/cancellation behavior, schema fallback and one-shot JSON repair, safe telemetry, and the Task 4 repository adapter. No Git operations were performed.

## Files

- `server/src/provider/types.ts`
- `server/src/provider/responses-client.ts`
- `server/src/provider/call-recorder.ts`
- `server/src/db/migrate.ts`
- `server/src/db/repository.ts`
- `server/migrations/002_nullable_provider_call_job.sql`
- `server/test/provider/responses-client.test.ts`
- `server/test/provider/redaction.test.ts`
- `server/test/db/repository.test.ts`
- `.superpowers/sdd/task-5-report.md`

## RED evidence

Before provider production files existed:

```text
npm test -- server/test/provider
Exit code: 1
Test Files: 2 failed
Cause: Cannot find module '../../src/provider/responses-client.js'
```

This was the expected missing-feature failure. All provider tests use local `127.0.0.1` HTTP servers, synthetic content, and a fake API key.

During self-review, strengthening the endpoint assertion exposed a normalization
regression before its fix:

```text
Expected: /openai/v1/responses
Received: ///openai/v1/responses
```

The URL normalization implementation was then corrected and the complete
provider suite was rerun to GREEN.

## GREEN evidence

After implementation:

```text
npm test -- server/test/provider
Exit code: 0
Test Files: 2 passed
Tests: 18 passed

npm run typecheck
Exit code: 0
```

IDE diagnostics also reported no linter errors in the provider source and tests.

## Retry and abort decisions

- Retryable conditions are limited to network errors, per-attempt timeout, and HTTP 429/502/503/504.
- There are at most two retries after the initial attempt.
- Backoff is `250ms * 2^attempt + jitter`, with injected jitter clamped to 0–100ms.
- Every HTTP attempt gets its own configured timeout.
- Caller cancellation is distinguished from timeout, cancels fetch or injected backoff immediately, returns `cancelled`, and is never retried.
- Base URLs already ending in `/openai/v1` are normalized before appending `/openai/v1/responses`.
- Only a structured, explicit unsupported-schema error enables the `json_object` fallback.
- Malformed or parser-invalid completed output causes exactly one separate `json_repair` logical call; original instructions and input are not rerun.

## Telemetry redaction evidence

- Telemetry contains only identifiers, stage/model/reasoning, timestamps/duration, provider state, token counts, safe incomplete codes, and safe error/cancellation codes.
- Errors use fixed local messages and never include caught exception text or response bodies.
- Incomplete details are allowlisted rather than copied verbatim.
- A serialization test asserts absence of the configured API key, prompt/input marker, malformed JSON marker, and raw provider response marker.
- The repository adapter accepts the existing Task 4 `recordProviderCall` shape and never passes content fields.

## Self-review

- Confirmed the request model and reasoning values are sourced from the existing typed config and remain fixed by that interface.
- Confirmed final-output parsing selects the last `output_text` only and never fabricates output for refusal, empty, or incomplete responses.
- Confirmed retry limits, timeout cleanup, abort behavior during fetch/backoff, usage parsing, request/response IDs, schema fallback, one-shot repair, endpoint normalization, and telemetry fields are exercised by local integration tests.
- Confirmed provider/telemetry failures cannot serialize prompts, keys, malformed output, parser exception messages, or raw provider bodies.
- Scope is limited to provider client/types/recorder, provider tests, and the
  required nullable `provider_calls.job_id` compatibility migration/repository
  update; no routes, business prompts, pipeline, frontend, or Git changes were
  added.

## Concerns

- Telemetry recorder exceptions are intentionally isolated from inference results. A later orchestration layer may need an operational metric for recorder failures without logging sensitive call content.
- Migration 002 rebuilds only the `provider_calls` metadata table to make
  `job_id` nullable. It preserves all existing columns and rows, but takes the
  normal migration write lock during startup.

## Review follow-up RED evidence

Regression tests were added before the review fixes. The provider suite failed
with the expected seven findings:

```text
npm test -- server/test/provider
Exit code: 1
Tests: 7 failed, 24 passed
- jobless telemetry was dropped (expected 1 persisted call, received 0)
- injected sleep failure returned cancelled instead of failed/network_error
- normal backoff removed 0 of 1 caller abort listeners
- final refusal incorrectly returned completed
- incomplete repair incorrectly returned incomplete
- refusal repair incorrectly returned refusal_empty
- empty repair incorrectly returned refusal_empty
```

The affected repository suite also failed before the compatibility migration:

```text
npm test -- server/test/db/repository.test.ts
Exit code: 1
Tests: 2 failed, 37 passed
- migration 002 was absent
- jobless provider call hit provider_calls.job_id NOT NULL
```

The listener regression was independently rerun after correcting its test
fixture to use the production sleep implementation:

```text
npm test -- server/test/provider/responses-client.test.ts \
  -t "removes the caller abort listener"
Exit code: 1
Expected removed listeners: 1
Received: 0
```

The added redaction coverage uses only local mock HTTP servers and verifies HTTP
error body, strict-format fallback, incomplete, refusal, and caller-abort paths.
Each serialized telemetry/result assertion excludes the fake key, prompt/input
marker, malformed JSON marker, and raw provider body marker.

## Review follow-up GREEN evidence

After the minimal fixes:

```text
npm test -- server/test/provider
Exit code: 0
Test Files: 2 passed
Tests: 31 passed

npm test -- server/test/db/repository.test.ts
Exit code: 0
Test Files: 1 passed
Tests: 39 passed

npm run typecheck
Exit code: 0
```

Static diagnostics reported no linter errors in the affected provider,
repository, migration, and test paths.

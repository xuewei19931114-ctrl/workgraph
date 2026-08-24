# Task 5 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality: REJECTED

## Required fixes

1. Select only the final output content. If the final message/content is refusal, return typed `refusal_empty`; never accept an earlier `output_text`.
2. If JSON repair returns incomplete/refusal/empty/invalid, convert it to typed failure. Caller cancellation remains `cancelled`.
3. Telemetry must persist calls even when jobId is absent. Make provider_calls.job_id nullable if needed and update repository/recorder tests; no call may disappear silently.
4. Remove caller abort listeners after normal backoff completion as well as abort; add a listener-cleanup regression test.
5. Distinguish injected sleep/backoff failures from cancellation. Only an actually aborted caller signal returns `cancelled`; other sleep errors return typed failure.
6. Add redaction regression tests for HTTP error body, strict-format fallback, incomplete/refusal, and abort paths. Serialized telemetry/errors must not contain key, prompt/input marker, malformed JSON, or raw provider body.

## Verification

- Strict RED/GREEN for each fix and append evidence to task-5-report.md.
- Run provider tests, affected repository tests, and normal typecheck.

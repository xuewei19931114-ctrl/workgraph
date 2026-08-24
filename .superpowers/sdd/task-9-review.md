# Task 9 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality: REJECTED

## Required fixes

1. Cancellation failure must retain the active job and current idempotency key. Do not clear local state or abort polling before DELETE succeeds. On successful server cancellation, abort local polling and clear only after terminal response.
2. Add a tested run-generation coordinator:
   - only one analysis confirmation can be active;
   - every async update checks it still belongs to the current run;
   - starting/invalidation prevents stale progress/model/record writes;
   - component unmount invalidates the generation and aborts local network work without implicitly deleting the server job;
   - terminal cleanup affects only its own run.
3. Validate persisted candidate IDs as UUIDs. Invalid/non-UUID values are replaced and persisted; tests must not treat `persisted-id` as valid.
4. Add regression tests for coordinator concurrency, stale completion, invalidation/unmount semantics, cancel failure key retention, and UUID replacement. Pure extracted helpers are preferred over adding a heavy browser test framework.

## Verification

- Strict RED/GREEN and append evidence to task-9-report.md.
- Run frontend tests, full suite, typecheck, lint, and build.

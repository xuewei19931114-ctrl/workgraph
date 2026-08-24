# Task 4 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality: REJECTED

## Required fixes

1. Retention: make `analysis_jobs.transcript_id` nullable with `ON DELETE SET NULL`. Expired transcripts may be deleted when no nonterminal job uses them; terminal job history remains with null transcript ID. Add tests proving terminal-job transcript deletion and active-job retention.
2. Convert SQLite unique-key races in `createJob` to stable `IDEMPOTENCY_CONFLICT`; preserve the existing job lookup behavior for same key/hash.
3. Make migration application cross-process safe: acquire an immediate transaction/lock and re-check migration version after acquiring it before executing DDL.
4. Close the database when WAL setup or migration initialization fails.
5. Add table-driven tests for every allowed transition and every terminal state (`completed`, `unresolved`, `failed`, `cancelled`) rejecting further transitions.
6. Add an explicit corrupt `canonical_json` read test in addition to Transcript/UI corruption.

## Verification

- Add each regression test before implementation and record RED/GREEN.
- Append evidence to `task-4-report.md`.
- Run repository tests and normal typecheck.

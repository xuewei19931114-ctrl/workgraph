# Task 7 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality / report evidence: REJECTED

## Required fixes

1. Ambiguous attribution cannot persist the original positive/high-confidence model. Add a deterministic conservative transformation that:
   - selects the null/under-resolved archetype;
   - caps explanatory/outcome and affected mechanism/capability confidence at 0.4;
   - changes unsupported structured claims to `evidence_status: unknown` and `claim_polarity: neutral`;
   - sets seniority to unknown/null;
   - prevents positive natural-fit/readiness assertions unsupported by clean evidence;
   - re-validates schema/invariants before saving.
   Persist this conservative copy with terminal status unresolved.
2. Add Critic semantic invariants:
   - `pass` requires zero issues;
   - `revise`/`unresolved` require at least one material issue;
   - every Critic `evidence_id` must resolve to a Transcript message ID or Candidate Model Episode ID;
   - duplicate/empty issue IDs/messages are rejected.
3. Preserve provider failure semantics through runners/pipeline. Pipeline error codes must distinguish timeout, network error, unavailable/retry exhausted, rejection/refusal, invalid output, cancellation, model policy violation, and unexpected internal failure. Unexpected exceptions must not be mislabeled policy violations.
4. Add an Extractor-first-failure regression test: one active Extractor rejects, active siblings observe abort, queued chunks never start, all promises settle, no Core starts, and no unhandled rejection event occurs.
5. Fix the four existing ESLint errors in `server/src/app.ts`, `server/test/provider/redaction.test.ts`, and `server/test/schemas/profile-schemas.test.ts` without changing tested behavior.

## Re-review finding

6. The conservative under-resolved copy must not retain positive user-facing prose from the original model. In particular, remove role-fit entries or replace every reason with explicit neutral “insufficient evidence” text. Also audit and neutralize/clear capability, risk, archetype-definition, and summary prose that the UI renders, while preserving raw Episodes/evidence for traceability. Add a regression that starts with strongly positive prose (`Strong fit`, high capability, positive summary) and asserts none survives in the unresolved UI model.

## Verification

- Strict RED/GREEN and append evidence to task-7-report.md.
- Run pipeline tests, full suite, typecheck, and lint.

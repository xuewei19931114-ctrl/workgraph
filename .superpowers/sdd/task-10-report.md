# Task 10 Report

## Status

DONE_WITH_CONCERNS. Encoded adversarial eval gates A1, A6, A7, A8, A9, A10, A11, A12, and A14; added the opt-in paid smoke script and synthetic fixture; updated root and server docs; ran lint, typecheck, full tests, and build. Paid GPT-5.6 smoke (brief Step 6) was not executed, as instructed. No Git operations.

## What you implemented

Deterministic adversarial fixtures in `server/test/eval/adversarial.test.ts` assert output **properties** via `validateCandidateInvariants` and schema fields. They never call a model.

| Case | Expected property | Gate |
| --- | --- | --- |
| A1 | No expert inference from an AI framework the user only accepted | existing `AI_ATTRIBUTION_LEAK` |
| A6 | Missing people-management evidence is unknown, not “poor manager” | existing `MISSING_AS_WEAKNESS` |
| A7 | Natural fit and readiness stay independent; high readiness is rejected while role evidence is unknown | schema fields + `ROLE_INFLATION` on `readiness` |
| A8 | Generic “systems thinker” attractor is rejected | new `GENERIC_ATTRACTOR` |
| A9 | Pasted boss/investor framework stays third-party | existing `THIRD_PARTY_ATTRIBUTION_LEAK` |
| A10 | Thin/unknown evidence keeps conservative confidence | existing `MISSING_AS_WEAKNESS` |
| A11 | Critique without action/convergence does not infer operator strength | new `OPERATOR_WITHOUT_ACTION` |
| A12 | High agency is not collapsed into judgment | new `AGENCY_JUDGMENT_COLLAPSE` + separate agency fields |
| A14 | Outcome validation may be high while the latent model stays under-resolved | schema fields `outcome_validation_confidence` vs `explanatory_confidence` |

New invariant codes were added to `validateCandidateInvariants` and included in pipeline `HARD_POLICY_ISSUES`. Existing schema and pipeline were reused; no second pipeline or Candidate Model schema was introduced.

`server/scripts/smoke-profile.ts`:

- refuses unless both `GPT56_API_KEY` and `GPT56_BASE_URL` are set (stricter than `loadConfig`, which defaults the base URL);
- prints a cost warning and expected call count of **1** (direct Core, critic forced off);
- loads only `test/fixtures/profile-smoke-transcript.json`;
- runs `runProfileInference` against an in-memory DB;
- validates Candidate Model + invariants;
- prints model / usage / request IDs from telemetry only;
- never logs the API key, prompt, or transcript body;
- exits nonzero on unresolved/failed or leftover invariant issues.

Root README now distinguishes local parse from confirmed upload. Chat, jobs, URL import, and auth remain mock. `server/README.md` documents env vars, auto-migration on start, API examples with placeholder key, storage/retention, cancellation, and the HTTP-proxy warning. `server/.env.example` documents `GPT56_BASE_URL` as the proxy origin (client appends `/openai/v1/responses`).

## What you tested and results

| Command | Result |
| --- | --- |
| `npm test -- server/test/eval/adversarial.test.ts server/test/scripts/smoke-profile.test.ts` (RED) | 6 failed / 11 passed (17) |
| same + `server/test/schemas/invariants.test.ts` (GREEN) | 61 passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 23 files, **324 passed** |
| `npm run build` | exit 0; Vite 135 modules |
| `npm test -- server/test/health.test.ts server/test/routes/profile.test.ts` | 17 passed (`GET /api/health` → `{ ok: true }`; create/poll/model/delete via Fastify inject) |
| `env -u GPT56_API_KEY -u GPT56_BASE_URL npm run smoke:profile` | exit 1, `Refusing to run paid profile smoke. Set GPT56_API_KEY and GPT56_BASE_URL.` |
| paid `npm run smoke:profile` with real credentials | **not run** (explicit instruction) |

## TDD Evidence

### RED

```bash
npm test -- server/test/eval/adversarial.test.ts server/test/scripts/smoke-profile.test.ts
```

```
Test Files  2 failed (2)
     Tests  6 failed | 11 passed (17)
```

Assertion failures (feature missing, not typos):

- A7: `expected [] to include 'ROLE_INFLATION'`
- A8: `expected [] to include 'GENERIC_ATTRACTOR'`
- A11: `expected [] to include 'OPERATOR_WITHOUT_ACTION'`
- A12: `expected [] to include 'AGENCY_JUDGMENT_COLLAPSE'`
- smoke script: `ERR_MODULE_NOT_FOUND` for `server/scripts/smoke-profile.ts` (status ≠ 0, but output did not yet mention `GPT56_API_KEY`)
- smoke fixture: `ENOENT` `test/fixtures/profile-smoke-transcript.json`

The 11 passing tests were A1/A6/A9/A10/A14 plus conservative fixtures that already matched existing invariant codes.

### GREEN

```bash
npm test -- server/test/eval/adversarial.test.ts server/test/scripts/smoke-profile.test.ts server/test/schemas/invariants.test.ts
```

```
Test Files  3 passed (3)
     Tests  61 passed (61)
```

After implementing the new invariant checks, smoke script, and synthetic fixture.

## Files changed

Created:

- `server/test/eval/adversarial.test.ts`
- `server/test/scripts/smoke-profile.test.ts`
- `server/scripts/smoke-profile.ts`
- `test/fixtures/profile-smoke-transcript.json`
- `server/README.md`
- `.superpowers/sdd/task-10-report.md`

Modified:

- `server/src/schemas/invariants.ts` — `GENERIC_ATTRACTOR`, `OPERATOR_WITHOUT_ACTION`, `AGENCY_JUDGMENT_COLLAPSE`; readiness inflation
- `server/src/inference/pipeline.ts` — new codes in `HARD_POLICY_ISSUES`
- `README.md` — local parse vs confirmed upload; mock vs real backend
- `server/.env.example` — `GPT56_BASE_URL` is the proxy origin
- `.superpowers/sdd/progress.md` — Task 10 complete

## Self-review findings

- Reused `CandidateModelSchema`, `TranscriptSchema`, `validateCandidateInvariants`, `runProfileInference`, `createResponsesClient`, `loadConfig`, and `buildApp`. No second pipeline.
- Adversarial tests mutate parsed fixtures (same style as `server/test/schemas/invariants.test.ts`) and assert codes/fields, not prose.
- A8/A11/A12 matching is deterministic and name-based (`systems thinker`, `\boperator\b`, `\bjudgment\b` / `判断`). A precise capability whose English name happens to contain those tokens will fail the same gates.
- Smoke env check runs before `loadConfig`, transcript load, and provider construction. Telemetry printer only emits stage, model, status, IDs, and token counts.
- Unpaid API smoke used Fastify `inject` (`health.test.ts` / `profile.test.ts`), not a long-lived server and not production credentials.
- Secret scan: no `sk-` keys, no `.env` or `.db` artifacts, no real chat content in the smoke fixture. `GPT56_API_KEY` appears only as the env **name** or `replace-with-your-api-key`. Browser `src/` and `dist/` contain no `GPT56_API_KEY` / `x-api-key` / `openai.gpt-5.6-sol`.
- `server/scripts/smoke-profile.ts` is linted but not part of `tsconfig.server.json` (`rootDir` is `server/src`), so `npm run typecheck` does not typecheck the script. ESLint and the smoke tests do cover it.

## Concerns

1. Paid GPT-5.6 smoke was skipped on purpose; schema-valid live output is therefore not proven in this session.
2. Generic-attractor / operator / judgment gates depend on capability or archetype **names**, not a separate taxonomy field. That is deterministic and test-locked, but language-sensitive.
3. Smoke script lives outside `tsconfig.server.json`, so server `tsc` does not typecheck it.

## Review remediation

Fixed the two Important smoke findings. Did not run paid GPT-5.6. No Git operations.

`server/scripts/smoke-profile.ts` now:

- fails when telemetry includes `extractor` or `critic`, when `core` count is not exactly 1, or when `json_repair` occurs more than once;
- pins `maxEstimatedTokens` to `SMOKE_MAX_ESTIMATED_TOKENS` (400000) and `fixedPromptAndSchemaReserve` to 20000 so the synthetic fixture cannot take the evidence-extraction path via a low `PROFILE_CONTEXT_TOKEN_LIMIT`;
- prints `Error.message` from CLI `.catch` via `formatSafeSmokeError`, redacting supplied secrets (CLI passes `GPT56_API_KEY`) and never dumping prompt or transcript objects.

### RED

```bash
npm test -- server/test/scripts/smoke-profile.test.ts
```

Stubs returned `null` / `Paid profile smoke failed.`:

```
Test Files  1 failed (1)
     Tests  3 failed | 2 passed (5)
```

Assertion failures (feature missing, not typos):

- extractor/critic stages: `expected null to deeply equal Any<String>`
- core count !== 1: `expected null to deeply equal Any<String>`
- catch printer: `expected 'Paid profile smoke failed.' to match /Provider timeout/`

### GREEN

```bash
npm test -- server/test/scripts/smoke-profile.test.ts
```

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

`npx eslint server/scripts/smoke-profile.ts server/test/scripts/smoke-profile.test.ts` exit 0. Paid `npm run smoke:profile` with real credentials was not run.

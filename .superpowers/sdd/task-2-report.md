# Task 2 Report: Canonical Schemas and Policy Invariants

## Status

Completed. Canonical profile/UI schemas and non-mutating policy invariant validation are implemented within the Task 2 file boundary.

## Files changed

- Created `shared/profile-schemas.ts`
- Created `shared/ui-model.ts`
- Created `server/src/schemas/invariants.ts`
- Created `server/test/schemas/profile-schemas.test.ts`
- Created `server/test/schemas/invariants.test.ts`
- Created `.superpowers/sdd/task-2-report.md`

No Git repository was initialized and no commit was created. No API key or provider call was used.

## Observed RED

1. Schema RED:

   ```text
   npm test -- server/test/schemas/profile-schemas.test.ts
   Exit code: 1
   Test Files 1 failed (1)
   Error: Cannot find module '../../../shared/profile-schemas.js'
   ```

   This was the expected failure because the schema tests were written before `shared/profile-schemas.ts`.

2. Invariant RED:

   ```text
   npm test -- server/test/schemas/invariants.test.ts
   Exit code: 1
   Test Files 1 failed (1)
   Error: Cannot find module '../../src/schemas/invariants.js'
   ```

   This was the expected failure because the invariant tests were written before `validateCandidateInvariants`.

3. Additional policy RED after adding source-authorship and missing-prediction cases:

   ```text
   npm test -- server/test/schemas/invariants.test.ts
   Exit code: 1
   Test Files 1 failed (1)
   Tests 2 failed | 9 passed (11)
   ```

   The validator returned no issue for assistant-authored source messages and did not inspect `mechanisms[].missing_predictions`; both failures directly exercised missing policy behavior.

## GREEN results

- Initial schema GREEN:

  ```text
  npm test -- server/test/schemas/profile-schemas.test.ts
  Test Files 1 passed (1)
  Tests 6 passed (6)
  ```

- Initial invariant GREEN:

  ```text
  npm test -- server/test/schemas/invariants.test.ts
  Test Files 1 passed (1)
  Tests 9 passed (9)
  ```

- Expanded invariant GREEN:

  ```text
  npm test -- server/test/schemas/invariants.test.ts
  Test Files 1 passed (1)
  Tests 11 passed (11)
  ```

- Final required verification:

  ```text
  npm test -- server/test/schemas
  Test Files 2 passed (2)
  Tests 17 passed (17)

  npm run typecheck
  Exit code: 0
  ```

- Because the existing project references do not include `shared/`, the new source files were also checked directly:

  ```text
  npx tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck \
    shared/profile-schemas.ts shared/ui-model.ts server/src/schemas/invariants.ts
  Exit code: 0
  ```

- IDE lint diagnostics: no errors in the five implementation/test files.

## Schema shape decisions

- Every Zod object, including nested objects, uses `.strict()`. Every numeric confidence and Episode agency/signal value is bounded to `[0, 1]`.
- The reviewer Candidate Model does not state where capability evidence status or direct Episode support lives, but the risk-ceiling and attribution policies require both. Capabilities therefore include `evidence_status` and `supporting_episode_ids`.
- `seniority_evidence` is a strict object with `status`, nullable `level`, and `supporting_evidence_ids`. This keeps natural fit, readiness, asserted level, and independent seniority evidence separate.
- `evidence_boundaries` are strict objects containing `claim`, an unknown-only status (`unknown`, `unvalidated`, or `insufficiently_evidenced`), and evidence references. This prevents an unstructured boundary string from silently becoming a negative assertion.
- Under-resolved is represented by conservative working-archetype confidence plus a `null` competition entry; empty evidence arrays remain valid. No fabricated evidence or extra winner marker was required.
- `ProfileJobSchema` models every status listed in the API contract, normalized progress, nullable model/critic fields, and a strict safe error object.
- `ProfileModelResponseSchema` uses the existing frontend Candidate Model shape as a strict UI schema and keeps the canonical model separate. Critic output is nullable and, when present, is a strict verdict/issues object.
- Evidence-reference validation accepts Transcript message IDs or Episode IDs where the contract says “evidence IDs”; fields specifically named `supporting_episode_ids` accept only Episode IDs.

## Self-review

- Required exports are present: all six schemas plus `validateCandidateInvariants` and `InvariantIssue`.
- Transcript messages require IDs; full Episodes retain source message IDs and decomposed agency.
- Candidate schemas cover working archetype, core loop, Episodes, mechanisms and predictions, capabilities and emergent logic, five competition types, counterargument, risk pairs, role fit, evidence boundaries, and hiring-manager summary.
- Invariants report stable code/path/message triples and never mutate or repair input.
- Reference checks cover Episode-to-message, mechanism/capability-to-Episode, capability-to-mechanism, risk-to-capability, and all general evidence-ID arrays.
- Attribution checks use both Episode agency and source-message authorship, while user judgment/correction/reframing/transfer prevents false leakage findings.
- Missing-as-weakness checks cover risk claims, missing mechanism predictions, role reasons, evidence-boundary claims, and the hiring-manager summary.
- Seniority inflation, risk ceiling ordering, and all five competition categories are enforced.
- No routes, persistence, provider calls, parser/UI integration, chat, jobs, or auth behavior was implemented.

## Concerns / deviations

- No requirement deviation.
- The reviewer Markdown leaves several nested shapes implicit; the conservative decisions above are documented and tested.
- The existing project `npm run typecheck` does not include `shared/` or tests in its TypeScript project graph. Task 2 did not authorize tsconfig changes, so the added source files were verified with a separate strict `tsc --noEmit` command.

## Review remediation

### Status and files

All Important and Minor findings in `task-2-review.md` were addressed.

Additional files changed:

- Updated `shared/profile-schemas.ts`
- Updated `server/src/schemas/invariants.ts`
- Updated `server/test/schemas/profile-schemas.test.ts`
- Updated `server/test/schemas/invariants.test.ts`
- Updated `tsconfig.json`
- Updated `tsconfig.server.json`
- Created `tsconfig.shared.json`

No Git repository was initialized, no commit was created, and no API key or provider integration was touched.

### Fixes

1. Transcript message timestamps now accept `string | null`.
2. Candidate models now carry `archetype_competition_winner: string | null`. A non-null winner must name a listed candidate. A null winner or a winning `null` candidate limits both working-archetype confidence values to `0.4`.
3. Attribution validation follows direct capability Episode references and capability → mechanism → Episode references. It treats `mixed` source authorship as contaminated, uses a `0.5` meaningful-agency threshold, and accepts only the exact normalized behavior type `transfer`.
4. Working archetype, each archetype competitor, strongest counterargument, each role-fit claim, and hiring-manager summary now carry `supporting_evidence_ids`; every ID is checked against Transcript message IDs or Episode IDs.
5. Missing-as-weakness validation now combines structured missing/unknown state with negative-assertion detection instead of requiring paired keywords. Inferred/observed seniority requires evidence IDs, and seniority assertions in role reasons and the hiring-manager summary are rejected without independently supported seniority evidence.
6. `shared/**/*.ts` is now a composite project in the normal TypeScript project graph. The server project references it, so server imports compile without broadening the server `rootDir`.
7. `validateCandidateInvariants` now takes the `CandidateModel`, `Episode`, and `Transcript` types inferred from the exported Zod schemas; duplicated manual input interfaces were removed.

### Review RED / GREEN evidence

#### Nullable transcript timestamp

RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 1 failed | 6 passed (7)
ZodError: expected string, received null at conversations[0].messages[0].timestamp
```

GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 7 passed (7)
```

#### Explicit under-resolved winner and confidence

Initial RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 3 failed | 5 passed (8)
archetype_competition_winner was rejected as an unrecognized key
```

Initial GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 8 passed (8)
```

Additional winner-reference/null-winner RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 2 failed | 8 passed (10)
The schema accepted a high-confidence null winner and a nonexistent winner
```

The first post-fix rerun still showed the same two failures because a prior failed composite compilation had emitted stale `shared/*.js` beside the TypeScript sources; those generated artifacts were removed so Vitest again resolved the current source.

Final GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 10 passed (10)
```

#### Attribution traversal, mixed authorship, thresholds, exact transfer

RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 4 failed | 11 passed (15)
```

The missing behaviors were mechanism traversal, `mixed` handling, rejection of token `0.1` user agency against `0.9` AI authorship, and rejection of substring-only `knowledge_transfer`.

GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 15 passed (15)
```

#### Evidence fields for major claims

Schema RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 3 failed | 5 passed (8)
supporting_evidence_ids was unrecognized on the required major claims,
and hiring_manager_summary rejected the traceable object shape
```

Schema GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 8 passed (8)
```

Invariant RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 5 failed | 15 passed (20)
```

All five synthetic missing IDs (working archetype, competition explanation, counterargument, role-fit claim, and summary) incorrectly returned no issue.

Invariant GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 20 passed (20)
```

#### Missing evidence and seniority robustness

RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 6 failed | 20 passed (26)
```

The validator missed an unpaired unsupported negative assertion, an unknown-ceiling negative risk, inferred/observed seniority without IDs, and seniority assertions in role reason/summary.

An intermediate GREEN attempt left one focused regression failing:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 1 failed | 25 passed (26)
```

The negative assertion matcher did not yet recognize “lacks execution discipline”; the implementation was corrected without weakening the test.

Final GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 26 passed (26)
```

#### Persistent shared typechecking and schema-derived types

RED after replacing duplicated invariant interfaces with exported schema-derived types:

```text
npm run typecheck
Exit code: 2
TS6059: shared/profile-schemas.ts is not under server/src rootDir
TS6307: shared/profile-schemas.ts is not listed in tsconfig.server.json
TS6059/TS6307: shared/ui-model.ts has the same project-boundary failure
```

GREEN after adding the persistent shared composite project and server reference:

```text
npm run typecheck
Exit code: 0
```

### Final verification

```text
npm test -- server/test/schemas
Exit code: 0
Test Files 2 passed (2)
Tests 36 passed (36)

npm run typecheck
Exit code: 0
```

IDE diagnostics reported no linter errors in the changed TypeScript, test, or tsconfig files.

### Review-remediation concerns / deviations

- No review finding remains open.
- `shared` emits declarations and JavaScript into `shared/dist` as a normal composite project; it no longer emits beside source files.
- The `0.4` under-resolved confidence ceiling and `0.5` meaningful-agency threshold are explicit conservative policy choices where the reviewer material required a threshold but did not prescribe a number.

## Second re-review remediation (findings 7–12)

### Status

All re-review findings 7–12 were addressed without changes outside the Task 2 schema, invariant, test, and report files.

### Contract changes

- Archetype competitors now have unique stable `id` values; `archetype_competition_winner` references an ID, never a display name.
- Role-fit entries now have unique stable IDs so summary seniority claims can reference one exact role.
- Reusable structured claims contain `claim`, `evidence_status`, `claim_polarity`, `confidence`, and `supporting_evidence_ids`.
- `core_loop`, `why_different`, mechanism prediction/counter-evidence arrays, competition explanation arrays, and hiring-summary claims now use structured claim objects.
- Working archetype, mechanism, capability, strongest counterargument, risk claim, role-fit reason, and evidence boundary carry equivalent structured metadata.
- Supported (`observed`/`inferred`) claims require at least one evidence ID. The invariant validator verifies every ID exists.
- `unknown`/`missing` claims must be `neutral` and have confidence `<= 0.4`; this policy no longer inspects prose keywords.
- Hiring-manager seniority claims carry `role_fit_id`, exact `level`, status, confidence, polarity, and evidence IDs. Validation requires the role ID, level, status, and complete evidence-ID set to match the referenced role’s seniority evidence.
- `mixed` authorship now emits `AMBIGUOUS_ATTRIBUTION` and does not simultaneously emit AI and third-party leak issues for the same path.
- Under-resolved validation messages distinguish a null winner from a winning null-type archetype.

### Finding 7 — stable winner ID

RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 6 failed | 5 passed (11)
Competition id was rejected as an unknown key and duplicate IDs were not validated.
```

GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 11 passed (11)
```

Role IDs used by summary references had their own RED/GREEN:

```text
RED:   1 failed | 26 passed (27) — duplicate role-fit IDs were accepted
GREEN: 27 passed (27)
```

### Findings 8–9 — structured evidence contract

Initial schema RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 6 failed | 9 passed (15)
Structured status/polarity fields and claim objects were not accepted.
```

Initial schema GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 15 passed (15)
```

Supported-claim and unknown/missing-policy RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 8 failed | 17 passed (25)
Supported major claims accepted empty evidence, and an unknown working claim accepted positive/high-confidence metadata.
```

GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 25 passed (25)
```

Mechanism prediction claims RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 9 failed | 19 passed (28)
The canonical fixture’s structured prediction was rejected because prediction arrays still expected strings.
```

After converting all prediction/counter-evidence arrays, one rerun exposed the remaining legacy string in the missing-prediction fixture; the fixture was converted rather than weakening the schema.

Final GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 28 passed (28)
```

Prediction invariant RED/GREEN:

```text
RED:   2 failed | 29 passed (31) — nested claim polarity and IDs were not checked
GREEN: 31 passed (31)
```

The first invariant-suite run after the schema migration failed all 25 then-existing tests with an expected migration error because the old validator still accessed removed top-level evidence arrays. The validator was migrated to the structured paths; all 25 tests then passed. The behavior-specific schema REDs above had already demonstrated the missing contract behavior before implementation.

Seniority schema RED/GREEN:

```text
RED:   2 failed | 28 passed (30) — supported seniority allowed empty IDs and unknown seniority allowed a level
GREEN: 30 passed (30)
```

### Finding 10 — exact summary seniority binding

RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 3 failed | 26 passed (29)
Missing role ID, mismatched level, and unrelated evidence IDs all returned no issue.
```

GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 29 passed (29)
```

The valid exact role/level/status/evidence binding also returns no issue.

### Finding 11 — mixed attribution ambiguity

RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 1 failed | 28 passed (29)
Mixed authorship emitted both AI_ATTRIBUTION_LEAK and THIRD_PARTY_ATTRIBUTION_LEAK.
```

GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 29 passed (29)
```

### Finding 12 — null-type-winner message

RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 1 failed | 25 passed (26)
The message incorrectly said “no archetype winner” for a present null-type winner.
```

GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 26 passed (26)
```

### Final second re-review verification

```text
npm test -- server/test/schemas
Exit code: 0
Test Files 2 passed (2)
Tests 61 passed (61)

npm run typecheck
Exit code: 0
```

IDE diagnostics reported no errors in the changed schema, invariant, or test files.

### Second re-review concerns / deviations

- No finding remains open.
- `AMBIGUOUS_ATTRIBUTION` was added to `InvariantIssue.code` because finding 11 requires an ambiguity result that must not misstate either specific contamination source.
- The existing conservative numeric policies remain `0.4` for unknown/missing confidence and `0.5` for meaningful user agency.

## Final re-review remediation (findings 13–19)

### Status

All final re-review findings 13–19 were implemented within the Task 2 contract and invariant boundary.

### Finding 13 — structured-only hiring summary

Canonical `hiring_manager_summary` now contains only `claims` and `seniority_claims`. It no longer accepts or requires free-text `summary`; deterministic rendering is responsible for prose.

RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 9 failed | 22 passed (31)
The structured-only fixture was rejected because summary was still required,
while a payload adding unbound summary prose was still accepted.
```

GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 31 passed (31)
```

### Finding 14 — all lookup IDs are unique

Schema validation now enforces global Transcript message-ID uniqueness and Candidate Model uniqueness for Episode, mechanism, capability, competition, and role-fit IDs. Invariant validation independently reports duplicates before constructing any lookup map, protecting already-parsed objects that were later mutated.

Schema RED/GREEN:

```text
RED:   4 failed | 31 passed (35) — duplicate message, Episode, mechanism, and capability IDs were accepted
GREEN: 35 passed (35)
```

Invariant pre-lookup RED/GREEN (combined with finding 15):

```text
RED:   7 failed | 34 passed (41)
       Six duplicate-ID classes and an empty Episode source list returned no issue.
GREEN: 41 passed (41)
```

### Finding 15 — Episode source is non-empty and valid

`EpisodeSchema.source_message_ids` now has a minimum length of one. Invariant validation reports an empty list, while the existing per-ID validation continues to reject nonexistent message IDs.

Schema RED/GREEN:

```text
RED:   1 failed | 35 passed (36) — an Episode with no source message was accepted
GREEN: 36 passed (36)
```

The independent invariant RED/GREEN is included with finding 14 above.

### Finding 16 — two-layer risk ceiling

Risk validation now enforces both:

```text
risk.evidence_status <= risk.evidence_status_ceiling
risk.evidence_status_ceiling <= capability.evidence_status
```

RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 1 failed | 31 passed (32)
An observed risk passed an inferred ceiling.
```

GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 32 passed (32)
```

### Finding 17 — dedicated status enums

Risk ceilings and seniority evidence no longer reuse the general claim evidence enum:

- evidence ceiling: `observed | inferred | unknown`
- seniority status: `observed | inferred | unknown`

Summary seniority claims use the same dedicated seniority status enum. `missing` remains available only for general structured claims.

RED:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 1
Tests 2 failed | 36 passed (38)
Both a missing risk ceiling and missing seniority status were accepted.
```

GREEN:

```text
npm test -- server/test/schemas/profile-schemas.test.ts
Exit code: 0
Tests 38 passed (38)
```

The first full typecheck after this narrowing exposed two now-impossible `status === 'missing'` branches:

```text
npm run typecheck
Exit code: 2
TS2367 at invariants.ts:362 and :374
```

The unreachable branches were removed:

```text
npm run typecheck
Exit code: 0
```

### Finding 18 — winner wording uses IDs

The referential-integrity error now states:

```text
The archetype competition winner ID must reference a listed competition ID.
```

RED/GREEN:

```text
RED:   1 failed | 38 passed (39) — wording still said “name a listed candidate”
GREEN: 39 passed (39)
```

### Finding 19 — mixed plus independently known contamination

Mixed source authorship always reports `AMBIGUOUS_ATTRIBUTION`. It no longer suppresses independently known agency contamination: meaningful `ai_authorship` also reports `AI_ATTRIBUTION_LEAK`, and meaningful `third_party_authorship` also reports `THIRD_PARTY_ATTRIBUTION_LEAK`. Mixed authorship with neither known source still emits only ambiguity.

RED:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 1
Tests 2 failed | 32 passed (34)
The ambiguity early-return suppressed known AI and third-party contamination.
```

GREEN:

```text
npm test -- server/test/schemas/invariants.test.ts
Exit code: 0
Tests 34 passed (34)
```

### Final verification for findings 13–19

```text
npm test -- server/test/schemas
Exit code: 0
Test Files 2 passed (2)
Tests 80 passed (80)

npm run typecheck
Exit code: 0
```

IDE diagnostics reported no errors in the changed schema, invariant, or test files.

### Final re-review concerns / deviations

- No final re-review finding remains open.
- Canonical summary prose was intentionally removed rather than made optional; only structured claims remain, per the fixed product decision.
- `INVALID_EVIDENCE_REFERENCE` is used for duplicate IDs and required-but-empty evidence/source sets because the binding `InvariantIssue` contract has no separate integrity code.

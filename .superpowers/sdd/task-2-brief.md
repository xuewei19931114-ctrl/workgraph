# Task 2: Canonical Schemas and Policy Invariants

## Binding global constraints

- Work in `/Users/sxw/Desktop/workgraph`.
- Do not initialize Git or create commits.
- Use strict TDD and record observed RED/GREEN outputs.
- Every schema must use Zod `.strict()`.
- All confidence values are constrained to `[0, 1]`.
- Missing evidence remains unknown, never weakness.
- AI/third-party content cannot directly support candidate capability.
- Natural fit, readiness, and seniority evidence are separate.
- All important claims must trace to message or Episode IDs.
- Do not implement provider calls, persistence, routes, parser changes, UI integration, chat, jobs, or auth.

## Required source material

Read these reviewer brain files before writing tests:

- `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1/05_SCHEMAS/TRANSCRIPT_SCHEMA.md`
- `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1/05_SCHEMAS/EPISODE_SCHEMA.md`
- `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1/05_SCHEMAS/CANDIDATE_MODEL_SCHEMA.md`
- `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1/02_REAL_TRAJECTORIES/03_MISSING_EVIDENCE_TRAJECTORY.md`
- `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1/02_REAL_TRAJECTORIES/04_AI_AUTHORSHIP_TRAJECTORY.md`
- `/Users/sxw/Desktop/work_data/workgraph_reviewer_brain_complete_v1/02_REAL_TRAJECTORIES/02_ROLE_INFLATION_TRAJECTORY.md`
- `/Users/sxw/Desktop/workgraph/docs/superpowers/specs/2026-08-21-candidate-profile-backend-design.md` sections 5–6.

## Files

- Create: `shared/profile-schemas.ts`
- Create: `shared/ui-model.ts`
- Create: `server/src/schemas/invariants.ts`
- Test: `server/test/schemas/profile-schemas.test.ts`
- Test: `server/test/schemas/invariants.test.ts`

## Required exports

```ts
TranscriptSchema
EpisodeSchema
CandidateModelSchema
CreateProfileJobRequestSchema
ProfileJobSchema
ProfileModelResponseSchema
validateCandidateInvariants(model, transcript): InvariantIssue[]
```

`InvariantIssue`:

```ts
interface InvariantIssue {
  code:
    | 'INVALID_EVIDENCE_REFERENCE'
    | 'AI_ATTRIBUTION_LEAK'
    | 'THIRD_PARTY_ATTRIBUTION_LEAK'
    | 'MISSING_AS_WEAKNESS'
    | 'ROLE_INFLATION'
    | 'RISK_EVIDENCE_CEILING'
    | 'INCOMPLETE_ARCHETYPE_COMPETITION'
  path: string
  message: string
}
```

## Required TDD sequence

1. Write schema tests first:

```ts
TranscriptSchema.parse(validTranscript)
expect(() => TranscriptSchema.parse(messageWithoutId)).toThrow()
CandidateModelSchema.parse(validUnderResolvedModel)
expect(() => CandidateModelSchema.parse(roleWithoutSeniorityEvidence)).toThrow()
```

Run `npm test -- server/test/schemas/profile-schemas.test.ts` and record the expected failure.

2. Implement exact strict schemas for:

- working archetype with Chinese/English names, definition, explanatory confidence, outcome-validation confidence;
- core loop;
- full high-signal Episode objects;
- mechanisms with Episode references, predictions, confirmed/missing evidence, counter-evidence and confidence;
- capabilities linked to mechanism IDs with emergent logic;
- archetype competition with types `narrow`, `higher_order`, `domain`, `operating_style`, `null`;
- strongest counterargument;
- strength-risk pairs containing `capability_id`, `risk_claim`, `evidence_status_ceiling`, `supporting_evidence_ids`;
- role fit containing natural fit, readiness, reason and independent seniority evidence;
- evidence boundaries;
- hiring manager summary.

Under-resolved must be valid via a null archetype winner and conservative confidence; it must not require fabricated evidence.

3. Write invariant tests before implementation. Synthetic fixtures must assert:

- capability references nonexistent Episode;
- Episode references nonexistent message ID;
- AI-authored content supports capability without user judgment/correction;
- third-party-authored content supports capability without user transfer/judgment;
- missing evidence is phrased as weakness;
- seniority asserted while seniority evidence is unknown;
- risk evidence ceiling exceeds capability evidence;
- fewer than all five competition categories.

4. Implement invariant validation with stable issue paths/messages. Do not silently mutate or repair a model.

5. Final verification:

```bash
npm test -- server/test/schemas
npm run typecheck
```

Both must pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-2-report.md` with:

- status;
- files changed;
- RED commands and why they failed;
- GREEN commands/results;
- schema shape decisions where reviewer Markdown was ambiguous;
- self-review;
- concerns/deviations.

Return only status, one-line test summary, and concerns to the parent.

# Task 9 Report

## Status

Implemented the browser profile API client, persistent candidate UUID, strict Transcript merge, real backend analysis flow, controlled progress/cancellation UI, canonical-model persistence, privacy copy, and Vite API proxy. Only profile generation was replaced; chat, jobs, URL import, and auth remain mock. No Git operation was performed.

## Files

- Created `src/lib/profileApi.ts`
- Created `src/lib/profileApi.test.ts`
- Created `src/lib/candidateId.ts`
- Created `src/lib/candidateId.test.ts`
- Created `src/lib/profileData.ts`
- Created `src/lib/profileData.test.ts`
- Created `src/data/analysis.test.ts`
- Modified `src/types.ts`
- Modified `src/App.tsx`
- Modified `src/components/AnalyzingModal.tsx`
- Modified `src/components/FilePreviewModal.tsx`
- Modified `src/pages/UploadPage.tsx`
- Modified `src/data/analysis.ts`
- Modified `vite.config.ts`
- Created `.superpowers/sdd/task-9-report.md`

## RED / GREEN evidence

- Initial API client, candidate identity, Transcript merge, and status mapping RED run: four suites failed because the three new modules and status mapping functions did not exist.
- Initial GREEN run: 30/30 tests passed after the minimal implementations.
- Real terminal HTTP status RED: failed/cancelled polling and explicit cancellation failed when the backend returned schema-valid `ProfileJob` bodies with HTTP 502/499.
- Real terminal HTTP status GREEN: 14/14 API tests passed after validating a `ProfileJob` body before interpreting a non-2xx response as an error envelope.
- Model fetch RED: `getProfileModel` was absent and its validation test failed with `getProfileModel is not a function`.
- Model fetch GREEN: 15/15 API tests passed after adding the schema-validating model request.
- Idempotent retry RED: a reused job already at `inferring` was rejected because creation accepted only `queued`.
- Idempotent retry GREEN: 16/16 API tests passed after accepting every valid backend job status while preserving the required `{ jobId }` return shape.

## End-to-end state trace

1. A stable UUID is read or created under `workgraph:candidateId`; it is not derived from account email.
2. Each selected file is parsed locally with that candidate ID.
3. Confirmation merges only ready archives, rejects duplicate conversation/message IDs, recomputes totals, and validates the merged Transcript.
4. The preview closes, one UUID idempotency key is allocated, and `POST /api/profile/jobs` sends only the normalized request through the same-origin API proxy.
5. The UI polls every second and renders backend `status`, exact `progress`, and safe `stageMessage`.
6. Poll abort only stops browser polling. Explicit user cancellation aborts polling and separately sends `DELETE /api/profile/jobs/:jobId`.
7. `completed` and `unresolved` fetch `/api/profile/models/:modelId`; UI model, canonical model, CareerProfile, and import records are then saved and the report opens.
8. `failed` and `cancelled` close progress UI and show safe messages without saving a model or records.
9. Clearing profiles removes UI model, canonical model, and CareerProfile while preserving import records and conversations.

## Removed mock references

- `src/App.tsx` no longer imports or calls `buildCandidateModel`.
- `parseArchive(file, 'local-import')` was replaced with the persistent candidate UUID.
- `AnalyzingModal` no longer contains timer, elapsed, estimated remaining time, synthetic narration, or `onDone`.
- Search under `src` finds `buildCandidateModel` only in `src/data/model.ts`; that mock remains available but is not referenced by the production profile flow.
- Chat reply timers, URL import delay, job data, and auth state were intentionally left unchanged.

## Privacy and key evidence

- The exact required disclosure appears in `FilePreviewModal` and twice on `UploadPage`:
  `文件先在本地解析。只有点击“开始分析”后，归一化后的聊天文本才会发送给 Workgraph 后端和配置的 AI 服务。`
- UI copy also says the raw file itself is not uploaded and report evidence may retain selected exact quotes/source IDs.
- The unsupported claim that private or sensitive topics are excluded was removed.
- Search under `src` found no `GPT56_API_KEY`, `x-api-key`, browser API key variable, or related key reference.
- Search of the production `dist` output also found no `GPT56_API_KEY`, `x-api-key`, configured model slug, or `apiKey`.

## Verification

- `npm test -- src/lib`: 4 files, 41 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; 134 modules transformed.
- `npm test`: 20 files, 300 tests passed.

## Self-review

- API success and error payloads are Zod-validated; malformed responses become a stable `INVALID_RESPONSE`.
- Safe 400/409/413 errors are preserved, 4xx polling errors are not retried, and exactly one transient network/502/503/504 GET failure is retried.
- A schema-valid terminal failed/cancelled job is not mistaken for a transient HTTP error.
- Idempotency keys survive creation/poll transport failures and are cleared when the server reaches a terminal outcome or cancellation completes.
- Canonical and UI models are stored separately.
- `AnalyzingModal` has `aria-live`, uses only real backend state, and cannot call cancel while cancelling or terminal.
- Vite forwards only `/api` to `http://127.0.0.1:8787`.

## Concerns

- The required automated gates do not exercise a browser against a live Fastify process; API behavior is unit-tested and server routes are covered elsewhere, but the final UI wiring was verified by typecheck/build rather than a browser E2E test.
- No real GPT-5.6 smoke test was run because it is credentialed and outside the specified Task 9 gates.
- Canonical/UI models and selected evidence quotes are persisted in browser localStorage without encryption, matching the current local persistence design.

## Review remediation append — 2026-08-21

### Status

All four findings in `task-9-review.md` were addressed with strict RED/GREEN tests and no Git operations.

### Additional files

- Created `src/lib/runGeneration.ts`
- Created `src/lib/runGeneration.test.ts`
- Modified `src/lib/candidateId.ts`
- Modified `src/lib/candidateId.test.ts`
- Modified `src/App.tsx`

### Root cause and fixes

- Analysis lifecycle state was split across independent React refs and state setters. A second confirmation could start before React rendered `activeJob`, while stale promises had no generation ownership check.
- Cancellation aborted polling before the DELETE response and unconditionally cleared active job/idempotency state in `finally`, so a failed DELETE incorrectly looked cancelled locally and could start duplicate work.
- Persisted candidate IDs were accepted based only on non-empty text.
- A single tested run-generation coordinator now owns generation identity, AbortController, server job ID, and the idempotency key. It rejects concurrent starts and exposes guarded commit/finish operations.
- Progress, terminal status, model, canonical model, profile, records, and report-opening writes are inside current-generation checks. Stale async completions cannot mutate them.
- Unmount calls coordinator invalidation, which aborts only local network work and does not invoke DELETE.
- Cancellation now awaits DELETE without aborting polling. Failure leaves the same active run, job, key, and live polling signal; success validates the generation, then aborts and clears.
- Persisted candidate IDs must match an RFC-style UUID shape; invalid values are replaced with a new UUID and persisted.

### Additional RED / GREEN evidence

- Coordinator/UUID RED: the coordinator module was absent, and the invalid persisted candidate ID test returned `persisted-id` instead of replacing it.
- Coordinator/UUID GREEN: 2 files and 9 tests passed after adding the coordinator and UUID validation.
- Regression coverage proves concurrent confirmation rejection, stale write suppression after a new generation, invalidation/unmount local abort without DELETE, owner-only terminal cleanup, cancellation-failure key/job/poll retention, successful cancellation cleanup, and invalid UUID replacement.

### Fresh verification

- `npm test -- src`: 6 files, 59 tests passed.
- `npm test`: 21 files, 307 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; 135 modules transformed.

### Remaining concerns

- The coordinator/App integration is covered through pure coordinator regressions plus TypeScript/build checks; there is still no browser component E2E harness.
- A DELETE request can race with a naturally terminal poll response. Generation checks prevent either completion path from clearing or writing over a newer run.
- No credentialed GPT-5.6 smoke test was run.

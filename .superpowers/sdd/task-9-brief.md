# Task 9: Frontend API Client and Real Analysis UI

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git.
- Strict TDD for API client and pure state/status mapping.
- Replace only profile generation mock. Chat, jobs, URL import and auth remain mock.
- Browser never receives or references GPT56 API key.
- Real backend job progress replaces all timer/fake completion logic.
- Canonical model is preserved locally alongside UI model.
- Privacy copy must state exactly when normalized chat text leaves the device.

## Files

- Create: `src/lib/profileApi.ts`
- Create: `src/lib/profileApi.test.ts`
- Create as needed: `src/lib/candidateId.ts` and test
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/AnalyzingModal.tsx`
- Modify: `src/components/FilePreviewModal.tsx`
- Modify: `src/pages/UploadPage.tsx`
- Modify: `src/data/analysis.ts`
- Modify: `vite.config.ts`

## API client

```ts
createProfileJob(request, idempotencyKey, signal?): Promise<{ jobId: string }>
getProfileJob(jobId, signal?): Promise<ProfileJob>
cancelProfileJob(jobId): Promise<ProfileJob>
getProfileModel(modelId, signal?): Promise<ProfileModelResponse>
pollProfileJob(jobId, options): Promise<ProfileJob>
```

`pollProfileJob`:

- polls every 1000ms by default;
- accepts AbortSignal and injected sleep for tests;
- stops on completed/unresolved/failed/cancelled;
- retries one transient GET network/502/503/504 failure;
- never retries 4xx;
- preserves safe backend error code/message;
- polling abort does not automatically cancel server job; caller explicitly invokes DELETE when user chooses cancel.

## Required RED tests

- 202 creation and Idempotency-Key header;
- 400/409/413 safe API errors;
- polling queued → inferring → completed;
- unresolved terminal;
- failed/cancelled terminal;
- one transient GET retry then success;
- repeated transient failure exposed;
- AbortSignal stops polling without DELETE;
- explicit cancel sends DELETE;
- malformed response fails validation.

## Candidate identity and Transcript merge

- Replace `local-import` with `getOrCreateCandidateId()`, a UUID persisted under `workgraph:candidateId`.
- Do not derive candidate ID from email.
- `parseArchive(file, candidateId)` is called with this ID.
- Merge ready ParsedArchives by:
  - setting one candidate ID;
  - preserving each file's conversations/messages;
  - rejecting duplicate conversation/message IDs rather than silently overwriting;
  - recomputing totals from merged Transcript;
  - validating through `TranscriptSchema`.
- Use one UUID idempotency key per user confirmation; retries of the same submission reuse it until terminal outcome.

## App flow

Replace `confirmAnalyze`/`finishAnalysis` mock:

1. merge ready Transcripts;
2. close preview and show controlled analyzing modal;
3. POST job;
4. poll real status;
5. completed/unresolved → GET model;
6. set UI `model`, canonical model, derived `CareerProfile`, records, report modal;
7. clear picked files and active job state;
8. failed/cancelled → close modal, safe actionable toast, do not save model/records.

Persist canonical model under a separate localStorage key. Clearing profiles clears UI/canonical/profile but preserves import records/conversations.

Remove production use/import of `buildCandidateModel`; mock file may remain for tests/demo but cannot be called by profile flow.

## AnalyzingModal

Controlled props:

```ts
interface Props {
  job: ProfileJob
  fileCount: number
  cancelling: boolean
  onCancel: () => void
}
```

- no timer, elapsed state, synthetic remaining seconds or `onDone`;
- map real statuses to stage list;
- display exact `progress` and safe `stageMessage`;
- cancel button disabled while cancelling/terminal;
- unresolved wording must not say “生成成功”;
- accessible live status (`aria-live`).

## Privacy copy

Replace every claim that chat records are not uploaded with:

```text
文件先在本地解析。只有点击“开始分析”后，归一化后的聊天文本才会发送给 Workgraph 后端和配置的 AI 服务。
```

Also clarify:

- raw file itself is not uploaded;
- report evidence may retain selected exact quotes/source IDs;
- never claim private/sensitive content is excluded unless code actually performs exclusion.

## Vite proxy

```ts
server: {
  port: 5173,
  open: true,
  proxy: {
    '/api': 'http://127.0.0.1:8787',
  },
}
```

## Verification

```bash
npm test -- src/lib
npm run typecheck
npm run lint
npm run build
npm test
```

All pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-9-report.md` with status, files, RED/GREEN evidence, end-to-end state trace, removed mock references, privacy-copy search evidence, self-review and concerns. Return only status, test summary and concerns.

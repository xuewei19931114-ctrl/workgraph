### Task 10: Adversarial Invariants, Smoke Script, Documentation, and Final Verification

**Files:**
- Create: `server/test/eval/adversarial.test.ts`
- Create: `server/scripts/smoke-profile.ts`
- Create: `test/fixtures/profile-smoke-transcript.json`
- Modify: `README.md`
- Create: `server/README.md`

**Interfaces:**
- Produces: opt-in real-model smoke command.

- [ ] **Step 1: Encode deterministic adversarial gates**

At minimum encode A1, A6, A7, A8, A9, A10, A11, A12 and A14 as invariant/fixture tests. These tests validate output properties, not exact prose.

- [ ] **Step 2: Add real smoke script**

The script:

1. requires `GPT56_API_KEY` and `GPT56_BASE_URL`;
2. prints expected call count and warns that it incurs cost;
3. loads only the synthetic smoke transcript;
4. runs direct path with Critic disabled;
5. validates Candidate Model and invariants;
6. prints model/usage/request ID, never the API key;
7. exits nonzero on unresolved/failed.

- [ ] **Step 3: Document setup and privacy**

`server/README.md` includes environment variables, migration/start commands, API examples with placeholder key, storage/retention behavior, cancellation semantics, and HTTP proxy warning.

Root README distinguishes local parse from model upload and marks dialogue/jobs/auth as mock.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Run local API smoke without paid model**

Start server with a mock provider and run:

```bash
curl -s http://127.0.0.1:8787/api/health
```

Expected:

```json
{"ok":true}
```

Use Fastify integration tests—not production credentials—to verify create/poll/model/delete.

- [ ] **Step 6: Run paid smoke only with explicit approval**

Run only after the user explicitly authorizes a real paid request:

```bash
GPT56_BASE_URL="http://example-proxy" \
GPT56_API_KEY="<secret>" \
npm run smoke:profile
```

Expected: one Core call, schema-valid Candidate Model, invariant pass, telemetry containing request ID and token usage.

- [ ] **Step 7: Final secret and artifact scan**

Search tracked source/config/docs for `sk-`, the supplied real key, transcript fixture leaks, `.db` and `.env`. Expected: no secret or real transcript content; only `.env.example` placeholders.

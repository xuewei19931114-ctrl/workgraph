# Task 10 Review Findings

## Verdict

- Spec compliance: ✅ with ⚠️ unpaid curl / paid smoke not run (controller-authorized skips)
- Code quality: Needs fixes

## Required fixes (Important)

1. Smoke must fail if recorded calls include `extractor` or `critic`, or if core count is not 1 (json_repair at most once may be allowed). Pin a large enough `maxEstimatedTokens` so the synthetic fixture cannot fall into evidence-extraction. File: `server/scripts/smoke-profile.ts`.
2. CLI `.catch` must print a safe error message (no API key / prompt / transcript body) instead of only `Paid profile smoke failed.` File: `server/scripts/smoke-profile.ts:159`.

## Minor (do not block; optional if cheap)

1. A8/A11/A12 name-token heuristics — leave unless already touching those tests.
2. A1 conservative fixture does not replay the AI-authorship scene — optional.
3. Smoke script not in `tsconfig.server.json` — include it or add a scripts tsconfig if cheap.
4. A7 high natural_fit under unknown evidence — leave unless already touching role inflation.

## Verification

- Strict RED/GREEN for the two Important smoke behaviors.
- Re-run `npm test -- server/test/scripts/smoke-profile.test.ts` and a focused invariants/adversarial suite if those files change.
- Append evidence to `task-10-report.md`.
- No git operations. Do not run paid GPT-5.6 smoke.

---

# Re-review (after Important smoke fixes)

### Spec Compliance

两项 Required Important 修复均已落地，并与 Task 10 brief Step 2 及全局约束对齐：

1. `smokeCallBudgetFailure` 在 telemetry 含 `extractor`/`critic`、`core` 次数不为 1、或 `json_repair` 超过一次时返回失败信息；`runPaidProfileSmoke` 据此 `console.error` 并返回 1。`maxEstimatedTokens` 钉为 `SMOKE_MAX_ESTIMATED_TOKENS`（400000），`fixedPromptAndSchemaReserve` 钉为 20000，不再使用 `config.contextTokenLimit`，因此低 `PROFILE_CONTEXT_TOKEN_LIMIT` 无法把合成 fixture 打进 evidence-extraction。Critic 在 config / job options / pipeline input 三处强制 `false`。
2. CLI `.catch` 经 `formatSafeSmokeError` 打印 `Error.message`（前缀仍为 `Paid profile smoke failed.`），并对 `GPT56_API_KEY` 做 substring 脱敏；不打印 prompt 或 transcript 对象。

日志与 fixture 中未见真实 API key（测试里仅有字面量 `sk-live-not-a-real-key`，且断言不出现在输出中）。付费 GPT-5.6 smoke 仍未执行（控制器授权跳过）。本复审复跑 `npm test -- server/test/scripts/smoke-profile.test.ts`：**5 passed**；未跑全量套件。

### Strengths

- 调用预算与错误打印抽成可测纯函数，RED/GREEN 与报告一致（RED 3 failed / 2 passed；GREEN 5 passed）。
- Token 上限与 env 解耦，合成 fixture（远小于 `ceil(JSON.length/3)+20000` vs 400000）只能走 direct core。
- 失败路径先打 telemetry 再拒预算，便于对照实际 stage，同时 nonzero exit 仍成立。
- Provider 侧已有 `SAFE_ERRORS`；pipeline 多数失败会收成 `status: failed` 而非把 prompt/key 抛进 catch。

### Issues (Critical / Important / Minor)

#### Critical

None.

#### Important

None. 原两条 Required 修复均已实现并有覆盖测试。

#### Minor

1. Catch 测试把 prompt/transcript 当作 `secrets` 传入 `formatSafeSmokeError`，但 CLI 实际只传入 `GPT56_API_KEY`。生产 catch 不会主动脱敏 prompt/transcript 字符串。当前 pipeline/provider 错误消息是安全短句，泄漏风险低。若要加强，CLI 只需继续只打 `error.message` + key 脱敏，测试改为只断言 key 脱敏，不要假装 CLI 会 redact prompt/transcript。
2. extractor/critic/core-count 测试测的是 helper，不是 `runPaidProfileSmoke` 的 process exit。脚本里接线正确（`smoke-profile.ts` 177–181），可接受；测试名写 “exits nonzero” 略夸大。
3. 没有测试断言 `SMOKE_MAX_ESTIMATED_TOKENS` 被传入 `runProfileInference` context。钉扎已在调用点写死，属验证缺口而非行为缺口。
4. 原审查 Minor（A8/A11/A12 名称启发式、A1 conservative fixture、smoke 不在 `tsconfig.server.json`、A7 natural_fit）不在本次 remediation 范围，仍不阻断。

### Assessment

**Task quality:** Approved

**Reasoning:** Smoke 现在会拒绝 extractor/critic 与非恰好一次 core，并用固定 400000 token 预算避免合成 fixture 走抽取路径；CLI catch 会打印脱敏后的 `Error.message` 而不再只有一句泛化失败。剩余项均为测试精确度/原可选 Minor，不阻断。

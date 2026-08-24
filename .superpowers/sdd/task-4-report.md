# Task 4 Report

## Status

完成。Task 4 严格限定在 SQLite migration、repository 与其测试；未执行 Git 操作，未调用 provider，未写入真实数据或密钥。

## Files

- `server/migrations/001_initial.sql`
- `server/src/db/migrate.ts`
- `server/src/db/repository.ts`
- `server/test/db/repository.test.ts`
- `.superpowers/sdd/task-4-report.md`

## RED / GREEN Evidence

### RED

在创建 production 文件前运行：

```text
npm test -- server/test/db/repository.test.ts
Exit code: 1
FAIL server/test/db/repository.test.ts
Cannot find module '../../src/db/repository.js'
```

失败原因与缺失的 Task 4 repository 实现一致。

### GREEN

最终重新运行：

```text
npm test -- server/test/db/repository.test.ts
Test Files  1 passed (1)
Tests       10 passed (10)

npm run typecheck
Exit code: 0
```

## Migration Decisions

- `schema_migrations` 记录稳定版本 `001_initial`，每个未应用 migration 使用 `IMMEDIATE` transaction 执行并记录。
- repository 初始化启用 `foreign_keys`；文件数据库启用 WAL，`:memory:` 不启用 WAL。
- 使用 partial unique index 保证非空 `idempotency_key` 唯一。
- 为 candidate ID、job status、创建/开始时间及 provider job 关联建立索引。
- Job 引用 Transcript；Model 引用 Job；删除 Model 时 Job 的 `model_id` 自动置空，从而保留 Transcript。
- 使用带实体前缀的随机 opaque ID；Transcript 内容哈希使用 SHA-256。

## Self-review

- 覆盖 migration 幂等、幂等冲突、合法/非法及终态转换、JSON schema read validation、模型删除保留 Transcript、过期清理、metadata-only telemetry、foreign key 与 close。
- Transcript、Canonical Model、UI Model 读取复用 Task 2 shared Zod schemas；模型响应同时通过共享 response schema 校验 critic/status。
- Model insert 与 Job model/status 更新在同一 transaction 内。
- telemetry 类型与表仅接受 approved metadata 字段，不包含 API key、prompt、transcript 或 provider body。
- 实现未扩展到 routes、jobs、provider、inference 或 frontend。

## Concerns

无已知阻塞项。RED 是缺失 repository 模块导致的预期 suite failure，而不是 assertion diff；它发生在任何 production 文件创建前，并明确证明 Task 4 接口尚不存在。

## Review Fixes (2026-08-21)

### Status

`task-4-review.md` 的 6 项 finding 已逐项处理，未执行 Git 操作，未写入真实数据或密钥。

### Regression RED

新增全部评审回归测试后首次运行：

```text
npm test -- server/test/db/repository.test.ts
Test Files  1 failed (1)
Tests       4 failed | 34 passed (38)
```

观察到的 4 个直接 RED：

- migration version 在获取 write lock 前检查；
- migration 初始化失败后数据库未关闭；
- duplicate idempotency key 泄漏 SQLite unique error；
- terminal job 的过期 Transcript 无法删除。

状态转换矩阵、terminal rejection 和 canonical corruption 属于既有行为的覆盖缺口，新增测试在首次运行已为 GREEN。为证明测试确实捕获回归，恢复前分别进行 mutation RED：

```text
allows approved transition: 20 failed
terminal state rejection: 4 failed
corrupt canonical_json rejection: 1 failed
```

所有 mutation 均已立即撤销。

### Final GREEN

```text
npm test -- server/test/db/repository.test.ts
Test Files  1 passed (1)
Tests       38 passed (38)

npm run typecheck
Exit code: 0
```

### Fix Decisions

- `analysis_jobs.transcript_id` 改为 nullable，并使用 `ON DELETE SET NULL`。
- retention 删除过期且未被 nonterminal job 使用的 Transcript；terminal job 历史保留，`transcript_id` 置空。
- `createJob` 将 idempotency partial-unique constraint race 转换为稳定 `IDEMPOTENCY_CONFLICT`；既有 `findIdempotentJob` 同 key/hash 查询保持不变。
- 每个 migration 在 `IMMEDIATE` transaction 内重新检查版本，锁等待期间其他进程已应用时跳过 DDL。
- foreign-key/WAL/migration 初始化统一置于受保护初始化段，失败时关闭 SQLite 连接并保留原始错误。
- 新增 20 个合法 transition table cases、4 个 terminal rejection cases，以及显式 corrupt `canonical_json` case。

### Review Concerns

无已知阻塞项。

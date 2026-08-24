import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const migrations = [
  {
    version: '001_initial',
    path: fileURLToPath(
      new URL('../../migrations/001_initial.sql', import.meta.url),
    ),
  },
  {
    version: '002_nullable_provider_call_job',
    path: fileURLToPath(
      new URL(
        '../../migrations/002_nullable_provider_call_job.sql',
        import.meta.url,
      ),
    ),
  },
] as const

export function runMigrations(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)
  }).immediate()

  for (const migration of migrations) {
    const sql = readFileSync(migration.path, 'utf8')
    db.transaction(() => {
      const applied = db
        .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
        .get(migration.version)
      if (applied) {
        return
      }
      db.exec(sql)
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      ).run(migration.version, new Date().toISOString())
    }).immediate()
  }
}

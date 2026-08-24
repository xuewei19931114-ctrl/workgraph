import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { buildApp } from './app.js'
import { applyVercelDefaults, loadConfig } from './config.js'
import { createRepository } from './db/repository.js'
import { runProfileInference } from './inference/pipeline.js'
import { createJobManager } from './jobs/job-manager.js'
import { startTranscriptRetentionSweep } from './jobs/transcript-retention.js'
import { loadOptionalEnvFiles } from './load-env.js'
import { createRepositoryCallRecorder } from './provider/call-recorder.js'
import { createResponsesClient } from './provider/responses-client.js'

function keepAliveOnVercel(promise: Promise<void>) {
  if (process.env.VERCEL !== '1') return
  const waitUntil = (
    globalThis as Record<PropertyKey, unknown>
  )[Symbol.for('vercel.waitUntil')]
  if (typeof waitUntil === 'function') {
    waitUntil(promise)
  }
}

export async function createRuntime() {
  loadOptionalEnvFiles()
  applyVercelDefaults()
  const config = loadConfig()
  if (config.dbPath !== ':memory:') {
    mkdirSync(dirname(config.dbPath), { recursive: true })
  }
  const repository = createRepository(config.dbPath)
  const log = (message: string) => {
    console.log(message)
  }
  const provider = createResponsesClient({
    config,
    recorder: createRepositoryCallRecorder(repository),
    log,
  })
  const manager = createJobManager({
    repository,
    enableCritic: config.enableCritic,
    log,
    keepAlive: keepAliveOnVercel,
    pipeline: (input) =>
      runProfileInference(input, {
        provider,
        repository,
        context: {
          maxEstimatedTokens: config.contextTokenLimit,
          fixedPromptAndSchemaReserve: 20_000,
          extractorConcurrency: config.extractorConcurrency,
        },
        now: () => new Date(),
        log,
      }),
  })
  manager.recoverAfterRestart()
  const app = await buildApp({ config, repository, jobManager: manager })
  await app.ready()
  const retention =
    process.env.VERCEL === '1'
      ? { stop() {} }
      : startTranscriptRetentionSweep({
          sweep: (now) => repository.deleteExpiredTranscripts(now),
          logDeleted: (deleted) => {
            app.log.info({ deleted }, 'expired transcripts removed')
          },
        })
  return { app, config, repository, manager, retention }
}

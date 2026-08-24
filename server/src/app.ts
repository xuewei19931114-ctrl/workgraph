import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type ServerConfig } from './config.js'
import type { ProfileRepository } from './db/repository.js'
import type { JobManager } from './jobs/job-manager.js'
import { registerProfileRoutes } from './routes/profile.js'

export interface AppDependencies {
  config?: ServerConfig
  repository?: ProfileRepository
  jobManager?: JobManager
}

export async function buildApp(
  deps: AppDependencies = {},
): Promise<FastifyInstance> {
  const config = deps.config ?? loadConfig()
  const app = Fastify({ bodyLimit: config.bodyLimit ?? 10 * 1024 * 1024 })

  await app.register(cors)

  app.get('/api/health', async () => ({ ok: true }))
  if (deps.repository !== undefined && deps.jobManager !== undefined) {
    await registerProfileRoutes(app, {
      repository: deps.repository,
      jobManager: deps.jobManager,
      transcriptRetentionDays: config.transcriptRetentionDays,
    })
  }

  app.setErrorHandler((caught, _request, reply) => {
    const metadata =
      typeof caught === 'object' && caught !== null
        ? (caught as { statusCode?: number; code?: string })
        : {}
    if (
      metadata.statusCode === 413 ||
      metadata.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
    ) {
      return reply.code(413).send({
        error: {
          code: 'TRANSCRIPT_TOO_LARGE',
          message: 'The transcript exceeds the configured size limit.',
        },
      })
    }
    app.log.error({ code: 'INTERNAL_ERROR' }, 'Request failed')
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
      },
    })
  })

  return app
}

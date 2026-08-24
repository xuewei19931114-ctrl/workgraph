import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type ServerConfig } from './config.js'
import type { ProfileRepository } from './db/repository.js'
import type { JobManager } from './jobs/job-manager.js'
import { registerProfileRoutes } from './routes/profile.js'

export interface AppDependencies {
  config?: ServerConfig
  repository?: ProfileRepository
  jobManager?: JobManager
  staticDir?: string
}

function shouldServeBuiltFrontend(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'production' ||
    env.RAILWAY_ENVIRONMENT !== undefined ||
    env.RAILWAY_PROJECT_ID !== undefined ||
    env.SERVE_FRONTEND === '1'
  )
}

function resolveStaticDir(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (explicit !== undefined && explicit !== '') return explicit
  if (!shouldServeBuiltFrontend(env)) return undefined
  const distDir = resolve(process.cwd(), 'dist')
  if (existsSync(resolve(distDir, 'index.html'))) return distDir
  return undefined
}

export async function buildApp(
  deps: AppDependencies = {},
): Promise<FastifyInstance> {
  const config = deps.config ?? loadConfig()
  const app = Fastify({ bodyLimit: config.bodyLimit ?? 10 * 1024 * 1024 })

  await app.register(cors)

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

  app.get('/api/health', async () => ({ ok: true }))
  if (deps.repository !== undefined && deps.jobManager !== undefined) {
    await registerProfileRoutes(app, {
      repository: deps.repository,
      jobManager: deps.jobManager,
      transcriptRetentionDays: config.transcriptRetentionDays,
    })
  }

  const staticDir = resolveStaticDir(deps.staticDir)
  if (staticDir !== undefined) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: false,
    })
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Not found.',
        },
      })
    })
  }

  return app
}

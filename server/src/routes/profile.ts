import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

import {
  CreateProfileJobRequestSchema,
  type ProfileJob,
} from '../../../shared/profile-schemas.js'
import {
  RepositoryError,
  type ProfileRepository,
} from '../db/repository.js'
import {
  toSafeProfileJob,
  type JobManager,
} from '../jobs/job-manager.js'

interface RouteDependencies {
  repository: ProfileRepository
  jobManager: JobManager
  transcriptRetentionDays: number
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!)
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function canonicalRequestHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export async function commitCreatedJob(
  created: boolean,
  jobId: string,
  clientGone: boolean,
  jobManager: {
    start(jobId: string): void
    cancel(jobId: string): Promise<unknown>
  },
): Promise<'accepted' | 'cancelled' | 'reused'> {
  if (!created) return 'reused'
  jobManager.start(jobId)
  if (clientGone) {
    await jobManager.cancel(jobId)
    return 'cancelled'
  }
  return 'accepted'
}

function error(code: string, message: string) {
  return { error: { code, message } }
}

function jobHttpStatus(job: ProfileJob): number {
  if (job.error === null) return 200
  if (job.error.code === 'MODEL_POLICY_VIOLATION') return 422
  if (job.error.code === 'CANCELLED') return 499
  if (job.error.code === 'PROVIDER_TIMEOUT') return 504
  if (job.error.code.startsWith('PROVIDER_')) return 502
  return 500
}

export async function registerProfileRoutes(
  app: FastifyInstance,
  dependencies: RouteDependencies,
): Promise<void> {
  const { repository, jobManager } = dependencies

  app.post('/api/profile/jobs', async (request, reply) => {
    const parsed = CreateProfileJobRequestSchema.safeParse(request.body)
    if (
      !parsed.success ||
      parsed.data.candidateId !== parsed.data.transcript.candidate_id
    ) {
      return reply
        .code(400)
        .send(error('INVALID_TRANSCRIPT', 'The profile job request is invalid.'))
    }
    const idempotencyHeader = request.headers['idempotency-key']
    const idempotencyKey =
      typeof idempotencyHeader === 'string' && idempotencyHeader.length > 0
        ? idempotencyHeader
        : null
    try {
      const result = repository.createOrGetProfileJob({
        candidateId: parsed.data.candidateId,
        transcript: parsed.data.transcript,
        retentionDate: new Date(
          Date.now() + dependencies.transcriptRetentionDays * 86_400_000,
        ),
        idempotencyKey,
        requestHash: canonicalRequestHash(parsed.data),
        options: parsed.data.options,
      })
      const outcome = await commitCreatedJob(
        result.created,
        result.job.id,
        request.raw.aborted,
        jobManager,
      )
      if (outcome === 'cancelled') {
        return
      }
      return reply
        .code(202)
        .send({ jobId: result.job.id, status: result.job.status })
    } catch (caught) {
      if (
        caught instanceof RepositoryError &&
        caught.code === 'IDEMPOTENCY_CONFLICT'
      ) {
        return reply
          .code(409)
          .send(
            error(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key was used for another request.',
            ),
          )
      }
      throw caught
    }
  })

  app.get<{ Params: { jobId: string } }>(
    '/api/profile/jobs/:jobId',
    async (request, reply) => {
      try {
        const job = toSafeProfileJob(repository.getJob(request.params.jobId))
        return reply.code(jobHttpStatus(job)).send(job)
      } catch (caught) {
        if (caught instanceof RepositoryError && caught.code === 'NOT_FOUND') {
          return reply
            .code(404)
            .send(error('JOB_NOT_FOUND', 'The profile job was not found.'))
        }
        throw caught
      }
    },
  )

  app.delete<{ Params: { jobId: string } }>(
    '/api/profile/jobs/:jobId',
    async (request, reply) => {
      try {
        const job = toSafeProfileJob(
          await jobManager.cancel(request.params.jobId),
        )
        return reply.code(jobHttpStatus(job)).send(job)
      } catch (caught) {
        if (caught instanceof RepositoryError && caught.code === 'NOT_FOUND') {
          return reply
            .code(404)
            .send(error('JOB_NOT_FOUND', 'The profile job was not found.'))
        }
        throw caught
      }
    },
  )

  app.get<{ Params: { modelId: string } }>(
    '/api/profile/models/:modelId',
    async (request, reply) => {
      try {
        const model = repository.getModel(request.params.modelId)
        return {
          candidateModel: model.canonicalModel,
          uiModel: model.uiModel,
          critic: model.critic,
          status: model.status,
        }
      } catch (caught) {
        if (caught instanceof RepositoryError && caught.code === 'NOT_FOUND') {
          return reply
            .code(404)
            .send(error('MODEL_NOT_FOUND', 'The candidate model was not found.'))
        }
        throw caught
      }
    },
  )

  app.delete<{ Querystring: { candidateId?: string } }>(
    '/api/profile/models',
    async (request, reply) => {
      if (!request.query.candidateId) {
        return reply
          .code(400)
          .send(error('INVALID_TRANSCRIPT', 'A candidate ID is required.'))
      }
      return {
        deleted: repository.deleteModelsByCandidate(request.query.candidateId),
      }
    },
  )
}

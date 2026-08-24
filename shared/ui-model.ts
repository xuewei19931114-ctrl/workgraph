import { z } from 'zod'

const ConfidenceSchema = z.enum(['high', 'medium', 'unknown'])

const EvidenceItemSchema = z
  .object({
    quote: z.string().nullable(),
    narrative: z.string().optional(),
    source: z.string(),
  })
  .strict()

const CapabilitySchema = z
  .object({
    title: z.string(),
    strength: z.enum(['strong', 'repeated', 'early']),
    detail: z.string(),
    evidence: z.array(EvidenceItemSchema),
  })
  .strict()

const ModelDimensionSchema = z
  .object({
    label: z.string(),
    confidence: ConfidenceSchema,
    detail: z.string(),
  })
  .strict()

const RoleMatchSchema = z
  .object({
    role: z.string(),
    verdict: z.enum(['great', 'depends', 'avoid']),
    reason: z.string(),
    boundary: z.string(),
  })
  .strict()

const ReviewerEpisodeSchema = z
  .object({
    title: z.string(),
    narrative: z.string(),
    quote: z.string().nullable(),
    source: z.string(),
    protectedStandard: z.string(),
  })
  .strict()

const ReviewerMechanismSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    contexts: z.array(z.string()),
    confirmed: z.array(z.string()),
    missing: z.array(z.string()),
    confidence: ConfidenceSchema,
  })
  .strict()

const ReviewerCompetitorSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    explains: z.array(z.string()),
    failsToExplain: z.array(z.string()),
    isWinner: z.boolean(),
  })
  .strict()

const ReviewerReportSchema = z
  .object({
    nameEn: z.string(),
    definition: z.string(),
    whyThisNotThat: z.string(),
    coreLoopNarrative: z.string(),
    whyDifferent: z.string(),
    explanatoryConfidenceLabel: z.string(),
    outcomeConfidenceLabel: z.string(),
    episodes: z.array(ReviewerEpisodeSchema),
    mechanisms: z.array(ReviewerMechanismSchema),
    capabilities: z.array(
      z
        .object({
          name: z.string(),
          emergentLogic: z.string(),
          episodeTitles: z.array(z.string()),
        })
        .strict(),
    ),
    competingArchetypes: z.array(ReviewerCompetitorSchema),
    counterargument: z
      .object({
        argument: z.string(),
        whatItExplains: z.string(),
        whatItFailsToExplain: z.string(),
        whyItDoesOrDoesNotWin: z.string(),
      })
      .strict(),
    strengthRisks: z.array(
      z
        .object({
          strength: z.string(),
          risk: z.string(),
        })
        .strict(),
    ),
    hiringManagerSummary: z.string(),
  })
  .strict()

export const UiCandidateModelSchema = z
  .object({
    generatedAt: z.number().int().nonnegative(),
    headline: z.string(),
    thesis: z.string(),
    dimensionCount: z.number().int().nonnegative(),
    sourceLabel: z.string(),
    unknownCount: z.number().int().nonnegative(),
    dimensions: z.array(ModelDimensionSchema),
    cannotProve: z.array(z.string()),
    capabilities: z.array(CapabilitySchema),
    strengths: z.array(z.string()),
    risks: z.array(z.string()),
    riskNote: z.string(),
    roles: z.array(RoleMatchSchema),
    nextQuestions: z.array(z.string()),
    reviewerReport: ReviewerReportSchema.optional(),
  })
  .strict()

export type UiCandidateModel = z.infer<typeof UiCandidateModelSchema>
export type UiReviewerReport = z.infer<typeof ReviewerReportSchema>

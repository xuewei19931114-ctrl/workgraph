import { z } from 'zod'

import { EpisodeSchema } from '../../../shared/profile-schemas.js'

export const EVIDENCE_EXTRACTOR_PROMPT_VERSION =
  'reviewer-brain-evidence-v1.0.0'

const episodeArrayJsonSchema = JSON.stringify(
  z.toJSONSchema(z.array(EpisodeSchema)),
  null,
  2,
)

export function buildEvidenceExtractorPrompt(input?: unknown): string {
  const inputSection =
    input === undefined
      ? ''
      : `\n\n<transcript_chunk>\n${JSON.stringify(input)}\n</transcript_chunk>`

  return `Extract high-signal behavioral Episodes only.

Do not infer a final archetype, mechanism, capability, role, readiness, seniority, or hiring verdict. Do not summarize topics.

Prioritize correction, rejection, reframing, constraint injection, boundary definition, anomaly detection, trade-off, goal restoration, convergence/stopping, action, delegation, automation, and cross-context transfer. Exclude factual lookup, passive agreement, self-description, topic frequency, and sophisticated assistant output accepted without modification.

For each Episode retain:
- context and trigger;
- the assistant or external proposal, where present;
- the user's action;
- verbatim_user_quote: an exact character-for-character copy from a user-authored source message when one exists; otherwise use null. Never rewrite user_action into a quotation;
- behavior types;
- one primary protected_standard, structured protected_standard_alternatives, and has_protected_standard_conflict;
- 2–4 plausible alternative explanations;
- explicit agency estimates separating user authorship, user judgment, user correction, user reframing, AI authorship, and third-party authorship;
- signal strength;
- exact source message IDs.

Assistant-generated and third-party content is context, not user capability. Do not attribute sophistication to the candidate without meaningful user judgment, correction, reframing, independent constraint introduction, or transfer. Prefer diverse conversations and contexts. Extract only evidence present in this chunk; a context_only message supplies adjacency but must not be emitted as new non-context evidence by itself.

Return only a JSON array conforming exactly to this current Episode array JSON Schema:
${episodeArrayJsonSchema}${inputSection}`
}

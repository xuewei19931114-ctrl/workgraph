export const CRITIC_PROMPT_VERSION = 'reviewer-brain-critic-v1.0.0'

export function buildCriticPrompt(input?: unknown): string {
  const inputSection =
    input === undefined
      ? ''
      : `\n\n<critic_input>\n${JSON.stringify(input)}\n</critic_input>`

  return `Do not regenerate, rewrite, improve, or replace the Candidate Model. Find only material inference errors.

Check:
- AI authorship leakage;
- third-party contamination;
- ambiguous attribution;
- missing evidence treated as weakness or contradiction;
- generic archetype with weak discriminative power;
- one-domain overfit instead of cross-context recurrence;
- unsupported mechanism or capability abstraction;
- capability without emergent logic;
- direct contradiction or ignored counter-evidence;
- a simpler credible alternative that explains the evidence;
- incomplete five-way archetype competition;
- weak or intentionally softened strongest counterargument;
- strength-to-risk claims not derived from observed strengths or exceeding their evidence ceiling;
- topic-to-role matching;
- role inflation;
- conflation of Natural Fit, Readiness / Proven Experience, and Seniority;
- false seniority/readiness;
- broken evidence traceability or invalid source IDs;
- fabricated certainty where the result should remain null/under-resolved;
- prose in the structured hiring summary.

Return only material issues. If there are no material issues, return an empty issues array. The verdict must be exactly one of pass, revise, or unresolved:
- pass: no material issue;
- revise: material issues are correctable from existing evidence;
- unresolved: available evidence cannot resolve the material uncertainty.

Return only JSON with exactly this shape and no additional keys:
{
  "verdict": "pass | revise | unresolved",
  "issues": [{
    "code": "stable_machine_readable_code",
    "path": "candidate_model.path",
    "message": "material issue",
    "evidence_ids": ["exact message or Episode ID"]
  }]
}${inputSection}`
}

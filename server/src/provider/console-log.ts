const PREVIEW_LIMIT = 4000

export function previewText(value: string, limit = PREVIEW_LIMIT): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…[truncated ${value.length - limit} chars]`
}

export function redactSecrets(
  text: string,
  secrets: readonly string[],
): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce((current, secret) => current.split(secret).join('[redacted]'), text)
}

export function formatGptRequestLog(input: {
  stage: string
  jobId?: string
  endpoint: string
  model: string
  format: 'json_schema' | 'json_object'
  instructions: string
  promptInput: string
  secrets?: readonly string[]
}): string {
  const secrets = input.secrets ?? []
  return redactSecrets(
    [
      `[gpt] request stage=${input.stage} job=${input.jobId ?? 'none'} model=${input.model} format=${input.format}`,
      `[gpt] endpoint=${input.endpoint}`,
      `[gpt] instructionsChars=${input.instructions.length} inputChars=${input.promptInput.length}`,
      '[gpt] instructionsPreview=',
      previewText(input.instructions),
      '[gpt] input=',
      input.promptInput,
    ].join('\n'),
    secrets,
  )
}

export function formatGptResponseLog(input: {
  stage: string
  jobId?: string
  endpoint: string
  state: string
  responseId: string | null
  wallMs: number
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  outputText?: string
  error?: string
  secrets?: readonly string[]
}): string {
  const secrets = input.secrets ?? []
  const lines = [
    `[gpt] response stage=${input.stage} job=${input.jobId ?? 'none'} state=${input.state} wallMs=${input.wallMs}`,
    `[gpt] endpoint=${input.endpoint}`,
    `[gpt] responseId=${input.responseId ?? 'none'} inputTokens=${input.inputTokens ?? 'none'} outputTokens=${input.outputTokens ?? 'none'} reasoningTokens=${input.reasoningTokens ?? 'none'}`,
  ]
  if (input.error) {
    lines.push(`[gpt] error=${input.error}`)
  }
  if (input.outputText !== undefined) {
    lines.push('[gpt] outputPreview=', previewText(input.outputText))
  }
  return redactSecrets(lines.join('\n'), secrets)
}

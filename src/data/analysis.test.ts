import { describe, expect, it } from 'vitest'

import {
  analysisStageIndex,
  analysisTerminalMessage,
} from './analysis'

describe('analysis status mapping', () => {
  it.each([
    ['queued', 0],
    ['parsing', 0],
    ['extracting', 1],
    ['inferring', 2],
    ['criticizing', 3],
    ['validating', 3],
    ['completed', 4],
    ['unresolved', 4],
    ['failed', 4],
    ['cancelled', 4],
  ] as const)('maps %s to real stage %i', (status, expected) => {
    expect(analysisStageIndex(status)).toBe(expected)
  })

  it('does not describe unresolved analysis as successful', () => {
    expect(analysisTerminalMessage('unresolved')).toContain('证据仍不足')
    expect(analysisTerminalMessage('unresolved')).not.toContain('生成成功')
  })
})

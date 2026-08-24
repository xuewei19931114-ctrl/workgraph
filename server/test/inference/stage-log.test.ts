import { describe, expect, it } from 'vitest'

import { transcriptStageSummary } from '../../src/inference/stage-log.js'

describe('transcriptStageSummary', () => {
  it('counts conversations, roles, and authorship', () => {
    expect(
      transcriptStageSummary({
        source_type: 'merged-local-archives',
        conversations: [
          {
            messages: [
              { role: 'user', authorship: 'unknown' },
              { role: 'assistant', authorship: 'assistant' },
            ],
          },
        ],
      }),
    ).toBe(
      'conversations=1 messages=2 source=merged-local-archives roles={user:1,assistant:1} authorship={unknown:1,assistant:1}',
    )
  })
})

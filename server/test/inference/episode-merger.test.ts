import { describe, expect, it } from 'vitest'

import type { Episode, Transcript } from '../../../shared/profile-schemas.js'
import {
  EpisodeMergeError,
  mergeEpisodes,
} from '../../src/inference/episode-merger.js'

const transcript: Transcript = {
  candidate_id: 'candidate-1',
  source_type: 'chat',
  conversations: [
    {
      conversation_id: 'c1',
      title: 'one',
      messages: [
        {
          message_id: 'm1',
          role: 'user',
          content: 'one',
          timestamp: null,
          authorship: 'user',
        },
        {
          message_id: 'm2',
          role: 'user',
          content: 'two',
          timestamp: null,
          authorship: 'user',
        },
      ],
    },
    {
      conversation_id: 'c2',
      title: 'two',
      messages: [
        {
          message_id: 'm3',
          role: 'user',
          content: 'three',
          timestamp: null,
          authorship: 'user',
        },
      ],
    },
  ],
}

function episode(
  episodeId: string,
  sourceMessageIds: string[],
  overrides: Partial<Episode> = {},
): Episode {
  return {
    episode_id: episodeId,
    context: `context-${episodeId}`,
    trigger: 'trigger',
    assistant_or_external_proposal: 'proposal',
    user_action: 'action',
    verbatim_user_quote: null,
    behavior_types: ['correction'],
    protected_standard: 'goal fidelity',
    protected_standard_alternatives: [],
    has_protected_standard_conflict: false,
    alternative_explanations: ['domain familiarity'],
    agency: {
      user_authorship: 1,
      user_judgment: 0.9,
      user_correction: 0.9,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    },
    signal_strength: 0.8,
    source_message_ids: sourceMessageIds,
    ...overrides,
  }
}

describe('mergeEpisodes', () => {
  it('deduplicates identical sorted source sets and conservatively merges conflicts', () => {
    const merged = mergeEpisodes(
      [
        [episode('z', ['m2', 'm1'])],
        [
          episode('a', ['m1', 'm2'], {
            behavior_types: ['reframing'],
            protected_standard: 'scope discipline',
            protected_standard_alternatives: ['implementation feasibility'],
            has_protected_standard_conflict: true,
            alternative_explanations: ['control preference'],
            signal_strength: 0.4,
          }),
        ],
      ],
      transcript,
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      episode_id: 'a',
      signal_strength: 0.4,
      behavior_types: ['correction', 'reframing'],
      alternative_explanations: ['control preference', 'domain familiarity'],
      protected_standard: 'scope discipline',
      protected_standard_alternatives: [
        'goal fidelity',
        'implementation feasibility',
      ],
      has_protected_standard_conflict: true,
      source_message_ids: ['m1', 'm2'],
    })
  })

  it('rejects invalid source IDs with a typed error', () => {
    expect(() =>
      mergeEpisodes([[episode('bad', ['missing'])]], transcript),
    ).toThrowError(
      expect.objectContaining<Partial<EpisodeMergeError>>({
        code: 'INVALID_SOURCE_ID',
        sourceId: 'missing',
      }),
    )
  })

  it('orders by new conversation coverage, then signal, then stable ID', () => {
    const merged = mergeEpisodes(
      [
        [
          episode('b', ['m1'], { signal_strength: 0.9 }),
          episode('c', ['m2'], { signal_strength: 1 }),
          episode('a', ['m3'], { signal_strength: 0.5 }),
        ],
      ],
      transcript,
    )

    expect(merged.map((item) => item.episode_id)).toEqual(['c', 'a', 'b'])
    expect(new Set(merged.map((item) => item.episode_id)).size).toBe(
      merged.length,
    )
  })

  it('validates every input through EpisodeSchema', () => {
    const invalid = { ...episode('bad', ['m1']), signal_strength: 2 }

    expect(() =>
      mergeEpisodes([[invalid as Episode]], transcript),
    ).toThrowError()
  })

  it('assigns colliding Episode IDs deterministically across batch order', () => {
    const first = episode('same', ['m1'])
    const second = episode('same', ['m3'])
    const identityBySources = (items: Episode[]) =>
      Object.fromEntries(
        items.map((item) => [item.source_message_ids.join(','), item.episode_id]),
      )

    expect(identityBySources(mergeEpisodes([[first, second]], transcript))).toEqual(
      identityBySources(mergeEpisodes([[second, first]], transcript)),
    )
  })

  it('selects the same primary standard for same-ID duplicates regardless of batch order', () => {
    const first = episode('same', ['m1'], {
      protected_standard: 'scope discipline',
    })
    const second = episode('same', ['m1'], {
      protected_standard: 'goal fidelity',
    })

    const forward = mergeEpisodes([[first], [second]], transcript)
    const reversed = mergeEpisodes([[second], [first]], transcript)

    expect(forward).toEqual(reversed)
    expect(forward[0]).toMatchObject({
      protected_standard: 'goal fidelity',
      protected_standard_alternatives: ['scope discipline'],
      has_protected_standard_conflict: true,
    })
  })
})

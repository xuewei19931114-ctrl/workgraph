import {
  EpisodeSchema,
  type Episode,
  type Transcript,
} from '../../../shared/profile-schemas.js'

export class EpisodeMergeError extends Error {
  readonly code = 'INVALID_SOURCE_ID' as const

  constructor(readonly sourceId: string) {
    super(`Episode references unknown transcript message "${sourceId}".`)
    this.name = 'EpisodeMergeError'
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function sourceKey(episode: Episode): string {
  return uniqueSorted(episode.source_message_ids).join('\u0000')
}

function compareEpisodesDeterministically(
  left: Episode,
  right: Episode,
): number {
  return (
    left.episode_id.localeCompare(right.episode_id) ||
    sourceKey(left).localeCompare(sourceKey(right)) ||
    left.protected_standard.localeCompare(right.protected_standard) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  )
}

function mergeDuplicateGroup(group: Episode[]): Episode {
  const stable = [...group].sort(compareEpisodesDeterministically)
  const base = stable[0]
  const protectedStandards = uniqueSorted(
    group.flatMap((episode) => [
      episode.protected_standard,
      ...episode.protected_standard_alternatives,
    ]),
  )
  return EpisodeSchema.parse({
    ...base,
    episode_id: base.episode_id,
    source_message_ids: uniqueSorted(
      group.flatMap((episode) => episode.source_message_ids),
    ),
    signal_strength: Math.min(
      ...group.map((episode) => episode.signal_strength),
    ),
    behavior_types: uniqueSorted(
      group.flatMap((episode) => episode.behavior_types),
    ),
    alternative_explanations: uniqueSorted(
      group.flatMap((episode) => episode.alternative_explanations),
    ),
    protected_standard: base.protected_standard,
    protected_standard_alternatives: protectedStandards.filter(
      (standard) => standard !== base.protected_standard,
    ),
    has_protected_standard_conflict:
      protectedStandards.length > 1 ||
      group.some((episode) => episode.has_protected_standard_conflict),
  })
}

function ensureUniqueIds(episodes: Episode[]): Episode[] {
  const used = new Set<string>()
  return episodes.map((episode) => {
    let id = episode.episode_id
    let suffix = 2
    while (used.has(id)) {
      id = `${episode.episode_id}~${suffix}`
      suffix += 1
    }
    used.add(id)
    return id === episode.episode_id ? episode : { ...episode, episode_id: id }
  })
}

export function mergeEpisodes(
  batches: ReadonlyArray<ReadonlyArray<Episode>>,
  transcript: Transcript,
): Episode[] {
  const messageToConversation = new Map<string, string>()
  for (const conversation of transcript.conversations) {
    for (const message of conversation.messages) {
      messageToConversation.set(message.message_id, conversation.conversation_id)
    }
  }

  const groups = new Map<string, Episode[]>()
  for (const batch of batches) {
    for (const input of batch) {
      const episode = EpisodeSchema.parse(input)
      for (const sourceId of episode.source_message_ids) {
        if (!messageToConversation.has(sourceId)) {
          throw new EpisodeMergeError(sourceId)
        }
      }
      const key = sourceKey(episode)
      const group = groups.get(key)
      if (group) {
        group.push(episode)
      } else {
        groups.set(key, [episode])
      }
    }
  }

  const remaining = ensureUniqueIds(
    [...groups.values()]
      .map(mergeDuplicateGroup)
      .sort(
        (left, right) =>
          left.episode_id.localeCompare(right.episode_id) ||
          sourceKey(left).localeCompare(sourceKey(right)),
      ),
  )
  const ordered: Episode[] = []
  const coveredConversations = new Set<string>()

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const newCoverage = (episode: Episode) =>
        new Set(
          episode.source_message_ids
            .map((id) => messageToConversation.get(id))
            .filter(
              (id): id is string =>
                id !== undefined && !coveredConversations.has(id),
            ),
        ).size
      return (
        newCoverage(right) - newCoverage(left) ||
        right.signal_strength - left.signal_strength ||
        left.episode_id.localeCompare(right.episode_id)
      )
    })
    const next = remaining.shift()
    if (!next) {
      break
    }
    ordered.push(next)
    next.source_message_ids.forEach((id) => {
      const conversationId = messageToConversation.get(id)
      if (conversationId) {
        coveredConversations.add(conversationId)
      }
    })
  }

  return ordered
}

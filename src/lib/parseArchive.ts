import { unzipSync, strFromU8 } from 'fflate'
import {
  TranscriptSchema,
  type Transcript,
} from '../../shared/profile-schemas'
import type { ParsedArchive } from '../types'
import { createConversationId, createMessageId } from './transcriptIds'

type TranscriptMessage = Transcript['conversations'][number]['messages'][number]
type MessageRole = TranscriptMessage['role']
type Authorship = TranscriptMessage['authorship']

interface DraftMessage {
  role: MessageRole
  content: string
  timestamp: string | null
  authorship: Authorship
}

interface DraftConversation {
  title: string
  messages: DraftMessage[]
}

interface ChatGptMessage {
  author?: { role?: unknown }
  create_time?: unknown
  content?: { parts?: unknown }
}

/** All parsing and normalization happens locally in the browser. */
export async function parseArchive(
  file: File,
  candidateId: string,
): Promise<ParsedArchive> {
  const ext = extensionOf(file.name)
  let conversations: DraftConversation[]

  switch (ext) {
    case 'zip':
      conversations = parseZip(await file.arrayBuffer())
      break
    case 'docx':
      conversations = parseDocx(await file.arrayBuffer(), file.name)
      break
    case 'json':
      conversations = parseJsonText(await file.text())
      break
    case 'html':
    case 'htm':
      conversations = parseHtml(await file.text(), file.name)
      break
    case 'txt':
    case 'md':
      conversations = parsePlainText(await file.text(), file.name)
      break
    case 'pdf':
      throw new Error('PDF 需要在分析阶段解析，本地只做校验。')
    case 'doc':
      throw new Error('旧版 DOC 暂不支持，请另存为 DOCX 后上传。')
    default:
      throw new Error('支持 ZIP、HTML、TXT、JSON、DOCX 文件。')
  }

  const transcript = await normalizeTranscript(candidateId, ext, conversations)
  return {
    stats: {
      conversations: transcript.conversations.length,
      messages: transcript.conversations.reduce(
        (total, conversation) => total + conversation.messages.length,
        0,
      ),
    },
    transcript,
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left)
  const rightPoints = Array.from(right)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)

  for (let index = 0; index < sharedLength; index += 1) {
    const difference =
      (leftPoints[index].codePointAt(0) ?? 0) -
      (rightPoints[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function parseZip(buffer: ArrayBuffer): DraftConversation[] {
  const entries = unzipSync(new Uint8Array(buffer))
  const conversations: DraftConversation[] = []
  const failedPaths: string[] = []

  for (const [path, bytes] of Object.entries(entries).sort(([left], [right]) =>
    compareCodePoints(left, right),
  )) {
    if (path.endsWith('/')) continue
    const ext = extensionOf(path)
    const parseEntry =
      path.endsWith('conversations.json') || ext === 'json'
        ? () => parseJsonText(strFromU8(bytes))
        : ext === 'html' || ext === 'htm'
          ? () => parseHtml(strFromU8(bytes), path)
          : ext === 'txt' || ext === 'md'
            ? () => parsePlainText(strFromU8(bytes), path)
            : null
    if (!parseEntry) continue

    try {
      conversations.push(...parseEntry())
    } catch {
      failedPaths.push(path)
    }
  }

  if (failedPaths.length > 0) {
    throw new Error(`ZIP entries failed to parse: ${failedPaths.join(', ')}`)
  }

  if (!conversations.some((conversation) => conversation.messages.length > 0)) {
    throw new Error('ZIP 中没有找到 conversations.json、TXT 或 HTML。')
  }
  return conversations
}

/** DOCX 本质是一个 ZIP，正文在 word/document.xml 里。 */
function parseDocx(buffer: ArrayBuffer, title: string): DraftConversation[] {
  const entries = unzipSync(new Uint8Array(buffer))
  const document = entries['word/document.xml']
  if (!document) throw new Error('无法解析这个 DOCX 文件。')
  const text = strFromU8(document)
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
  return parsePlainText(decodeHtmlEntities(text), title)
}

function parseJsonText(raw: string): DraftConversation[] {
  const data: unknown = JSON.parse(raw)
  const list = Array.isArray(data) ? data : [data]
  const conversations = list.flatMap((item, index) =>
    parseJsonConversation(item, index),
  )

  if (!conversations.some((conversation) => conversation.messages.length > 0)) {
    throw new Error('没有找到可识别的对话记录。')
  }
  return conversations
}

function parseHtml(raw: string, title: string): DraftConversation[] {
  const embedded = extractChatGptJsonData(raw)
  if (embedded !== null) {
    try {
      return parseJsonText(embedded)
    } catch {
      // Fall through to generic HTML text extraction.
    }
  }
  return parsePlainText(stripHtml(raw), title)
}

function extractChatGptJsonData(raw: string): string | null {
  const match = /(?:var|let|const)\s+jsonData\s*=\s*/.exec(raw)
  if (!match || match.index === undefined) return null
  return extractJsonLiteral(raw, match.index + match[0].length)
}

function extractJsonLiteral(source: string, start: number): string | null {
  let index = start
  while (index < source.length && /\s/.test(source[index]!)) index += 1
  const opener = source[index]
  if (opener !== '{' && opener !== '[') return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor]!
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{' || character === '[') depth += 1
    if (character === '}' || character === ']') {
      depth -= 1
      if (depth === 0) return source.slice(index, cursor + 1)
    }
  }
  return null
}

function stripHtml(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(?:br)\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function parsePlainText(raw: string, title: string): DraftConversation[] {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) throw new Error('没有读取到足够的聊天文本。')
  const marker = /(?:^|\n)\s*(User|Assistant|System|Tool)\s*:\s*/gi
  const matches = [...text.matchAll(marker)]
  const messages: DraftMessage[] = []

  if (matches.length > 0) {
    const prefix = text.slice(0, matches[0].index).trim()
    if (prefix) messages.push(unknownMessage(prefix))

    matches.forEach((match, index) => {
      const start = (match.index ?? 0) + match[0].length
      const end = matches[index + 1]?.index ?? text.length
      const content = text.slice(start, end).trim()
      if (!content) return
      const role = match[1].toLowerCase() as MessageRole
      messages.push({
        role,
        content,
        timestamp: null,
        authorship: authorshipForRole(role),
      })
    })
  } else {
    text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .forEach((block) => messages.push(unknownMessage(block)))
  }

  return [{ title, messages }]
}

function parseJsonConversation(
  item: unknown,
  index: number,
): DraftConversation[] {
  if (!isRecord(item)) {
    return [
      {
        title: `Conversation ${index + 1}`,
        messages: [unknownMessage(String(item))],
      },
    ]
  }

  const title =
    typeof item.title === 'string' ? item.title : `Conversation ${index + 1}`
  if (isRecord(item.mapping)) {
    return [
      {
        title,
        messages: parseChatGptMapping(
          item.mapping,
          item.current_node,
          Object.hasOwn(item, 'current_node'),
        ),
      },
    ]
  }
  if (Array.isArray(item.messages)) {
    return [
      {
        title,
        messages: item.messages.flatMap((message) => {
          const parsed = parseGenericJsonMessage(message)
          return parsed ? [parsed] : []
        }),
      },
    ]
  }
  return [{ title, messages: [unknownMessage(JSON.stringify(item))] }]
}

function parseChatGptMapping(
  mapping: Record<string, unknown>,
  currentNode: unknown,
  currentNodePresent: boolean,
): DraftMessage[] {
  const entries = Object.entries(mapping)
  let selected: Array<[string, unknown]>

  if (currentNodePresent) {
    if (typeof currentNode !== 'string' || !Object.hasOwn(mapping, currentNode)) {
      throw new Error(
        `current_node ${JSON.stringify(currentNode)} is missing from mapping`,
      )
    }
    selected = []
    const visited = new Set<string>()
    let nodeId: string | null = currentNode
    while (nodeId !== null && !visited.has(nodeId)) {
      visited.add(nodeId)
      const node: unknown = mapping[nodeId]
      selected.push([nodeId, node])
      nodeId =
        isRecord(node) && typeof node.parent === 'string' ? node.parent : null
    }
    selected.reverse()
  } else {
    selected = entries
      .map(([id, node], position) => ({ id, node, position }))
      .filter(({ node }) => chatGptMessageFromNode(node) !== null)
      .sort((left, right) => {
        const leftTime = createTimeFromNode(left.node)
        const rightTime = createTimeFromNode(right.node)
        return leftTime === rightTime
          ? left.position - right.position
          : leftTime - rightTime
      })
      .map(({ id, node }) => [id, node])
  }

  return selected.flatMap(([, node]) => {
    const message = chatGptMessageFromNode(node)
    if (!message) return []
    const role = validRole(message.author?.role)
    const content = contentFromParts(message.content?.parts)
    if (!role || !content) return []
    return [
      {
        role,
        content,
        timestamp: timestampFrom(message.create_time),
        authorship: authorshipForRole(role),
      },
    ]
  })
}

function parseGenericJsonMessage(item: unknown): DraftMessage | null {
  if (!isRecord(item)) return null
  const role = validRole(item.role)
  const content =
    typeof item.content === 'string'
      ? item.content
      : isRecord(item.content)
        ? contentFromParts(item.content.parts)
        : ''
  if (!role || !content) return null
  return {
    role,
    content,
    timestamp: timestampFrom(item.timestamp ?? item.create_time),
    authorship: authorshipForRole(role),
  }
}

function chatGptMessageFromNode(node: unknown): ChatGptMessage | null {
  if (!isRecord(node) || !isRecord(node.message)) return null
  return node.message as ChatGptMessage
}

function createTimeFromNode(node: unknown): number {
  const value = chatGptMessageFromNode(node)?.create_time
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY
}

function contentFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => {
      if (typeof part === 'string') return part
      if (isRecord(part) && typeof part.text === 'string') return part.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function timestampFrom(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value
    const date = new Date(milliseconds)
    return Number.isNaN(date.valueOf()) ? null : date.toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? null : date.toISOString()
  }
  return null
}

function validRole(value: unknown): MessageRole | null {
  return value === 'user' ||
    value === 'assistant' ||
    value === 'system' ||
    value === 'tool'
    ? value
    : null
}

function authorshipForRole(role: MessageRole): Authorship {
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  return 'third_party'
}

function unknownMessage(content: string): DraftMessage {
  return {
    role: 'user',
    content,
    timestamp: null,
    authorship: 'unknown',
  }
}

async function normalizeTranscript(
  candidateId: string,
  sourceType: string,
  drafts: DraftConversation[],
): Promise<Transcript> {
  const conversations = await Promise.all(
    drafts.map(async (conversation, conversationIndex) => ({
      conversation_id: await createConversationId(
        sourceType,
        conversationIndex,
        conversation.title,
      ),
      title: conversation.title,
      messages: await Promise.all(
        conversation.messages.map(async (message, messageIndex) => ({
          message_id: await createMessageId(
            sourceType,
            conversationIndex,
            messageIndex,
            message.role,
            message.content,
          ),
          ...message,
        })),
      ),
    })),
  )

  return TranscriptSchema.parse({
    candidate_id: candidateId,
    source_type: sourceType,
    conversations,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

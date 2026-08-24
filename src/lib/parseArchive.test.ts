/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { TranscriptSchema } from '../../shared/profile-schemas'
import { parseArchive } from './parseArchive'
import { createConversationId, createMessageId } from './transcriptIds'

const fixtureUrl = (name: string) =>
  new URL(`../../test/fixtures/${name}`, import.meta.url)

async function fixtureFile(name: string, type: string): Promise<File> {
  const contents = await readFile(fileURLToPath(fixtureUrl(name)))
  return new File([contents], name, { type })
}

describe('parseArchive', () => {
  it('selects the active ChatGPT branch and preserves message authorship', async () => {
    const file = await fixtureFile(
      'chatgpt-conversations.json',
      'application/json',
    )

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(result.stats).toEqual({ conversations: 1, messages: 4 })
    expect(result.transcript.conversations[0].messages[0].role).toBe('user')
    expect(result.transcript.conversations[0].messages[1].authorship).toBe(
      'assistant',
    )
    expect(
      result.transcript.conversations[0].messages.map(
        (message) => message.content,
      ),
    ).not.toContain('This branch must not be selected.')
    expect(
      result.transcript.conversations[0].messages.map(
        (message) => message.timestamp,
      ),
    ).toEqual([
      '2023-11-14T22:13:21.000Z',
      '2023-11-14T22:13:22.000Z',
      '2023-11-14T22:13:24.000Z',
      '2023-11-14T22:13:25.000Z',
    ])
    expect(TranscriptSchema.parse(result.transcript)).toEqual(result.transcript)
  })

  it('sorts ChatGPT messages without current_node by time then source position', async () => {
    const file = new File(
      [
        JSON.stringify({
          title: 'Synthetic fallback ordering',
          mapping: {
            later: {
              message: {
                author: { role: 'assistant' },
                create_time: 20,
                content: { parts: ['Later'] },
              },
            },
            tiedFirst: {
              message: {
                author: { role: 'user' },
                create_time: 10,
                content: { parts: ['Tied first'] },
              },
            },
            tiedSecond: {
              message: {
                author: { role: 'assistant' },
                create_time: 10,
                content: { parts: ['Tied second'] },
              },
            },
          },
        }),
      ],
      'fallback.json',
    )

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(
      result.transcript.conversations[0].messages.map(
        (message) => message.content,
      ),
    ).toEqual(['Tied first', 'Tied second', 'Later'])
  })

  it('rejects a ChatGPT conversation with a dangling current_node', async () => {
    const file = new File(
      [
        JSON.stringify({
          title: 'Synthetic dangling branch',
          current_node: 'missing-node',
          mapping: {
            valid: {
              message: {
                author: { role: 'user' },
                create_time: 10,
                content: { parts: ['Must not be returned as fallback'] },
              },
            },
          },
        }),
      ],
      'dangling.json',
    )

    await expect(
      parseArchive(file, 'candidate-synthetic'),
    ).rejects.toThrow('current_node "missing-node" is missing from mapping')
  })

  it.each(['constructor', 'toString', '__proto__'])(
    'rejects inherited mapping key %s as a dangling current_node',
    async (currentNode) => {
      const file = new File(
        [
          JSON.stringify({
            title: 'Synthetic inherited key',
            current_node: currentNode,
            mapping: {
              valid: {
                message: {
                  author: { role: 'user' },
                  create_time: 10,
                  content: { parts: ['Must not satisfy inherited key lookup'] },
                },
              },
            },
          }),
        ],
        'inherited-key.json',
      )

      await expect(
        parseArchive(file, 'candidate-synthetic'),
      ).rejects.toThrow(
        `current_node ${JSON.stringify(currentNode)} is missing from mapping`,
      )
    },
  )

  it('rejects multi-conversation JSON when one current_node is inherited', async () => {
    const file = new File(
      [
        JSON.stringify([
          {
            title: 'Synthetic valid conversation',
            mapping: {
              valid: {
                message: {
                  author: { role: 'user' },
                  create_time: 10,
                  content: { parts: ['Valid synthetic message'] },
                },
              },
            },
          },
          {
            title: 'Synthetic inherited-key conversation',
            current_node: 'constructor',
            mapping: {
              valid: {
                message: {
                  author: { role: 'assistant' },
                  create_time: 20,
                  content: { parts: ['Must not allow partial success'] },
                },
              },
            },
          },
        ]),
      ],
      'multi-inherited-key.json',
    )

    await expect(
      parseArchive(file, 'candidate-synthetic'),
    ).rejects.toThrow('current_node "constructor" is missing from mapping')
  })

  it('produces the same transcript when the same JSON is parsed twice', async () => {
    const file = await fixtureFile(
      'chatgpt-conversations.json',
      'application/json',
    )

    const firstParse = await parseArchive(file, 'candidate-synthetic')
    const secondParse = await parseArchive(file, 'candidate-synthetic')

    expect(secondParse.transcript).toEqual(firstParse.transcript)
  })

  it('extracts ChatGPT jsonData from an HTML data export', async () => {
    const json = await readFile(
      fileURLToPath(fixtureUrl('chatgpt-conversations.json')),
      'utf8',
    )
    const file = new File(
      [
        `<html><head><title>ChatGPT Data Export</title><script>
      var jsonData = ${json};
      function getConversationMessages(conversation) {
        return conversation.current_node;
      }
    </script></head><body></body></html>`,
      ],
      'chat.html',
      { type: 'text/html' },
    )

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(result.stats).toEqual({ conversations: 1, messages: 4 })
    expect(
      result.transcript.conversations[0].messages.map(
        (message) => message.content,
      ),
    ).toEqual([
      'Draft a synthetic release checklist.',
      'Start with scope and verification.',
      'Add rollback steps.',
      'Include owner, trigger, and recovery check.',
    ])
    expect(
      result.transcript.conversations[0].messages.map(
        (message) => message.authorship,
      ),
    ).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  it.each([
    ['simple-chat.html', 'text/html'],
    ['simple-chat.txt', 'text/plain'],
  ])('preserves explicit role markers in %s', async (name, type) => {
    const result = await parseArchive(
      await fixtureFile(name, type),
      'candidate-synthetic',
    )

    expect(
      result.transcript.conversations[0].messages.map((message) => ({
        role: message.role,
        authorship: message.authorship,
      })),
    ).toEqual([
      { role: 'user', authorship: 'user' },
      { role: 'assistant', authorship: 'assistant' },
    ])
  })

  it('marks unstructured plain text as unknown authorship', async () => {
    const file = new File(
      ['Synthetic note without an author marker.'],
      'unstructured.txt',
      { type: 'text/plain' },
    )

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(result.transcript.conversations[0].messages[0]).toMatchObject({
      role: 'user',
      authorship: 'unknown',
      content: 'Synthetic note without an author marker.',
    })
  })

  it('unwraps DOCX document text as unknown authorship', async () => {
    const archive = zipSync({
      'word/document.xml': strToU8(
        '<w:document><w:body><w:p><w:r><w:t>Synthetic document note.</w:t></w:r></w:p></w:body></w:document>',
      ),
    })
    const file = new File([archive], 'synthetic.docx')

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(result.transcript.conversations[0].messages[0]).toMatchObject({
      role: 'user',
      authorship: 'unknown',
      content: 'Synthetic document note.',
    })
  })

  it('merges recognized ZIP entries with globally unique deterministic IDs', async () => {
    const json = await readFile(
      fileURLToPath(fixtureUrl('chatgpt-conversations.json')),
    )
    const text = await readFile(fileURLToPath(fixtureUrl('simple-chat.txt')))
    const file = new File(
      [
        zipSync({
          'conversations.json': new Uint8Array(json),
          'notes/simple-chat.txt': new Uint8Array(text),
        }),
      ],
      'synthetic-export.zip',
    )

    const firstParse = await parseArchive(file, 'candidate-synthetic')
    const secondParse = await parseArchive(file, 'candidate-synthetic')
    const messageIds = firstParse.transcript.conversations.flatMap(
      (conversation) =>
        conversation.messages.map((message) => message.message_id),
    )
    const conversationIds = firstParse.transcript.conversations.map(
      (conversation) => conversation.conversation_id,
    )

    expect(firstParse.stats).toEqual({ conversations: 2, messages: 6 })
    expect(new Set(conversationIds).size).toBe(conversationIds.length)
    expect(new Set(messageIds).size).toBe(messageIds.length)
    expect(secondParse.transcript).toEqual(firstParse.transcript)
  })

  it('hashes the exact stable conversation and message ID inputs', async () => {
    await expect(
      createConversationId('json', 0, 'Synthetic title'),
    ).resolves.toBe(
      'b65d90a5e58f8e2516c120204cdd35d4b6782b40eb2ed88e9fcc704c540260bb',
    )
    await expect(
      createMessageId('json', 0, 0, 'user', 'Synthetic content'),
    ).resolves.toBe(
      '921e494af17d6cd6e693625c5fcc9977871f31b96d7ffa7558648c5adf42a4e5',
    )
  })

  it('orders ZIP paths by code point instead of the host locale', async () => {
    const file = new File(
      [
        zipSync({
          'ä-chat.txt': strToU8('User: Synthetic umlaut path.'),
          'z-chat.txt': strToU8('User: Synthetic ASCII path.'),
        }),
      ],
      'path-order.zip',
    )

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(
      result.transcript.conversations.map((conversation) => conversation.title),
    ).toEqual(['z-chat.txt', 'ä-chat.txt'])
  })

  it('orders supplementary ZIP path characters by Unicode code point', async () => {
    const privateUsePath = '\uE000-chat.txt'
    const supplementaryPath = '\u{10000}-chat.txt'
    const file = new File(
      [
        zipSync({
          [supplementaryPath]: strToU8('User: Synthetic supplementary path.'),
          [privateUsePath]: strToU8('User: Synthetic private-use path.'),
        }),
      ],
      'unicode-path-order.zip',
    )

    const result = await parseArchive(file, 'candidate-synthetic')

    expect(
      result.transcript.conversations.map((conversation) => conversation.title),
    ).toEqual([privateUsePath, supplementaryPath])
  })

  it('rejects the whole ZIP and identifies every failed recognized entry', async () => {
    const file = new File(
      [
        zipSync({
          'bad.json': strToU8('{not valid json'),
          'empty.txt': strToU8('   '),
          'valid.txt': strToU8('User: Synthetic valid entry.'),
        }),
      ],
      'partial-success.zip',
    )

    await expect(
      parseArchive(file, 'candidate-synthetic'),
    ).rejects.toThrow('ZIP entries failed to parse: bad.json, empty.txt')
  })

  it('treats an empty recognized ZIP entry as a parse failure', async () => {
    const file = new File(
      [
        zipSync({
          'empty.json': new Uint8Array(),
          'valid.txt': strToU8('User: Synthetic valid entry.'),
        }),
      ],
      'empty-recognized-entry.zip',
    )

    await expect(
      parseArchive(file, 'candidate-synthetic'),
    ).rejects.toThrow('ZIP entries failed to parse: empty.json')
  })

  it.each([
    ['synthetic.pdf', 'PDF 需要在分析阶段解析'],
    ['synthetic.doc', '旧版 DOC 暂不支持'],
  ])('rejects unsupported %s files explicitly', async (name, message) => {
    await expect(
      parseArchive(new File(['synthetic'], name), 'candidate-synthetic'),
    ).rejects.toThrow(message)
  })
})

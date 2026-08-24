import type { IncomingMessage, ServerResponse } from 'node:http'

import { createRuntime } from '../server/src/create-runtime.js'

const runtimePromise = createRuntime()

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const { app } = await runtimePromise
  app.server.emit('request', request, response)
}

import { describe, expect, it } from 'vitest'

import { createProductionShutdown } from '../src/shutdown.js'

describe('production shutdown', () => {
  it('stops accepting traffic before manager shutdown and repository close', async () => {
    const order: string[] = []
    const shutdown = createProductionShutdown({
      closeApp: async () => {
        order.push('app')
      },
      stopBackground: () => {
        order.push('background')
      },
      shutdownManager: async () => {
        order.push('manager')
      },
      closeRepository: () => {
        order.push('repository')
      },
    })

    await Promise.all([shutdown(), shutdown()])

    expect(order).toEqual(['app', 'background', 'manager', 'repository'])
  })
})

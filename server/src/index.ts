import { createRuntime } from './create-runtime.js'
import { createProductionShutdown } from './shutdown.js'

const { app, config, repository, manager, retention } = await createRuntime()
const shutdown = createProductionShutdown({
  closeApp: () => app.close(),
  stopBackground: () => retention.stop(),
  shutdownManager: () => manager.shutdown(),
  closeRepository: () => repository.close(),
})

process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  await shutdown()
  process.exitCode = 1
}

export function createProductionShutdown(dependencies: {
  closeApp: () => Promise<void>
  shutdownManager: () => Promise<void>
  closeRepository: () => void
  stopBackground?: () => void
}): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined

  return () => {
    shutdownPromise ??= (async () => {
      await dependencies.closeApp()
      dependencies.stopBackground?.()
      await dependencies.shutdownManager()
      dependencies.closeRepository()
    })()
    return shutdownPromise
  }
}

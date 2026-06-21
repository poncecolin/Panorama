import { resolve } from 'path'

/**
 * The `@`-prefixed import aliases used across the app and tests. Defined once here
 * and imported by every build/test config (electron.vite.config, vite.web.config,
 * vitest.config) so the four aliases can never drift between the app and the test
 * runner. Paths are resolved relative to the repo root (the cwd these configs run
 * from).
 */
export const aliases = {
  '@shared': resolve('src/shared'),
  '@core': resolve('src/core'),
  '@scenes': resolve('src/scenes'),
  '@renderer': resolve('src/renderer/src')
}

import { defineConfig } from 'vitest/config'
import { aliases } from './config/aliases'

export default defineConfig({
  resolve: { alias: aliases },
  test: { environment: 'node' }
})

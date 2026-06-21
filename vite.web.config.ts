import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { aliases } from './config/aliases'

/**
 * Browser-only preview of the renderer (no Electron). Useful for fast UI iteration
 * and screenshots. The app degrades gracefully without the preload bridge
 * (see useSettings: hasBridge=false → in-memory defaults).
 */
export default defineConfig({
  root: 'src/renderer',
  resolve: { alias: aliases },
  plugins: [react()],
  server: { port: 5180 },
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] }
})

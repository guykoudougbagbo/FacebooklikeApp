import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Sends /api, /media (uploaded files), /p/ (share-link previews) and /ws (live connections) to the backend. Keeps the browser's own address (changeOrigin: false):
 * the backend compares it with the form's Origin and refuses a mismatch.
 * Vite's string shorthand would turn changeOrigin on, so the object form is required.
 */
export function apiProxy(backendUrl) {
  const options = { target: backendUrl, changeOrigin: false }
  return { '/api': options, '/media': options, '/p/': options, '/ws': { ...options, ws: true } }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serving = command === 'serve' && !process.env.VITEST
  if (serving && !env.BACKEND_URL) {
    throw new Error('Missing required setting BACKEND_URL. Set it in Frontend/.env (see Frontend/.env.example).')
  }
  return {
    plugins: [react()],
    // The site and the API share one address, so login cookies stay first-party.
    server: serving ? { proxy: apiProxy(env.BACKEND_URL) } : undefined,
    test: {
      environment: 'jsdom',
    },
  }
})

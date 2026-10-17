import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'

// Logic shared with the phone app (Mobile/).
const SHARED = fileURLToPath(new URL('../Shared', import.meta.url))

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
    resolve: { alias: { '@shared': SHARED } },
    server: {
      // Shared/ sits outside this folder; the dev server and the tests must be allowed to read it.
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), SHARED] },
      // The site and the API share one address, so login cookies stay first-party.
      ...(serving ? { proxy: apiProxy(env.BACKEND_URL) } : {}),
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{js,jsx}', '../Shared/**/*.test.js'],
    },
  }
})

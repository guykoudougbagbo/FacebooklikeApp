import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

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
    server: serving ? { proxy: { '/api': env.BACKEND_URL } } : undefined,
    test: {
      environment: 'jsdom',
    },
  }
})

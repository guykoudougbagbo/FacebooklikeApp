import { expect, test } from 'vitest'
import { apiProxy } from './vite.config.js'

// Regression: the string shorthand rewrote the address and the backend refused every login.
test('the dev proxy keeps the browser address', () => {
  const options = { target: 'http://localhost:8000', changeOrigin: false }
  expect(apiProxy('http://localhost:8000')).toEqual({ '/api': options, '/media': options, '/p/': options })
})

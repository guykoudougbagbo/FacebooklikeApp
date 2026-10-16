import { cleanup, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { routes } from '../routes'

export const OWNER = { id: 1, email: 'owner@example.com', display_name: 'Awa', role: 'owner' }
export const ADMIN = { id: 2, email: 'admin@example.com', display_name: 'Koffi', role: 'admin' }

/**
 * Fakes the API. `handlers` maps "METHOD /path" (without /api) to a response
 * object { status, body } or a function (requestBody) => response.
 */
export function mockApi(handlers) {
  const calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    const path = new URL(url, 'http://test').pathname.replace(/^\/api/, '')
    const search = new URL(url, 'http://test').search
    const body = options.body instanceof FormData ? formToObject(options.body)
      : options.body ? JSON.parse(options.body) : undefined
    calls.push({ method, path, search, body, headers: options.headers })
    const handler = handlers[`${method} ${path}`]
    const result = typeof handler === 'function' ? handler(body) : handler
    const { status = 200, body: responseBody = null } = result ?? { status: 404, body: { detail: 'Introuvable.' } }
    return new Response(status === 204 ? null : JSON.stringify(responseBody), { status })
  }))
  return calls
}

/** Uploads as { field: [values] }, so tests can check exactly what was sent. */
function formToObject(form) {
  const result = {}
  for (const [key, value] of form.entries()) (result[key] ??= []).push(value)
  return result
}

export const loggedOut = {
  'GET /auth/me/': { status: 403, body: { detail: 'Non authentifié.' } },
  'GET /posts/': { body: { results: [], next: null, previous: null } },
}
export const loggedInAs = (user) => ({
  'GET /auth/me/': { body: user },
  'GET /admin/posts/': { body: { results: [], next: null, previous: null } },
})

export function renderApp(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}

export function page(results, next = null) {
  return { body: { results, next, previous: null } }
}

beforeEach(() => {
  document.cookie = 'csrftoken=test-token'
  // jsdom has no image previews; the composer only needs a URL string back.
  URL.createObjectURL = vi.fn((file) => `blob:${file.name}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

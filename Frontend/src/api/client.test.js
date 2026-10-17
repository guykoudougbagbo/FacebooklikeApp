import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api, nextPagePath } from './client'

function respond(status, body) {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
}

beforeEach(() => {
  document.cookie = 'csrftoken=abc'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api', () => {
  test('sends the CSRF token on changes but not on reads', async () => {
    const fetchMock = respond(200, {})
    vi.stubGlobal('fetch', fetchMock)
    await api('/x/')
    await api('/x/', { method: 'POST', body: { a: 1 } })
    expect(fetchMock.mock.calls[0][1].headers['X-CSRFToken']).toBeUndefined()
    expect(fetchMock.mock.calls[1][1].headers['X-CSRFToken']).toBe('abc')
    expect(fetchMock.mock.calls[1][1].body).toBe('{"a":1}')
  })

  test('fetches the CSRF cookie first when it is missing', async () => {
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    const fetchMock = respond(204)
    vi.stubGlobal('fetch', fetchMock)
    await api('/x/', { method: 'POST' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/csrf/')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/x/')
  })

  test('turns errors into French messages', async () => {
    vi.stubGlobal('fetch', respond(400, { detail: 'Code incorrect. Réessayez.' }))
    await expect(api('/x/')).rejects.toMatchObject({ status: 400, message: 'Code incorrect. Réessayez.' })
    vi.stubGlobal('fetch', respond(400, { email: ['Saisissez une adresse e-mail valide.'] }))
    await expect(api('/x/')).rejects.toThrow('Saisissez une adresse e-mail valide.')
    vi.stubGlobal('fetch', respond(429, { detail: 'Request was throttled.' }))
    await expect(api('/x/')).rejects.toThrow('Trop de tentatives')
    for (const status of [502, 503, 504]) {
      vi.stubGlobal('fetch', respond(status, undefined))
      await expect(api('/x/')).rejects.toThrow('Le serveur ne répond pas. Réessayez dans un instant.')
    }
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(api('/x/')).rejects.toMatchObject({ status: 0 })
  })
})

describe('nextPagePath', () => {
  test('keeps only the cursor from the next link', () => {
    expect(nextPagePath('/admin/admins/', 'http://other-host/api/admin/admins/?cursor=cD0x')).toBe('/admin/admins/?cursor=cD0x')
    expect(nextPagePath('/admin/admins/', null)).toBeNull()
  })
})

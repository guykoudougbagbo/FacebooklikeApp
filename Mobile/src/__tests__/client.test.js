import { api, mediaUrl } from '../api/client'
import * as deviceKey from '../api/deviceKey'

jest.mock('../api/deviceKey', () => {
  let stored = null
  return {
    load: jest.fn(async () => stored),
    save: jest.fn(async (value) => {
      stored = value
    }),
    forget: jest.fn(async () => {
      stored = null
    }),
  }
})

function answers(...list) {
  global.fetch = jest.fn()
  for (const [status, body] of list) {
    global.fetch.mockResolvedValueOnce({ status, ok: status < 400, json: async () => body })
  }
}

const sent = (i) => ({ url: global.fetch.mock.calls[i][0], ...global.fetch.mock.calls[i][1] })

beforeEach(async () => {
  await deviceKey.forget()
  jest.clearAllMocks()
})

test('reading needs no device key, so scrolling never creates one', async () => {
  answers([200, { results: [] }])
  await api('/posts/')
  expect(sent(0).url).toBe('https://api.test/api/posts/')
  expect(sent(0).headers['X-Device-Key']).toBeUndefined()
  expect(deviceKey.save).not.toHaveBeenCalled()
})

test('the first change gets a key once, keeps it, and sends it from then on', async () => {
  answers([201, { device_key: 'k1' }], [200, { reactions: {} }], [200, { results: [] }])
  await api('/posts/1/reaction/', { method: 'POST', body: { kind: 'like' } })
  await api('/posts/')
  expect(sent(0)).toMatchObject({ url: 'https://api.test/api/app/device/', method: 'POST' })
  expect(sent(1).headers['X-Device-Key']).toBe('k1')
  expect(sent(1).body).toBe('{"kind":"like"}')
  expect(sent(2).headers['X-Device-Key']).toBe('k1')
  expect(deviceKey.save).toHaveBeenCalledWith('k1')
})

test('two first changes at once ask for only one key', async () => {
  answers([201, { device_key: 'k1' }], [200, {}], [200, {}])
  await Promise.all([api('/a/', { method: 'POST' }), api('/b/', { method: 'POST' })])
  const registrations = global.fetch.mock.calls.filter(([url]) => url.endsWith('/app/device/'))
  expect(registrations).toHaveLength(1)
})

test('a key the server no longer knows is replaced once', async () => {
  await deviceKey.save('old')
  answers([401, { detail: 'Appareil inconnu.' }], [201, { device_key: 'new' }], [200, { ok: true }])
  await expect(api('/posts/1/share/', { method: 'POST' })).resolves.toEqual({ ok: true })
  expect(sent(0).headers['X-Device-Key']).toBe('old')
  expect(sent(2).headers['X-Device-Key']).toBe('new')
})

test('failures read in French', async () => {
  answers([429, { detail: 'Request was throttled.' }])
  await expect(api('/posts/')).rejects.toThrow('Trop de tentatives')
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed')
  })
  await expect(api('/posts/')).rejects.toMatchObject({ status: 0, message: 'Connexion impossible. Vérifiez votre réseau.' })
})

test('media paths get the server address', () => {
  expect(mediaUrl('/media/posts/a.webp')).toBe('https://api.test/media/posts/a.webp')
  expect(mediaUrl('https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp')
})

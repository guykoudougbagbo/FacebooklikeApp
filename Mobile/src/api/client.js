import { ApiError, errorMessage, NETWORK_ERROR } from '@shared/api'
import { API_URL } from '../config'
import * as deviceKey from './deviceKey'

let registering = null

async function request(path, { method = 'GET', body, key } = {}) {
  const headers = { Accept: 'application/json' }
  if (key) headers['X-Device-Key'] = key
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR, null)
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, data), data)
  return data
}

/** The phone's key, asked from the server the first time the visitor does something. */
async function keyForChanges() {
  const saved = await deviceKey.load()
  if (saved) return saved
  registering ??= request('/app/device/', { method: 'POST' })
    .then(async ({ device_key: key }) => {
      await deviceKey.save(key)
      return key
    })
    .finally(() => {
      registering = null
    })
  return registering
}

/**
 * Calls the API as this phone. Reading needs no key (so people who only scroll never create one);
 * the first reaction, comment, share or follow gets one.
 */
export async function api(path, options = {}) {
  const reading = (options.method ?? 'GET') === 'GET'
  const key = reading ? await deviceKey.load() : await keyForChanges()
  try {
    return await request(path, { ...options, key })
  } catch (err) {
    if (err.status !== 401 || !key) throw err
    // The server no longer knows this key (for example after its data was reset): start again with a new one.
    await deviceKey.forget()
    return request(path, { ...options, key: reading ? null : await keyForChanges() })
  }
}

/** Full address of a photo or video the server gives as a /media/... path. */
export function mediaUrl(path) {
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path}`
}

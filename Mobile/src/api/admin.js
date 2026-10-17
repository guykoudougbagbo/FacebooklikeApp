import { ApiError, errorMessage, NETWORK_ERROR } from '@shared/api'
import { API_URL } from '../config'
import * as adminKey from './adminKey'
import { mediaUrl } from './client'

let onLoginEnded = () => {}

/** Called when the server says this phone's admin login has ended (logged out elsewhere, removed, expired). */
export function whenLoginEnds(callback) {
  onLoginEnded = callback
}

/** Calls the API as the admin logged in on this phone (or, for the login steps, as nobody). */
export async function adminApi(path, { method = 'GET', body } = {}) {
  const key = await adminKey.load()
  const headers = { Accept: 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  const isForm = body instanceof FormData
  // The phone sets the multipart Content-Type (with its boundary) for FormData itself.
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined || isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR, null)
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && key) onLoginEnded()
    throw new ApiError(response.status, errorMessage(response.status, data), data)
  }
  return data
}

/** The live messages address, and the headers that log the connection in as this admin. */
export async function liveConnection() {
  const key = await adminKey.load()
  return {
    url: `${API_URL.replace(/^http/, 'ws')}/ws/messages/`,
    // The server only accepts live connections that name its own address as their origin.
    headers: { Authorization: `Bearer ${key}`, origin: API_URL },
  }
}

/** Full address of a photo or video in an admin answer (null while it's still being prepared). */
export function adminMediaUrl(path) {
  return path ? mediaUrl(path) : null
}


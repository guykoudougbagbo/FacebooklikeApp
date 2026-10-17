const GENERIC_ERROR = 'Une erreur est survenue. Réessayez.'
const TOO_MANY = 'Trop de tentatives. Patientez un moment avant de réessayer.'
const SERVER_DOWN = 'Le serveur ne répond pas. Réessayez dans un instant.'
// What a gateway or proxy answers when the server behind it is stopped or unreachable.
const SERVER_DOWN_STATUSES = new Set([502, 503, 504])

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

function readCookie(name) {
  const entry = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''
}

let csrfRequest = null

async function ensureCsrfCookie() {
  if (readCookie('csrftoken')) return
  csrfRequest ??= fetch('/api/auth/csrf/', { credentials: 'same-origin' }).finally(() => {
    csrfRequest = null
  })
  await csrfRequest
}

function errorMessage(status, data) {
  if (status === 429) return TOO_MANY
  if (SERVER_DOWN_STATUSES.has(status)) return SERVER_DOWN
  if (typeof data?.detail === 'string') return data.detail
  if (data && typeof data === 'object') {
    const first = Object.values(data).flat()[0]
    if (typeof first === 'string') return first
  }
  return GENERIC_ERROR
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' }
  if (method !== 'GET') {
    await ensureCsrfCookie()
    headers['X-CSRFToken'] = readCookie('csrftoken')
  }
  const isForm = body instanceof FormData
  // The browser sets the multipart Content-Type (with its boundary) for FormData itself.
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined || isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Connexion impossible. Vérifiez votre réseau.', null)
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, data), data)
  return data
}

/** Turns a list response's `next` link into a path for `api`, or null on the last page. */
export function nextPagePath(basePath, next) {
  if (!next) return null
  const cursor = new URL(next, window.location.origin).searchParams.get('cursor')
  return cursor ? `${basePath}?cursor=${encodeURIComponent(cursor)}` : null
}

import { ApiError, errorMessage, NETWORK_ERROR } from '@shared/api'

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
    throw new ApiError(0, NETWORK_ERROR, null)
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, data), data)
  return data
}

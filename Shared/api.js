// How both apps report failed requests (in French) and follow paginated lists.

export const GENERIC_ERROR = 'Une erreur est survenue. Réessayez.'
export const NETWORK_ERROR = 'Connexion impossible. Vérifiez votre réseau.'
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

export function errorMessage(status, data) {
  if (status === 429) return TOO_MANY
  if (SERVER_DOWN_STATUSES.has(status)) return SERVER_DOWN
  if (typeof data?.detail === 'string') return data.detail
  if (data && typeof data === 'object') {
    const first = Object.values(data).flat()[0]
    if (typeof first === 'string') return first
  }
  return GENERIC_ERROR
}

const CURSOR = /[?&]cursor=([^&#]+)/

/** Turns a list response's `next` link into a path for the API client, or null on the last page. */
export function nextPagePath(basePath, next) {
  const cursor = next && CURSOR.exec(next)?.[1]
  return cursor ? `${basePath}?cursor=${encodeURIComponent(decodeURIComponent(cursor))}` : null
}

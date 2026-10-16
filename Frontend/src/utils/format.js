const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

export function formatDateTime(value) {
  return dateTime.format(new Date(value))
}

export function formatDate(value) {
  return dateOnly.format(new Date(value))
}

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

/** "à l'instant", "il y a 5 minutes", "hier", then a plain date after a week. */
export function formatRelative(value, now = Date.now()) {
  const seconds = Math.round((now - new Date(value).getTime()) / 1000)
  if (seconds < 60) return "à l'instant"
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour')
  if (seconds < 7 * 86400) return relative.format(-Math.floor(seconds / 86400), 'day')
  return formatDate(value)
}

export const ROLE_LABELS = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
}

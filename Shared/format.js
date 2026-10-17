// Dates, durations and counts in French, written out by hand: the phone app's JavaScript engine
// doesn't have every Intl formatter the browser has, and both apps must read the same.

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const pad = (n) => String(n).padStart(2, '0')

/** "1 janvier 2026" */
export function formatDate(value) {
  const date = new Date(value)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "1 janvier 2026 à 09:05" */
export function formatDateTime(value) {
  const date = new Date(value)
  return `${formatDate(date)} à ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "à l'instant", "il y a 5 minutes", "hier", then a plain date after a week. */
export function formatRelative(value, now = Date.now()) {
  const seconds = Math.round((now - new Date(value).getTime()) / 1000)
  if (seconds < 60) return "à l'instant"
  if (seconds < 3600) return `il y a ${plural(Math.floor(seconds / 60), 'minute', 'minutes')}`
  if (seconds < 86400) return `il y a ${plural(Math.floor(seconds / 3600), 'heure', 'heures')}`
  const days = Math.floor(seconds / 86400)
  if (days === 1) return 'hier'
  if (days === 2) return 'avant-hier'
  if (days < 7) return `il y a ${days} jours`
  return formatDate(value)
}

/** 42 -> "0:42", 125 -> "2:05" */
export function formatDuration(seconds) {
  const total = Math.round(seconds ?? 0)
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}

export function plural(count, one, many) {
  return `${count} ${count > 1 ? many : one}`
}

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

export function formatDateTime(value) {
  return dateTime.format(new Date(value))
}

export function formatDate(value) {
  return dateOnly.format(new Date(value))
}

export const ROLE_LABELS = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
}

// Words for the admin team: roles, invite links and the activity log.

export const ROLE_LABELS = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
}

/** The link a new admin opens on the website. The token goes after "#" so it never reaches server logs. */
export function inviteUrl(siteUrl, token) {
  return `${siteUrl}/invitation#${token}`
}

const ACTIVITY = {
  invite_created: (e) => `${e.actor} a créé un lien d'invitation.`,
  invite_revoked: (e) => `${e.actor} a annulé un lien d'invitation.`,
  admin_joined: (e) => `${e.actor} a rejoint l'équipe des administrateurs.`,
  admin_removed: (e) => `${e.actor} a retiré ${e.target} des administrateurs.`,
  two_factor_reset: (e) => `${e.actor} a réinitialisé la double authentification de ${e.target}.`,
  admin_reinvited: (e) => `${e.actor} a réinvité ${e.target}.`,
  admin_rejoined: (e) => `${e.actor} a rejoint à nouveau l'équipe des administrateurs.`,
}

/** One line of the activity log, in French. */
export function describeActivity(entry) {
  return ACTIVITY[entry.action]?.(entry) ?? `${entry.actor} a effectué une action.`
}

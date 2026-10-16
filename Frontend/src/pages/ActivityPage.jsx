import { Button, Card, ErrorMessage, Loading } from '../components/ui'
import { formatDateTime } from '../utils/format'
import { usePagedList } from '../utils/usePagedList'

const SENTENCES = {
  invite_created: (e) => `${e.actor} a créé un lien d'invitation.`,
  invite_revoked: (e) => `${e.actor} a annulé un lien d'invitation.`,
  admin_joined: (e) => `${e.actor} a rejoint l'équipe des administrateurs.`,
  admin_removed: (e) => `${e.actor} a retiré ${e.target} des administrateurs.`,
  two_factor_reset: (e) => `${e.actor} a réinitialisé la double authentification de ${e.target}.`,
}

function describe(entry) {
  return SENTENCES[entry.action]?.(entry) ?? `${entry.actor} a effectué une action.`
}

export default function ActivityPage() {
  const activity = usePagedList('/admin/activity/')

  return (
    <Card title="Activité des administrateurs">
      <ErrorMessage>{activity.error}</ErrorMessage>
      {activity.items === null ? <Loading /> : activity.items.length === 0 ? (
        <p>Aucune activité pour le moment.</p>
      ) : (
        <ul className="list">
          {activity.items.map((entry) => (
            <li key={entry.id} className="list__row">
              <span>{describe(entry)}</span>
              <time className="list__meta" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
            </li>
          ))}
        </ul>
      )}
      {activity.hasMore && <Button variant="secondary" busy={activity.loadingMore} onClick={activity.loadMore}>Voir plus</Button>}
    </Card>
  )
}

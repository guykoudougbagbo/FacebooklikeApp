import { Button, Card, ErrorMessage, Loading } from '../components/ui'
import { formatDateTime } from '@shared/format'
import { describeActivity } from '@shared/team'
import { usePagedList } from '../utils/usePagedList'

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
              <span>{describeActivity(entry)}</span>
              <time className="list__meta" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
            </li>
          ))}
        </ul>
      )}
      {activity.hasMore && <Button variant="secondary" busy={activity.loadingMore} onClick={activity.loadMore}>Voir plus</Button>}
    </Card>
  )
}

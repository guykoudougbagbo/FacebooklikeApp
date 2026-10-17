import { useCallback, useState } from 'react'
import { NavLink, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorMessage, Loading } from '../components/ui'
import { useMessagingEvents } from '../messaging/MessagingContext'
import NewConversation from '../messaging/NewConversation'
import { preview } from '../messaging/text'
import Thread from '../messaging/Thread'
import { formatRelative } from '../utils/format'
import { usePagedList } from '../utils/usePagedList'
import '../messaging/Messaging.css'

export default function MessagesPage() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const [changes, setChanges] = useState(0)
  const [creating, setCreating] = useState(false)
  const list = usePagedList('/messages/conversations/', changes)

  // Any live change can reorder the list or change a preview; it's short, so reload it.
  useMessagingEvents(useCallback(() => setChanges((c) => c + 1), []))

  return (
    <div className={conversationId ? 'messages messages--open' : 'messages'}>
      <aside className="messages__list" aria-label="Conversations">
        <div className="messages__list-header">
          <h1>Messages</h1>
          <Button onClick={() => setCreating((v) => !v)} aria-expanded={creating}>Nouveau</Button>
        </div>
        {creating && <NewConversation onDone={() => { setCreating(false); setChanges((c) => c + 1) }} />}
        <ErrorMessage>{list.error}</ErrorMessage>
        {list.items === null ? <Loading /> : list.items.length === 0 ? (
          <p className="messages__empty">Aucune conversation. Commencez-en une avec « Nouveau ».</p>
        ) : (
          <ul>
            {list.items.map((c) => (
              <li key={c.id}>
                <NavLink to={`/admin/messages/${c.id}`} className={c.unread ? 'conversation conversation--unread' : 'conversation'}>
                  <span className="conversation__title">
                    {c.title}
                    {c.unread && <span className="conversation__dot" aria-label="Non lu" />}
                  </span>
                  <span className="conversation__preview">{preview(c.last_message, c, user.id)}</span>
                  {c.last_message && <span className="conversation__time">{formatRelative(c.last_message.created_at)}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
        {list.hasMore && <Button variant="secondary" busy={list.loadingMore} onClick={list.loadMore}>Voir plus</Button>}
      </aside>
      <div className="messages__thread">
        {conversationId
          ? <Thread key={conversationId} conversationId={conversationId} />
          : <p className="messages__empty">Choisissez une conversation.</p>}
      </div>
    </div>
  )
}

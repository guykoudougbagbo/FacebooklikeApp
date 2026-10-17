import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorMessage, Loading } from '../components/ui'
import { formatDateTime, formatRelative } from '@shared/format'
import { usePagedList } from '../utils/usePagedList'
import GroupSettings from './GroupSettings'
import { useMessagingEvents } from './MessagingContext'
import { describeEvent, seenLabel } from '@shared/messages'

function Composer({ conversationId, onSent }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(event) {
    event?.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      onSent(await api(`/messages/conversations/${conversationId}/messages/`, { method: 'POST', body: { body } }))
      setBody('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form className="thread__composer" onSubmit={send}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor={`composer-${conversationId}`} className="visually-hidden">Votre message</label>
      <textarea
        id={`composer-${conversationId}`}
        rows={1}
        placeholder="Écrire un message…"
        value={body}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift + Enter makes a new line.
          if (e.key === 'Enter' && !e.shiftKey) send(e)
        }}
      />
      <Button type="submit" busy={busy} disabled={!body.trim()}>Envoyer</Button>
    </form>
  )
}

/** One open conversation: its messages, live updates, "Vu", and the box to write. */
export default function Thread({ conversationId }) {
  const { user } = useAuth()
  const [conversation, setConversation] = useState(null)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const messages = usePagedList(`/messages/conversations/${conversationId}/messages/`)
  const { prependItem, replaceItem } = messages
  const lastMarked = useRef(0)

  const loadConversation = useCallback(() => {
    api(`/messages/conversations/${conversationId}/`).then(setConversation, (err) => setError(err.message))
  }, [conversationId])

  useEffect(() => {
    loadConversation()
  }, [loadConversation])

  // Newest message first in the list; shown oldest first, like Messenger.
  const ordered = [...(messages.items ?? [])].sort((a, b) => a.id - b.id)
  const newestId = ordered.at(-1)?.id ?? 0

  useEffect(() => {
    if (!newestId || newestId <= lastMarked.current || document.visibilityState === 'hidden') return
    lastMarked.current = newestId
    api(`/messages/conversations/${conversationId}/read/`, { method: 'POST', body: { message_id: newestId } }).catch(() => {})
  }, [conversationId, newestId])

  const bottom = useRef(null)
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' })
  }, [newestId])

  const addMessage = useCallback((message) => {
    if (!(messages.items ?? []).some((m) => m.id === message.id)) prependItem(message)
  }, [messages.items, prependItem])

  useMessagingEvents(useCallback((event) => {
    if (event.conversation !== Number(conversationId)) return
    if (event.type === 'message') {
      addMessage(event.message)
      if (event.message.kind === 'event') loadConversation()
    } else if (event.type === 'message_deleted') {
      const current = (messages.items ?? []).find((m) => m.id === event.message_id)
      if (current) replaceItem({ ...current, deleted: true, body: '' })
    } else if (event.type === 'read') {
      setConversation((c) => c && { ...c, read_state: { ...c.read_state, [event.user_id]: event.message_id } })
    } else if (event.type === 'removed') {
      setError('Vous ne faites plus partie de cette conversation.')
    }
  }, [conversationId, addMessage, loadConversation, messages.items, replaceItem]))

  async function remove(message) {
    if (!window.confirm('Supprimer ce message ?')) return
    try {
      await api(`/messages/messages/${message.id}/`, { method: 'DELETE' })
      replaceItem({ ...message, deleted: true, body: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) {
    return (
      <div className="thread">
        <ErrorMessage>{error}</ErrorMessage>
        <Link to="/admin/messages">Retour aux conversations</Link>
      </div>
    )
  }
  if (!conversation || messages.items === null) return <div className="thread"><Loading /></div>

  const myLastId = [...ordered].reverse().find((m) => m.kind === 'text' && m.sender?.id === user.id && !m.deleted)?.id
  const seen = myLastId ? seenLabel(conversation, myLastId, user.id) : null

  return (
    <section className="thread" aria-label={`Conversation : ${conversation.title}`}>
      <header className="thread__header">
        <Link to="/admin/messages" className="thread__back">‹ Conversations</Link>
        <h2>{conversation.title}</h2>
        {conversation.kind === 'group' && (
          <Button variant="secondary" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
            Membres
          </Button>
        )}
      </header>
      {showSettings && <GroupSettings conversation={conversation} onChanged={loadConversation} />}
      <div className="thread__messages">
        {messages.hasMore && (
          <Button variant="secondary" busy={messages.loadingMore} onClick={messages.loadMore}>Voir les messages précédents</Button>
        )}
        <ol className="thread__list">
          {ordered.map((message) => {
            if (message.kind === 'event') {
              const text = describeEvent(message, conversation)
              return text && <li key={message.id} className="thread__event">{text}</li>
            }
            const mine = message.sender?.id === user.id
            return (
              <li key={message.id} className={mine ? 'bubble bubble--mine' : 'bubble'}>
                {!mine && conversation.kind === 'group' && <span className="bubble__name">{message.sender?.name}</span>}
                <p className={message.deleted ? 'bubble__text bubble__text--deleted' : 'bubble__text'}>
                  {message.deleted ? 'Message supprimé' : message.body}
                </p>
                <span className="bubble__meta">
                  <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>{formatRelative(message.created_at)}</time>
                  {mine && !message.deleted && (
                    <button type="button" className="bubble__delete" onClick={() => remove(message)}>Supprimer</button>
                  )}
                </span>
                {message.id === myLastId && seen && <span className="bubble__seen">{seen}</span>}
              </li>
            )
          })}
        </ol>
        <div ref={bottom} />
      </div>
      <Composer conversationId={conversationId} onSent={addMessage} />
    </section>
  )
}

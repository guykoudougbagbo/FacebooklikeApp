import { useId, useState } from 'react'
import { api } from '../api/client'
import { formatDateTime, formatRelative } from '../utils/format'
import { usePagedList } from '../utils/usePagedList'
import PostText from './PostText'
import { Button, ErrorMessage, Notice } from './ui'
import './Interactions.css'

const NAME_KEY = 'commentName'

function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Private windows can block storage; the name just won't be prefilled next time.
  }
}

function VisitorForm({ postId, onAdded }) {
  const [name, setName] = useState(rememberedName)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nameId = useId()
  const bodyId = useId()
  const trapId = useId()

  async function submit(event) {
    event.preventDefault()
    const website = new FormData(event.currentTarget).get('website')
    setBusy(true)
    setError('')
    try {
      const comment = await api(`/posts/${postId}/comments/`, { method: 'POST', body: { name, body, website } })
      rememberName(name)
      setBody('')
      onAdded(comment)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form className="comments__form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor={nameId} className="visually-hidden">Votre nom</label>
      <input id={nameId} className="comments__name" placeholder="Votre nom" value={name} maxLength={40}
        onChange={(e) => setName(e.target.value)} required autoComplete="nickname" />
      <label htmlFor={bodyId} className="visually-hidden">Votre commentaire</label>
      <textarea id={bodyId} className="comments__text" placeholder="Écrivez un commentaire…" value={body}
        maxLength={1000} rows={2} onChange={(e) => setBody(e.target.value)} required />
      <div className="comments__trap" aria-hidden="true">
        <label htmlFor={trapId}>Site web</label>
        <input id={trapId} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" busy={busy}>Publier le commentaire</Button>
    </form>
  )
}

function PageReplyForm({ postId, onAdded }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyId = useId()

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onAdded(await api(`/admin/posts/${postId}/comments/`, { method: 'POST', body: { body } }))
      setBody('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form className="comments__form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor={bodyId} className="visually-hidden">Répondre en tant que GenZ</label>
      <textarea id={bodyId} className="comments__text" placeholder="Répondre en tant que GenZ…" value={body}
        maxLength={1000} rows={2} onChange={(e) => setBody(e.target.value)} required />
      <Button type="submit" busy={busy}>Répondre en tant que GenZ</Button>
    </form>
  )
}

export default function Comments({ post, admin, onCountChange, onSettingChange }) {
  const comments = usePagedList(`/posts/${post.id}/comments/`)
  const [error, setError] = useState('')

  function added(comment) {
    comments.prependItem(comment)
    onCountChange(1)
  }

  async function remove(id) {
    if (!window.confirm('Supprimer ce commentaire ?')) return
    try {
      await api(`/admin/comments/${id}/`, { method: 'DELETE' })
      comments.removeItem(id)
      onCountChange(-1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggle() {
    try {
      const { comments_enabled: enabled } = await api(`/admin/posts/${post.id}/comments-enabled/`, {
        method: 'PATCH', body: { enabled: !post.comments_enabled },
      })
      onSettingChange(enabled)
    } catch (err) {
      setError(err.message)
    }
  }

  // Comments read oldest first, like Facebook.
  const ordered = [...(comments.items ?? [])].sort((a, b) => a.id - b.id)

  return (
    <section className="comments" aria-label="Commentaires">
      <ErrorMessage>{error || comments.error}</ErrorMessage>
      {admin && (
        <Button variant="secondary" onClick={toggle}>
          {post.comments_enabled ? 'Désactiver les commentaires' : 'Réactiver les commentaires'}
        </Button>
      )}
      <ul className="comments__list">
        {ordered.map((comment) => (
          <li key={comment.id} className={comment.is_page ? 'comment comment--page' : 'comment'}>
            <div className="comment__bubble">
              <strong>{comment.name}</strong>
              {comment.is_page && <span className="comment__badge">Page</span>}
              <PostText text={comment.body} plain />
            </div>
            <div className="comment__meta">
              <time dateTime={comment.created_at} title={formatDateTime(comment.created_at)}>
                {formatRelative(comment.created_at)}
              </time>
              {admin && (
                <button type="button" className="comment__delete" onClick={() => remove(comment.id)}>Supprimer</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {comments.hasMore && (
        <button type="button" className="comments__more" onClick={comments.loadMore}>Voir plus de commentaires</button>
      )}
      {!post.comments_enabled && <Notice>Les commentaires sont désactivés pour cette publication.</Notice>}
      {admin && <PageReplyForm postId={post.id} onAdded={added} />}
      {!admin && post.comments_enabled && <VisitorForm postId={post.id} onAdded={added} />}
    </section>
  )
}

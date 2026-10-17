import { useState } from 'react'
import { api } from '../api/client'
import logo from '../assets/brand/genz-logo.jpg'
import { formatDateTime, formatRelative } from '@shared/format'
import { readyItems } from '@shared/media'
import InteractionBar from './InteractionBar'
import MediaGrid from './MediaGrid'
import PostComposer from './PostComposer'
import PostText from './PostText'
import { Button, ErrorMessage, Notice } from './ui'
import './Post.css'

function AdminStatus({ post }) {
  const pending = post.media.filter((m) => m.status === 'pending').length
  const failed = post.media.filter((m) => m.status === 'failed').length
  return (
    <>
      {post.status === 'processing' && <Notice>Publication en cours… Les photos et vidéos sont en préparation.</Notice>}
      {post.status === 'failed' && (
        <p className="message message--error">Échec de la publication : aucune photo ni vidéo n'a pu être traitée. Supprimez-la et réessayez.</p>
      )}
      {post.status === 'published' && pending > 0 && <Notice>Nouvelles photos ou vidéos en préparation…</Notice>}
      {failed > 0 && post.status !== 'failed' && (
        <Notice>{failed === 1 ? "1 photo ou vidéo n'a pas pu être traitée." : `${failed} photos ou vidéos n'ont pas pu être traitées.`}</Notice>
      )}
    </>
  )
}

export default function PostCard({ post, admin = false, onChanged, onDeleted, commentsOpen = false }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const when = post.published_at ?? post.created_at

  async function remove() {
    if (!window.confirm('Supprimer cette publication ? Cette action est définitive.')) return
    setError('')
    try {
      await api(`/admin/posts/${post.id}/`, { method: 'DELETE' })
      onDeleted(post.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <article className="post" aria-label="Publication de GenZ">
      <header className="post__header">
        <img src={logo} alt="" className="post__avatar" />
        <div>
          <strong className="post__author">GenZ</strong>
          <div className="post__meta">
            <time dateTime={when} title={formatDateTime(when)}>{formatRelative(when)}</time>
            {post.edited_at && ' · modifiée'}
          </div>
        </div>
        {admin && (post.can_edit || post.can_delete) && !editing && (
          <div className="post__actions">
            {post.can_edit && <Button variant="secondary" onClick={() => setEditing(true)}>Modifier</Button>}
            {post.can_delete && <Button variant="danger" onClick={remove}>Supprimer</Button>}
          </div>
        )}
      </header>
      {admin && <p className="post__by">Publié par {post.author}</p>}
      {admin && <AdminStatus post={post} />}
      <ErrorMessage>{error}</ErrorMessage>
      {editing ? (
        <PostComposer
          post={post}
          onSaved={(saved) => { setEditing(false); onChanged(saved) }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <PostText text={post.body} />
          <MediaGrid items={readyItems(post.media)} />
          {/* Visitors only ever receive published posts, which carry no status. */}
          {(post.status ?? 'published') === 'published' && (
            <InteractionBar key={post.id} post={post} admin={admin} startOpen={commentsOpen} />
          )}
        </>
      )}
    </article>
  )
}

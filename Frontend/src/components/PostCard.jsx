import { useState } from 'react'
import { api } from '../api/client'
import logo from '../assets/brand/genz-logo.jpg'
import { formatDateTime, formatRelative } from '../utils/format'
import PhotoGrid from './PhotoGrid'
import PostComposer from './PostComposer'
import PostText from './PostText'
import { Button, ErrorMessage, Notice } from './ui'
import './Post.css'

function AdminStatus({ post }) {
  const pending = post.photos.filter((p) => p.status === 'pending').length
  const failed = post.photos.filter((p) => p.status === 'failed').length
  return (
    <>
      {post.status === 'processing' && <Notice>Publication en cours… Les photos sont en préparation.</Notice>}
      {post.status === 'failed' && (
        <p className="message message--error">Échec de la publication : aucune photo n'a pu être traitée. Supprimez-la et réessayez.</p>
      )}
      {post.status === 'published' && pending > 0 && <Notice>Nouvelles photos en préparation…</Notice>}
      {failed > 0 && post.status !== 'failed' && (
        <Notice>{failed === 1 ? "1 photo n'a pas pu être traitée." : `${failed} photos n'ont pas pu être traitées.`}</Notice>
      )}
    </>
  )
}

export default function PostCard({ post, admin = false, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const readyPhotos = post.photos.filter((p) => p.feed_url && (p.status ?? 'ready') === 'ready')
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
          <PhotoGrid photos={readyPhotos} />
        </>
      )}
    </article>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'
import { Button, ErrorMessage } from './ui'
import './Post.css'

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

/** Writes a new post, or edits `post` when given. */
export default function PostComposer({ post = null, onSaved, onCancel }) {
  const [body, setBody] = useState(post?.body ?? '')
  const [newPhotos, setNewPhotos] = useState([])
  const [removeIds, setRemoveIds] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const textId = useId()
  const latestPhotos = useRef(newPhotos)

  useEffect(() => {
    latestPhotos.current = newPhotos
  }, [newPhotos])

  // Frees the preview images' memory when the box closes.
  useEffect(() => () => latestPhotos.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  function addFiles(event) {
    const added = [...event.target.files].map((file) => ({ file, preview: URL.createObjectURL(file) }))
    setNewPhotos((current) => [...current, ...added])
    event.target.value = ''
  }

  function dropNew(index) {
    setNewPhotos((current) => {
      URL.revokeObjectURL(current[index].preview)
      return current.filter((_, i) => i !== index)
    })
  }

  function toggleRemove(id) {
    setRemoveIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(event) {
    event.preventDefault()
    const form = new FormData()
    form.append('body', body)
    newPhotos.forEach(({ file }) => form.append('photos', file))
    removeIds.forEach((id) => form.append('remove_photo_ids', id))
    setBusy(true)
    setError('')
    try {
      const saved = post
        ? await api(`/admin/posts/${post.id}/`, { method: 'PATCH', body: form })
        : await api('/admin/posts/', { method: 'POST', body: form })
      newPhotos.forEach((p) => URL.revokeObjectURL(p.preview))
      if (!post) {
        setBody('')
        setNewPhotos([])
      }
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form className="composer" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor={textId} className="visually-hidden">Texte de la publication</label>
      <textarea
        id={textId}
        className="composer__text"
        placeholder="Quoi de neuf ?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={post ? 4 : 3}
      />
      {post?.photos.length > 0 && (
        <ul className="composer__photos" aria-label="Photos de la publication">
          {post.photos.map((photo, i) => (
            <li key={photo.id} className={removeIds.has(photo.id) ? 'composer__photo composer__photo--removed' : 'composer__photo'}>
              {photo.feed_url ? <img src={photo.feed_url} alt="" /> : <span className="composer__placeholder">En préparation</span>}
              <button type="button" className="composer__toggle" onClick={() => toggleRemove(photo.id)}>
                {removeIds.has(photo.id) ? 'Garder' : `Retirer la photo ${i + 1}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {newPhotos.length > 0 && (
        <ul className="composer__photos" aria-label="Photos à ajouter">
          {newPhotos.map((photo, i) => (
            <li key={photo.preview} className="composer__photo">
              <img src={photo.preview} alt="" />
              <button type="button" className="composer__toggle" onClick={() => dropNew(i)}>
                {`Enlever ${photo.file.name}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer__actions">
        <input ref={fileInput} type="file" accept={ACCEPTED} multiple hidden onChange={addFiles} data-testid="photo-input" />
        <Button type="button" variant="secondary" onClick={() => fileInput.current.click()}>Ajouter des photos</Button>
        <span className="composer__spacer" />
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>}
        <Button type="submit" busy={busy}>{post ? 'Enregistrer' : 'Publier'}</Button>
      </div>
    </form>
  )
}

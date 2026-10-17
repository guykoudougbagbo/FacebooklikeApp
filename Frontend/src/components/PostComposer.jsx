import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'
import { Button, ErrorMessage } from './ui'
import './Post.css'

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm'
const ACCEPTED_MUSIC = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/aac'

function newItem(file) {
  const kind = file.type.startsWith('video/') ? 'video' : 'photo'
  return { file, kind, preview: URL.createObjectURL(file), original: 100, music: null, musicVolume: 100 }
}

function SoundControls({ item, number, onChange }) {
  const musicInput = useRef(null)
  return (
    <div className="composer__sound">
      <label>
        Son d'origine : {item.original} %
        <input
          type="range" min="0" max="100" step="5" value={item.original}
          aria-label={`Son d'origine de la vidéo ${number}`}
          onChange={(e) => onChange({ original: Number(e.target.value) })}
        />
      </label>
      <input
        ref={musicInput} type="file" accept={ACCEPTED_MUSIC} hidden data-testid={`music-input-${number}`}
        onChange={(e) => { if (e.target.files[0]) onChange({ music: e.target.files[0] }); e.target.value = '' }}
      />
      {item.music ? (
        <>
          <span>Musique : {item.music.name}</span>
          <label>
            Volume de la musique : {item.musicVolume} %
            <input
              type="range" min="0" max="100" step="5" value={item.musicVolume}
              aria-label={`Musique de la vidéo ${number}`}
              onChange={(e) => onChange({ musicVolume: Number(e.target.value) })}
            />
          </label>
          <button type="button" className="composer__toggle" onClick={() => onChange({ music: null })}>
            Retirer la musique
          </button>
        </>
      ) : (
        <button type="button" className="composer__toggle composer__toggle--add" onClick={() => musicInput.current.click()}>
          {`Choisir une musique pour la vidéo ${number}`}
        </button>
      )}
    </div>
  )
}

/** Writes a new post, or edits `post` when given. */
export default function PostComposer({ post = null, onSaved, onCancel }) {
  const [body, setBody] = useState(post?.body ?? '')
  const [newItems, setNewItems] = useState([])
  const [removeIds, setRemoveIds] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const textId = useId()
  const latestItems = useRef(newItems)

  useEffect(() => {
    latestItems.current = newItems
  }, [newItems])

  // Frees the preview files' memory when the box closes.
  useEffect(() => () => latestItems.current.forEach((item) => URL.revokeObjectURL(item.preview)), [])

  function addFiles(event) {
    const added = [...event.target.files].map(newItem)
    setNewItems((current) => [...current, ...added])
    event.target.value = ''
  }

  function dropNew(index) {
    setNewItems((current) => {
      URL.revokeObjectURL(current[index].preview)
      return current.filter((_, i) => i !== index)
    })
  }

  function updateNew(index, changes) {
    setNewItems((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)))
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
    newItems.forEach((item, i) => {
      form.append('media', item.file)
      if (item.kind !== 'video') return
      form.append(`sound_original_${i}`, String(item.original))
      if (item.music) {
        form.append(`music_${i}`, item.music)
        form.append(`sound_music_${i}`, String(item.musicVolume))
      }
    })
    removeIds.forEach((id) => form.append('remove_media_ids', id))
    setBusy(true)
    setError('')
    try {
      const saved = post
        ? await api(`/admin/posts/${post.id}/`, { method: 'PATCH', body: form })
        : await api('/admin/posts/', { method: 'POST', body: form })
      newItems.forEach((item) => URL.revokeObjectURL(item.preview))
      if (!post) {
        setBody('')
        setNewItems([])
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
      {post?.media.length > 0 && (
        <ul className="composer__photos" aria-label="Photos et vidéos de la publication">
          {post.media.map((item, i) => {
            const thumbnail = item.kind === 'video' ? item.poster_url : item.feed_url
            return (
              <li key={item.id} className={removeIds.has(item.id) ? 'composer__photo composer__photo--removed' : 'composer__photo'}>
                {thumbnail ? <img src={thumbnail} alt="" /> : <span className="composer__placeholder">En préparation</span>}
                <button type="button" className="composer__toggle" onClick={() => toggleRemove(item.id)}>
                  {removeIds.has(item.id) ? 'Garder' : `Retirer l'élément ${i + 1}`}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {newItems.length > 0 && (
        <ul className="composer__photos" aria-label="Photos et vidéos à ajouter">
          {newItems.map((item, i) => {
            const videoNumber = newItems.slice(0, i + 1).filter((other) => other.kind === 'video').length
            return (
              <li key={item.preview} className="composer__photo">
                {item.kind === 'video'
                  ? <video src={item.preview} muted playsInline preload="metadata" />
                  : <img src={item.preview} alt="" />}
                {item.kind === 'video' && (
                  <SoundControls item={item} number={videoNumber} onChange={(changes) => updateNew(i, changes)} />
                )}
                <button type="button" className="composer__toggle" onClick={() => dropNew(i)}>
                  {`Enlever ${item.file.name}`}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="composer__actions">
        <input ref={fileInput} type="file" accept={ACCEPTED} multiple hidden onChange={addFiles} data-testid="media-input" />
        <Button type="button" variant="secondary" onClick={() => fileInput.current.click()}>Ajouter des photos ou vidéos</Button>
        <span className="composer__spacer" />
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>}
        <Button type="submit" busy={busy}>{post ? 'Enregistrer' : 'Publier'}</Button>
      </div>
    </form>
  )
}

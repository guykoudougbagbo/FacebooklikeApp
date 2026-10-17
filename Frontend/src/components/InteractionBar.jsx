import { useRef, useState } from 'react'
import { api } from '../api/client'
import { plural, REACTION_BY_KIND, REACTIONS, topReactions } from '../utils/reactions'
import Comments from './Comments'
import { ErrorMessage } from './ui'
import './Interactions.css'

const LONG_PRESS_MS = 450

export default function InteractionBar({ post, admin = false, startOpen = false }) {
  const [summary, setSummary] = useState(post.interactions)
  const [commentsEnabled, setCommentsEnabled] = useState(post.comments_enabled)
  const [showComments, setShowComments] = useState(startOpen)
  const [picking, setPicking] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const pressTimer = useRef(null)
  const longPressed = useRef(false)

  const { top, total } = topReactions(summary.reactions)
  const mine = summary.my_reaction ? REACTION_BY_KIND[summary.my_reaction] : null

  async function react(kind) {
    setPicking(false)
    setError('')
    try {
      const removing = kind === summary.my_reaction
      setSummary(await api(`/posts/${post.id}/reaction/`, removing ? { method: 'DELETE' } : { method: 'POST', body: { kind } }))
    } catch (err) {
      setError(err.message)
    }
  }

  function pressStart() {
    longPressed.current = false
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      setPicking(true)
    }, LONG_PRESS_MS)
  }

  function pressEnd() {
    clearTimeout(pressTimer.current)
  }

  function mainClick() {
    if (longPressed.current) return
    react(summary.my_reaction ?? 'like')
  }

  async function share() {
    setError('')
    setNotice('')
    const url = `${window.location.origin}/p/${post.id}/`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'GenZ', url })
      } else {
        await navigator.clipboard.writeText(url)
        setNotice('Lien copié.')
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError('Impossible de partager pour le moment.')
      return
    }
    try {
      setSummary(await api(`/posts/${post.id}/share/`, { method: 'POST' }))
    } catch {
      // The link was shared; only the counter failed to update.
    }
  }

  return (
    <div className="interactions">
      {(total > 0 || summary.comments > 0 || summary.shares > 0) && (
        <div className="interactions__summary">
          {total > 0 && (
            <span aria-label={`${plural(total, 'réaction', 'réactions')}`}>
              <span aria-hidden="true">{top.map((r) => r.emoji).join('')}</span> {total}
            </span>
          )}
          <span className="interactions__spacer" />
          {summary.comments > 0 && (
            <button type="button" className="interactions__link" onClick={() => setShowComments((v) => !v)}>
              {plural(summary.comments, 'commentaire', 'commentaires')}
            </button>
          )}
          {summary.shares > 0 && <span>{plural(summary.shares, 'partage', 'partages')}</span>}
        </div>
      )}
      <div className="interactions__actions">
        <div className="interactions__react" onMouseLeave={() => setPicking(false)}>
          {picking && (
            <div className="interactions__picker" role="group" aria-label="Réactions">
              {REACTIONS.map((r) => (
                <button key={r.kind} type="button" aria-label={r.label} title={r.label}
                  aria-pressed={summary.my_reaction === r.kind} onClick={() => react(r.kind)}>
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={mine ? 'interactions__button interactions__button--active' : 'interactions__button'}
            aria-pressed={Boolean(mine)}
            onClick={mainClick}
            onPointerDown={pressStart}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onMouseEnter={() => setPicking(true)}
          >
            <span aria-hidden="true">{mine?.emoji ?? '👍'}</span> {mine?.label ?? "J'aime"}
          </button>
          <button type="button" className="interactions__more" aria-label="Choisir une réaction"
            aria-expanded={picking} onClick={() => setPicking((v) => !v)}>▾</button>
        </div>
        <button type="button" className="interactions__button" aria-expanded={showComments}
          onClick={() => setShowComments((v) => !v)}>
          <span aria-hidden="true">💬</span> Commenter
        </button>
        <button type="button" className="interactions__button" onClick={share}>
          <span aria-hidden="true">↗</span> Partager
        </button>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {notice && <p className="interactions__notice" role="status">{notice}</p>}
      {showComments && (
        <Comments
          post={{ ...post, comments_enabled: commentsEnabled }}
          admin={admin}
          onCountChange={(delta) => setSummary((s) => ({ ...s, comments: s.comments + delta }))}
          onSettingChange={setCommentsEnabled}
        />
      )}
    </div>
  )
}

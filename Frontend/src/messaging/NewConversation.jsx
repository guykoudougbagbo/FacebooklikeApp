import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorMessage, Loading, TextField } from '../components/ui'
import { usePagedList } from '../utils/usePagedList'

/** Start a one-on-one conversation, or create a group. */
export default function NewConversation({ onDone }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const team = usePagedList('/admin/admins/')
  const [mode, setMode] = useState('direct')
  const [chosen, setChosen] = useState(() => new Set())
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const others = (team.items ?? []).filter((person) => person.id !== user.id)

  function toggle(id) {
    setChosen((current) => {
      if (mode === 'direct') return new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = mode === 'direct'
        ? { kind: 'direct', user_id: [...chosen][0] }
        : { kind: 'group', title, member_ids: [...chosen] }
      const conversation = await api('/messages/conversations/', { method: 'POST', body })
      onDone()
      navigate(`/admin/messages/${conversation.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="new-conversation" onSubmit={submit} aria-label="Nouvelle conversation">
      <div className="new-conversation__modes" role="radiogroup" aria-label="Type de conversation">
        {[['direct', 'Message privé'], ['group', 'Groupe']].map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="mode" value={value} checked={mode === value}
              onChange={() => { setMode(value); setChosen(new Set()) }} />
            {label}
          </label>
        ))}
      </div>
      <ErrorMessage>{error || team.error}</ErrorMessage>
      {mode === 'group' && (
        <TextField label="Nom du groupe" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} />
      )}
      {team.items === null ? <Loading /> : (
        <fieldset className="new-conversation__people">
          <legend>{mode === 'direct' ? 'Avec qui ?' : 'Membres'}</legend>
          {others.length === 0 && <p>Aucun autre administrateur pour le moment.</p>}
          {others.map((person) => (
            <label key={person.id}>
              <input type={mode === 'direct' ? 'radio' : 'checkbox'} name="person" checked={chosen.has(person.id)}
                onChange={() => toggle(person.id)} />
              {person.display_name}
            </label>
          ))}
          {team.hasMore && <Button type="button" variant="secondary" busy={team.loadingMore} onClick={team.loadMore}>Voir plus</Button>}
        </fieldset>
      )}
      <div className="new-conversation__actions">
        <Button type="button" variant="secondary" onClick={onDone}>Annuler</Button>
        <Button type="submit" busy={busy} disabled={chosen.size === 0}>
          {mode === 'direct' ? 'Écrire' : 'Créer le groupe'}
        </Button>
      </div>
    </form>
  )
}

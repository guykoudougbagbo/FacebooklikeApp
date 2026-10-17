import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorMessage, TextField } from '../components/ui'
import { usePagedList } from '../utils/usePagedList'

/** Members of a group; its manager can rename it and add or remove people; anyone can leave. */
export default function GroupSettings({ conversation, onChanged }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isManager = conversation.manager_id === user.id
  const team = usePagedList('/admin/admins/')
  const [title, setTitle] = useState(conversation.title)
  const [error, setError] = useState('')
  const memberIds = new Set(conversation.members.map((m) => m.id))
  const addable = (team.items ?? []).filter((person) => !memberIds.has(person.id))

  async function run(request, after = onChanged) {
    setError('')
    try {
      after(await request())
    } catch (err) {
      setError(err.message)
    }
  }

  const base = `/messages/conversations/${conversation.id}`

  return (
    <section className="group-settings" aria-label="Réglages du groupe">
      <ErrorMessage>{error}</ErrorMessage>
      {isManager && (
        <form className="group-settings__rename"
          onSubmit={(e) => { e.preventDefault(); run(() => api(`${base}/`, { method: 'PATCH', body: { title } })) }}>
          <TextField label="Nom du groupe" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" variant="secondary">Renommer</Button>
        </form>
      )}
      <h3>Membres</h3>
      <ul className="list">
        {conversation.members.map((member) => (
          <li key={member.id} className="list__row">
            <span>{member.name}{member.id === conversation.manager_id && ' · gère le groupe'}</span>
            {isManager && member.id !== user.id && (
              <Button variant="danger"
                onClick={() => window.confirm(`Retirer ${member.name} du groupe ?`)
                  && run(() => api(`${base}/members/${member.id}/`, { method: 'DELETE' }))}>
                Retirer
              </Button>
            )}
          </li>
        ))}
      </ul>
      {isManager && team.hasMore && <Button variant="secondary" busy={team.loadingMore} onClick={team.loadMore}>Voir plus de personnes</Button>}
      {isManager && addable.length > 0 && (
        <div className="group-settings__add">
          <h3>Ajouter</h3>
          {addable.map((person) => (
            <Button key={person.id} variant="secondary"
              onClick={() => run(() => api(`${base}/members/`, { method: 'POST', body: { user_id: person.id } }))}>
              {`+ ${person.display_name}`}
            </Button>
          ))}
        </div>
      )}
      <Button variant="danger"
        onClick={() => window.confirm('Quitter ce groupe ? Vous ne verrez plus ses messages.')
          && run(() => api(`${base}/members/${user.id}/`, { method: 'DELETE' }), () => navigate('/admin/messages'))}>
        Quitter le groupe
      </Button>
    </section>
  )
}

import { useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorMessage, Loading, Notice } from '../components/ui'
import { formatDate, formatDateTime, ROLE_LABELS } from '../utils/format'
import { usePagedList } from '../utils/usePagedList'
import './AdminsPage.css'

function linkFrom(invite, extra = {}) {
  return { url: `${window.location.origin}/invitation#${invite.token}`, expiresAt: invite.expires_at, ...extra }
}

function InviteLink({ link }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard?.writeText(link.url)
    setCopied(true)
  }

  return (
    <div className="invite-link">
      <Notice>
        {link.forName && <>Lien de réinvitation pour <strong>{link.forName}</strong>. </>}
        Copiez ce lien maintenant : il ne sera plus affiché. Valable jusqu'au {formatDateTime(link.expiresAt)}.
      </Notice>
      <input className="invite-link__url" readOnly value={link.url} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} />
      <Button variant="secondary" onClick={copy}>{copied ? 'Copié !' : 'Copier le lien'}</Button>
    </div>
  )
}

function InvitePanel({ changes, onChange }) {
  const invites = usePagedList('/admin/invites/', changes)
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function createInvite() {
    setBusy(true)
    setError('')
    try {
      setLink(linkFrom(await api('/admin/invites/', { method: 'POST' })))
      onChange()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function revoke(id) {
    if (!window.confirm('Annuler ce lien d\'invitation ? Il ne fonctionnera plus.')) return
    try {
      await api(`/admin/invites/${id}/`, { method: 'DELETE' })
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card title="Inviter un administrateur">
      <p>Créez un lien, puis envoyez-le vous-même à la personne (SMS, WhatsApp…). Il ne fonctionne qu'une fois.</p>
      <ErrorMessage>{error || invites.error}</ErrorMessage>
      <Button onClick={createInvite} busy={busy}>Créer un lien d'invitation</Button>
      {link && <InviteLink key={link.url} link={link} />}
      {invites.items?.length > 0 && (
        <>
          <h2 className="admins__subtitle">Liens en attente</h2>
          <ul className="list">
            {invites.items.map((invite) => (
              <li key={invite.id} className="list__row">
                <span>
                  {invite.for_user ? `Réinvitation de ${invite.for_user}` : 'Nouvel administrateur'}
                  {' · '}créé par {invite.created_by} · expire le {formatDateTime(invite.expires_at)}
                </span>
                <Button variant="danger" onClick={() => revoke(invite.id)}>Annuler</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function FormerAdminsPanel({ changes, onChange }) {
  const former = usePagedList('/admin/former-admins/', changes)
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')

  async function reinvite(person) {
    setError('')
    try {
      setLink(linkFrom(await api(`/admin/former-admins/${person.id}/reinvite/`, { method: 'POST' }), { forName: person.display_name }))
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!former.items?.length && !link && !former.error) return null

  return (
    <Card title="Anciens administrateurs">
      <p>Un lien de réinvitation ne fonctionne que pour cette personne. Elle garde son nom et choisit un nouveau mot de passe.</p>
      <ErrorMessage>{error || former.error}</ErrorMessage>
      {link && <InviteLink key={link.url} link={link} />}
      <ul className="list">
        {former.items?.map((person) => (
          <li key={person.id} className="list__row">
            <div>
              <strong className="admins__name">{person.display_name}</strong>
              <div className="list__meta">{person.email}</div>
            </div>
            <Button variant="secondary" onClick={() => reinvite(person)}>Réinviter</Button>
          </li>
        ))}
      </ul>
      {former.hasMore && <Button variant="secondary" busy={former.loadingMore} onClick={former.loadMore}>Voir plus</Button>}
    </Card>
  )
}

export default function AdminsPage() {
  const { user } = useAuth()
  const [changes, setChanges] = useState(0)
  const admins = usePagedList('/admin/admins/', changes)
  const [actionError, setActionError] = useState('')
  const isOwner = user.role === 'owner'
  const onChange = () => setChanges((c) => c + 1)

  async function act(admin, path, question) {
    if (!window.confirm(question)) return
    setActionError('')
    try {
      await api(`/admin/admins/${admin.id}/${path}/`, { method: 'POST' })
      onChange()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <>
      {isOwner && <InvitePanel changes={changes} onChange={onChange} />}
      <Card title="Administrateurs">
        <ErrorMessage>{actionError || admins.error}</ErrorMessage>
        {admins.items === null ? <Loading /> : (
          <ul className="list">
            {admins.items.map((admin) => (
              <li key={admin.id} className="list__row">
                <div>
                  <strong className="admins__name">{admin.display_name}</strong>{' '}
                  <span className={`badge badge--${admin.role}`}>{ROLE_LABELS[admin.role]}</span>
                  <div className="list__meta">{admin.email} · depuis le {formatDate(admin.date_joined)}</div>
                </div>
                {isOwner && admin.role !== 'owner' && (
                  <div className="admins__actions">
                    <Button
                      variant="secondary"
                      onClick={() => act(admin, 'reset-second-step', `Réinitialiser la double authentification de ${admin.display_name} ? Cette personne devra la reconfigurer à sa prochaine connexion.`)}
                    >
                      Réinitialiser la double authentification
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => act(admin, 'remove', `Retirer ${admin.display_name} des administrateurs ? Cette personne sera déconnectée immédiatement. Vous pourrez la réinviter plus tard.`)}
                    >
                      Retirer
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {admins.hasMore && <Button variant="secondary" busy={admins.loadingMore} onClick={admins.loadMore}>Voir plus</Button>}
      </Card>
      {isOwner && <FormerAdminsPanel changes={changes} onChange={onChange} />}
    </>
  )
}

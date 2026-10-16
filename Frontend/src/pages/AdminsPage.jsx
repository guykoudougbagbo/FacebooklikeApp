import { useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorMessage, Loading, Notice } from '../components/ui'
import { formatDate, formatDateTime, ROLE_LABELS } from '../utils/format'
import { usePagedList } from '../utils/usePagedList'
import './AdminsPage.css'

function InvitePanel() {
  const invites = usePagedList('/admin/invites/')
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function createInvite() {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const invite = await api('/admin/invites/', { method: 'POST' })
      setLink({ url: `${window.location.origin}/invitation#${invite.token}`, expiresAt: invite.expires_at })
      invites.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(link.url)
    setCopied(true)
  }

  async function revoke(id) {
    if (!window.confirm('Annuler ce lien d\'invitation ? Il ne fonctionnera plus.')) return
    try {
      await api(`/admin/invites/${id}/`, { method: 'DELETE' })
      invites.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card title="Inviter un administrateur">
      <p>Créez un lien, puis envoyez-le vous-même à la personne (SMS, WhatsApp…). Il ne fonctionne qu'une fois.</p>
      <ErrorMessage>{error || invites.error}</ErrorMessage>
      <Button onClick={createInvite} busy={busy}>Créer un lien d'invitation</Button>
      {link && (
        <div className="invite-link">
          <Notice>Copiez ce lien maintenant : il ne sera plus affiché. Valable jusqu'au {formatDateTime(link.expiresAt)}.</Notice>
          <input className="invite-link__url" readOnly value={link.url} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" onClick={copyLink}>{copied ? 'Copié !' : 'Copier le lien'}</Button>
        </div>
      )}
      {invites.items?.length > 0 && (
        <>
          <h2 className="admins__subtitle">Liens en attente</h2>
          <ul className="list">
            {invites.items.map((invite) => (
              <li key={invite.id} className="list__row">
                <span>Créé par {invite.created_by} · expire le {formatDateTime(invite.expires_at)}</span>
                <Button variant="danger" onClick={() => revoke(invite.id)}>Annuler</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

export default function AdminsPage() {
  const { user } = useAuth()
  const admins = usePagedList('/admin/admins/')
  const [actionError, setActionError] = useState('')
  const isOwner = user.role === 'owner'

  async function act(admin, path, question) {
    if (!window.confirm(question)) return
    setActionError('')
    try {
      await api(`/admin/admins/${admin.id}/${path}/`, { method: 'POST' })
      admins.reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <>
      {isOwner && <InvitePanel />}
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
                      onClick={() => act(admin, 'remove', `Retirer ${admin.display_name} des administrateurs ? Cette personne sera déconnectée immédiatement.`)}
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
    </>
  )
}

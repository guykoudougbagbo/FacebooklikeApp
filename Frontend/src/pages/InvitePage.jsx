import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../api/client'
import { Button, Card, ErrorMessage, Loading, TextField } from '../components/ui'
import { formatDateTime } from '@shared/format'

function PasswordFields() {
  return (
    <>
      <TextField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Au moins 8 caractères. Évitez les mots de passe courants."
        required
        minLength={8}
      />
      <TextField label="Confirmez le mot de passe" name="password_again" type="password" autoComplete="new-password" required />
    </>
  )
}

export default function InvitePage() {
  const token = useLocation().hash.slice(1)
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [checkError, setCheckError] = useState(token ? '' : "Ce lien d'invitation est incomplet.")
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    api('/invites/check/', { method: 'POST', body: { token } })
      .then(setInvite)
      .catch((err) => setCheckError(err.message))
  }, [token])

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (form.get('password') !== form.get('password_again')) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (invite.kind === 'reactivate') {
        await api('/invites/reactivate/', { method: 'POST', body: { token, password: form.get('password') } })
      } else {
        await api('/invites/accept/', {
          method: 'POST',
          body: {
            token,
            display_name: form.get('display_name'),
            email: form.get('email'),
            password: form.get('password'),
          },
        })
      }
      navigate('/connexion/securite')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (checkError) {
    return (
      <Card title="Invitation">
        <ErrorMessage>{checkError}</ErrorMessage>
      </Card>
    )
  }
  if (!invite) return <Loading />

  if (invite.kind === 'reactivate') {
    return (
      <Card title="Réactivez votre compte">
        <p>
          Bonjour {invite.display_name}. Choisissez un nouveau mot de passe pour {invite.email}. Vous configurerez
          ensuite à nouveau votre application d'authentification. Ce lien est valable jusqu'au {formatDateTime(invite.expires_at)}.
        </p>
        <form onSubmit={handleSubmit}>
          <ErrorMessage>{error}</ErrorMessage>
          <PasswordFields />
          <Button type="submit" busy={busy}>Réactiver mon compte</Button>
        </form>
      </Card>
    )
  }

  return (
    <Card title="Rejoindre l'équipe des administrateurs">
      <p>Cette invitation est valable jusqu'au {formatDateTime(invite.expires_at)}.</p>
      <form onSubmit={handleSubmit}>
        <ErrorMessage>{error}</ErrorMessage>
        <TextField label="Votre nom" name="display_name" autoComplete="name" required minLength={2} maxLength={80} />
        <TextField label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
        <PasswordFields />
        <Button type="submit" busy={busy}>Créer mon compte</Button>
      </form>
    </Card>
  )
}

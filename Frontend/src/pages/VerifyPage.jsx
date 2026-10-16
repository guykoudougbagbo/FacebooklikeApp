import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorMessage, TextField } from '../components/ui'

export default function VerifyPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const code = new FormData(event.currentTarget).get('code')
    setBusy(true)
    setError('')
    try {
      setUser(await api('/auth/second-step/verify/', { method: 'POST', body: { code } }))
      navigate('/admin')
    } catch (err) {
      setError(err.message)
      setExpired(err.status === 401)
      setBusy(false)
    }
  }

  return (
    <Card title="Code de vérification">
      <form onSubmit={handleSubmit}>
        <ErrorMessage>{error}</ErrorMessage>
        {expired && <p><Link to="/connexion">Revenir à la connexion</Link></p>}
        <TextField
          label="Code à 6 chiffres de votre application d'authentification"
          name="code"
          autoComplete="one-time-code"
          hint="Téléphone perdu ? Saisissez plutôt un de vos codes de secours."
          required
          maxLength={32}
        />
        <Button type="submit" busy={busy}>Se connecter</Button>
      </form>
    </Card>
  )
}

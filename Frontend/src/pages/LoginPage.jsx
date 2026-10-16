import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorMessage, TextField } from '../components/ui'

const NEXT_STEP_PATHS = {
  verify: '/connexion/code',
  setup: '/connexion/securite',
}

export default function LoginPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/admin" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { next } = await api('/auth/login/', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      })
      navigate(NEXT_STEP_PATHS[next])
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title="Connexion administrateur">
      <form onSubmit={handleSubmit}>
        <ErrorMessage>{error}</ErrorMessage>
        <TextField label="Adresse e-mail" name="email" type="email" autoComplete="username" required />
        <TextField label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" busy={busy}>Continuer</Button>
      </form>
    </Card>
  )
}

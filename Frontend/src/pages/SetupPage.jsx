import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, ErrorMessage, Loading, Notice, TextField } from '../components/ui'
import './SetupPage.css'

export default function SetupPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const [setup, setSetup] = useState(null)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    // Starting twice would replace the secret behind the QR code already on screen.
    if (started.current) return
    started.current = true
    api('/auth/second-step/setup/', { method: 'POST' })
      .then(setSetup)
      .catch((err) => {
        setError(err.message)
        setExpired(err.status === 401)
      })
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const code = new FormData(event.currentTarget).get('code')
    setBusy(true)
    setError('')
    try {
      setResult(await api('/auth/second-step/confirm/', { method: 'POST', body: { code } }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function finish() {
    setUser(result.user)
    navigate('/admin')
  }

  if (result) {
    return (
      <Card title="Vos codes de secours">
        <Notice>
          Notez ces codes et gardez-les en lieu sûr. Chacun ne fonctionne qu'une fois et vous permet de vous
          connecter si vous perdez votre téléphone. Ils ne seront plus jamais affichés.
        </Notice>
        <ul className="setup__codes">
          {result.recovery_codes.map((code) => <li key={code}><code>{code}</code></li>)}
        </ul>
        <Button onClick={() => navigator.clipboard?.writeText(result.recovery_codes.join('\n'))} variant="secondary">
          Copier les codes
        </Button>{' '}
        <Button onClick={finish}>J'ai noté mes codes</Button>
      </Card>
    )
  }

  if (error && !setup) {
    return (
      <Card title="Double authentification">
        <ErrorMessage>{error}</ErrorMessage>
        {expired && <p><Link to="/connexion">Revenir à la connexion</Link></p>}
      </Card>
    )
  }

  if (!setup) return <Loading />

  return (
    <Card title="Sécurisez votre compte">
      <ol className="setup__steps">
        <li>Installez une application d'authentification (Google Authenticator, Microsoft Authenticator…).</li>
        <li>Scannez ce code QR avec l'application.</li>
        <li>Saisissez le code à 6 chiffres affiché par l'application.</li>
      </ol>
      <div className="setup__qr">
        <QRCodeSVG value={setup.otpauth_url} size={192} marginSize={2} title="Code QR à scanner" />
      </div>
      <p className="setup__secret">
        Impossible de scanner ? Saisissez cette clé : <code>{setup.secret}</code>
      </p>
      <form onSubmit={handleSubmit}>
        <ErrorMessage>{error}</ErrorMessage>
        <TextField label="Code à 6 chiffres" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} />
        <Button type="submit" busy={busy}>Activer</Button>
      </form>
    </Card>
  )
}

import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAdmin } from '../../admin/AdminContext'
import { adminApi } from '../../api/admin'
import { useTheme } from '../../theme'
import Backdrop from '../Backdrop'
import { Button, Card, ErrorText, Field, Notice } from '../ui'

function Credentials({ onStarted }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    try {
      onStarted(await adminApi('/app/auth/login/', { method: 'POST', body: { email, password } }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title="Connexion administrateur">
      <ErrorText>{error}</ErrorText>
      <Field label="Adresse e-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email"
        keyboardType="email-address" textContentType="username" />
      <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"
        textContentType="password" />
      <Button busy={busy} disabled={!email || !password} onPress={submit}>Continuer</Button>
    </Card>
  )
}

function Verify({ ticket, onDone, onExpired }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    try {
      onDone(await adminApi('/app/auth/verify/', { method: 'POST', body: { ticket, code } }))
    } catch (err) {
      if (err.status === 401) onExpired(err.message)
      else setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title="Code de vérification">
      <ErrorText>{error}</ErrorText>
      <Field label="Code à 6 chiffres de votre application d'authentification" value={code} onChangeText={setCode}
        autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={32}
        hint="Téléphone perdu ? Saisissez plutôt un de vos codes de secours." />
      <Button busy={busy} disabled={!code.trim()} onPress={submit}>Se connecter</Button>
    </Card>
  )
}

function Setup({ ticket, onDone, onExpired }) {
  const theme = useTheme()
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // Starting twice would replace the key the admin may already have added to their app.
    if (started.current) return
    started.current = true
    adminApi('/app/auth/setup/', { method: 'POST', body: { ticket } }).then(setSetup, (err) => {
      if (err.status === 401) onExpired(err.message)
      else setError(err.message)
    })
  }, [ticket, onExpired])

  async function openAuthenticator() {
    setError('')
    try {
      await Linking.openURL(setup.otpauth_url)
    } catch {
      setError("Aucune application d'authentification trouvée sur ce téléphone. Installez-en une, ou saisissez la clé à la main.")
    }
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      onDone(await adminApi('/app/auth/confirm/', { method: 'POST', body: { ticket, code } }))
    } catch (err) {
      if (err.status === 401) onExpired(err.message)
      else setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card title="Sécurisez votre compte">
      <ErrorText>{error}</ErrorText>
      <Text style={{ color: theme.textStrong }}>
        1. Installez une application d'authentification (Google Authenticator, Microsoft Authenticator…).{'\n'}
        2. Ajoutez votre compte GenZ avec le bouton ci-dessous.{'\n'}
        3. Saisissez le code à 6 chiffres qu'elle affiche.
      </Text>
      {setup && (
        <>
          <Button variant="secondary" onPress={openAuthenticator}>Ouvrir mon application d'authentification</Button>
          <Text style={{ color: theme.text }} selectable>Ou saisissez cette clé : {setup.secret}</Text>
          <Button variant="secondary" onPress={async () => setCopied(await Clipboard.setStringAsync(setup.secret))}>
            {copied ? 'Clé copiée' : 'Copier la clé'}
          </Button>
          <Field label="Code à 6 chiffres" value={code} onChangeText={setCode} keyboardType="number-pad"
            autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
          <Button busy={busy} disabled={code.length < 6} onPress={submit}>Activer</Button>
        </>
      )}
    </Card>
  )
}

function RecoveryCodes({ codes, onDone }) {
  const theme = useTheme()
  const [copied, setCopied] = useState(false)
  return (
    <Card title="Vos codes de secours">
      <Notice>
        Notez ces codes et gardez-les en lieu sûr. Chacun ne fonctionne qu'une fois et vous permet de vous connecter
        si vous perdez votre téléphone. Ils ne seront plus jamais affichés.
      </Notice>
      <Text style={[styles.codes, { color: theme.textStrong }]} selectable>{codes.join('\n')}</Text>
      <Button variant="secondary" onPress={async () => setCopied(await Clipboard.setStringAsync(codes.join('\n')))}>
        {copied ? 'Codes copiés' : 'Copier les codes'}
      </Button>
      <Button onPress={onDone}>J'ai noté mes codes</Button>
    </Card>
  )
}

/** Same steps as the website: email and password, then the authenticator code (or its first set-up). */
export default function LoginFlow() {
  const { logIn } = useAdmin()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState({ name: 'credentials' })
  const [notice, setNotice] = useState('')

  function started({ next, ticket }) {
    setNotice('')
    setStep({ name: next, ticket })
  }

  function expired(message) {
    setNotice(message)
    setStep({ name: 'credentials' })
  }

  function finished(result) {
    if (result.recovery_codes) setStep({ name: 'codes', result })
    else logIn(result.key, result.user)
  }

  return (
    <Backdrop>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Button variant="secondary" onPress={() => router.replace('/')}>Fermer</Button>
          </View>
          <ErrorText>{notice}</ErrorText>
          {step.name === 'credentials' && <Credentials onStarted={started} />}
          {step.name === 'verify' && <Verify ticket={step.ticket} onDone={finished} onExpired={expired} />}
          {step.name === 'setup' && <Setup ticket={step.ticket} onDone={finished} onExpired={expired} />}
          {step.name === 'codes' && (
            <RecoveryCodes codes={step.result.recovery_codes} onDone={() => logIn(step.result.key, step.result.user)} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 12, gap: 12 },
  top: { alignItems: 'flex-end' },
  codes: { fontSize: 18, lineHeight: 28, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
})

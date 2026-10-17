import { render, screen, userEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { AdminContext } from '../admin/AdminContext'
import { adminApi } from '../api/admin'
import LoginFlow from '../components/admin/LoginFlow'
import { serveWith } from '../testing/serve'

jest.mock('../api/admin', () => ({ adminApi: jest.fn() }))

const OWNER = { id: 1, display_name: 'Awa', role: 'owner' }
const serve = serveWith(adminApi)

async function showLogin() {
  const logIn = jest.fn()
  const user = userEvent.setup()
  await render(<AdminContext.Provider value={{ user: null, logIn }}><LoginFlow /></AdminContext.Provider>)
  await user.type(screen.getByLabelText('Adresse e-mail'), 'awa@example.com')
  await user.type(screen.getByLabelText('Mot de passe'), 'secret')
  await user.press(screen.getByRole('button', { name: 'Continuer' }))
  return { logIn, user }
}

beforeEach(() => jest.clearAllMocks())

test('password, then the authenticator code, logs the admin in on this phone', async () => {
  serve({
    'POST /app/auth/login/': { next: 'verify', ticket: 't1' },
    'POST /app/auth/verify/': ({ ticket, code }) => (ticket === 't1' && code === '123456' ? { key: 'k1', user: OWNER } : null),
  })
  const { logIn, user } = await showLogin()
  await user.type(await screen.findByLabelText(/Code à 6 chiffres/), '123456')
  await user.press(screen.getByRole('button', { name: 'Se connecter' }))
  expect(logIn).toHaveBeenCalledWith('k1', OWNER)
})

test('a first login sets up the authenticator app, then shows the recovery codes once', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  serve({
    'POST /app/auth/login/': { next: 'setup', ticket: 't1' },
    'POST /app/auth/setup/': { otpauth_url: 'otpauth://totp/GenZ:awa?secret=ABC', secret: 'ABC' },
    'POST /app/auth/confirm/': { key: 'k1', user: OWNER, recovery_codes: ['AAAA-BBBB', 'CCCC-DDDD'] },
  })
  const { logIn, user } = await showLogin()
  await user.press(await screen.findByRole('button', { name: "Ouvrir mon application d'authentification" }))
  expect(open).toHaveBeenCalledWith('otpauth://totp/GenZ:awa?secret=ABC')
  expect(screen.getByText(/ABC/)).toBeOnTheScreen()
  await user.type(screen.getByLabelText('Code à 6 chiffres'), '654321')
  await user.press(screen.getByRole('button', { name: 'Activer' }))
  expect(await screen.findByText(/AAAA-BBBB/)).toBeOnTheScreen()
  expect(logIn).not.toHaveBeenCalled()
  await user.press(screen.getByRole('button', { name: "J'ai noté mes codes" }))
  expect(logIn).toHaveBeenCalledWith('k1', OWNER)
})

test('an expired step sends the admin back to the start with the reason', async () => {
  const expired = Object.assign(new Error('Votre session a expiré. Reconnectez-vous.'), { status: 401 })
  serve({ 'POST /app/auth/login/': { next: 'verify', ticket: 't1' }, 'POST /app/auth/verify/': expired })
  const { user } = await showLogin()
  await user.type(await screen.findByLabelText(/Code à 6 chiffres/), '123456')
  await user.press(screen.getByRole('button', { name: 'Se connecter' }))
  expect(await screen.findByText('Votre session a expiré. Reconnectez-vous.')).toBeOnTheScreen()
  expect(screen.getByLabelText('Mot de passe')).toBeOnTheScreen()
})

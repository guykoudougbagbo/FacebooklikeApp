import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { loggedOut, mockApi, renderApp } from '../test/renderApp'

const VALID = { 'POST /invites/check/': { body: { expires_at: '2026-10-18T10:00:00Z' } } }

async function fillForm(user, passwordAgain = 'Un-mot-de-passe-solide') {
  await user.type(await screen.findByLabelText('Votre nom'), 'Koffi')
  await user.type(screen.getByLabelText('Adresse e-mail'), 'koffi@example.com')
  await user.type(screen.getByLabelText('Mot de passe'), 'Un-mot-de-passe-solide')
  await user.type(screen.getByLabelText('Confirmez le mot de passe'), passwordAgain)
  await user.click(screen.getByRole('button', { name: 'Créer mon compte' }))
}

test('a link without a token is reported as incomplete', async () => {
  mockApi(loggedOut)
  renderApp('/invitation')
  expect((await screen.findByRole('alert')).textContent).toMatch(/incomplet/)
})

test('an unknown or used link is refused', async () => {
  const calls = mockApi({ ...loggedOut, 'POST /invites/check/': { status: 404, body: { detail: "Cette invitation n'est plus valide. Demandez un nouveau lien." } } })
  renderApp('/invitation#bad-token')
  expect((await screen.findByRole('alert')).textContent).toMatch(/plus valide/)
  expect(calls.find((c) => c.path === '/invites/check/').body).toEqual({ token: 'bad-token' })
})

test('mismatched passwords are caught before sending', async () => {
  const calls = mockApi({ ...loggedOut, ...VALID })
  renderApp('/invitation#good-token')
  await fillForm(userEvent.setup(), 'autre-chose')
  expect((await screen.findByRole('alert')).textContent).toMatch(/ne correspondent pas/)
  expect(calls.some((c) => c.path === '/invites/accept/')).toBe(false)
})

test('accepting sends the token and opens the security setup', async () => {
  const calls = mockApi({
    ...loggedOut,
    ...VALID,
    'POST /invites/accept/': { status: 201, body: { next: 'setup' } },
    'POST /auth/second-step/setup/': { body: { otpauth_url: 'otpauth://totp/x', secret: 'S' } },
  })
  renderApp('/invitation#good-token')
  await fillForm(userEvent.setup())
  expect(await screen.findByRole('heading', { name: 'Sécurisez votre compte' })).toBeTruthy()
  expect(calls.find((c) => c.path === '/invites/accept/').body).toEqual({
    token: 'good-token', display_name: 'Koffi', email: 'koffi@example.com', password: 'Un-mot-de-passe-solide',
  })
})

test('a re-invite link asks only for a new password and reactivates that account', async () => {
  const calls = mockApi({
    ...loggedOut,
    'POST /invites/check/': { body: { expires_at: '2026-10-18T10:00:00Z', kind: 'reactivate', display_name: 'Moussa', email: 'moussa@example.com' } },
    'POST /invites/reactivate/': { body: { next: 'setup' } },
    'POST /auth/second-step/setup/': { body: { otpauth_url: 'otpauth://totp/x', secret: 'S' } },
  })
  renderApp('/invitation#back7')
  expect(await screen.findByRole('heading', { name: 'Réactivez votre compte' })).toBeTruthy()
  expect(screen.getByText(/Bonjour Moussa/).textContent).toContain('moussa@example.com')
  expect(screen.queryByLabelText('Votre nom')).toBeNull()
  expect(screen.queryByLabelText('Adresse e-mail')).toBeNull()

  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Mot de passe'), 'Un-mot-de-passe-solide')
  await user.type(screen.getByLabelText('Confirmez le mot de passe'), 'Un-mot-de-passe-solide')
  await user.click(screen.getByRole('button', { name: 'Réactiver mon compte' }))
  expect(await screen.findByRole('heading', { name: 'Sécurisez votre compte' })).toBeTruthy()
  expect(calls.find((c) => c.path === '/invites/reactivate/').body).toEqual({ token: 'back7', password: 'Un-mot-de-passe-solide' })
  expect(calls.some((c) => c.path === '/invites/accept/')).toBe(false)
})

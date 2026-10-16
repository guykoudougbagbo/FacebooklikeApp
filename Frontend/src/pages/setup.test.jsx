import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { loggedOut, mockApi, OWNER, page, renderApp } from '../test/renderApp'

test('shows the QR code, then the recovery codes, then the admin area', async () => {
  const calls = mockApi({
    ...loggedOut,
    'POST /auth/second-step/setup/': { body: { otpauth_url: 'otpauth://totp/GenZ:owner', secret: 'JBSWY3DPEHPK3PXP' } },
    'POST /auth/second-step/confirm/': { body: { recovery_codes: ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'], user: OWNER } },
    'GET /admin/admins/': page([]),
    'GET /admin/invites/': page([]),
  })
  renderApp('/connexion/securite')
  expect(await screen.findByTitle('Code QR à scanner')).toBeTruthy()
  expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy()

  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Code à 6 chiffres'), '654321')
  await user.click(screen.getByRole('button', { name: 'Activer' }))
  expect(await screen.findByText('AAAA-BBBB-CCCC-DDDD')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: "J'ai noté mes codes" }))
  expect(await screen.findByRole('heading', { name: 'Administrateurs' })).toBeTruthy()
  expect(calls.filter((c) => c.path === '/auth/second-step/setup/')).toHaveLength(1)
})

test('wrong code keeps the QR code on screen', async () => {
  mockApi({
    ...loggedOut,
    'POST /auth/second-step/setup/': { body: { otpauth_url: 'otpauth://totp/x', secret: 'S' } },
    'POST /auth/second-step/confirm/': { status: 400, body: { detail: 'Code incorrect. Réessayez.' } },
  })
  renderApp('/connexion/securite')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Code à 6 chiffres'), '000000')
  await user.click(screen.getByRole('button', { name: 'Activer' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Code incorrect. Réessayez.')
  expect(screen.getByTitle('Code QR à scanner')).toBeTruthy()
})

test('opening setup without the password step explains what to do', async () => {
  mockApi({ ...loggedOut, 'POST /auth/second-step/setup/': { status: 401, body: { detail: 'Votre session a expiré. Reconnectez-vous.' } } })
  renderApp('/connexion/securite')
  expect(await screen.findByRole('link', { name: 'Revenir à la connexion' })).toBeTruthy()
})

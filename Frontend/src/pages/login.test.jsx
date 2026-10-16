import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { loggedOut, mockApi, OWNER, page, renderApp } from '../test/renderApp'

test('admin pages send logged-out visitors to the login page', async () => {
  mockApi(loggedOut)
  renderApp('/admin/administrateurs')
  expect(await screen.findByRole('heading', { name: 'Connexion administrateur' })).toBeTruthy()
})

test('wrong password shows the error and stays on the page', async () => {
  mockApi({ ...loggedOut, 'POST /auth/login/': { status: 400, body: { detail: 'Adresse e-mail ou mot de passe incorrect.' } } })
  renderApp('/connexion')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Adresse e-mail'), 'owner@example.com')
  await user.type(screen.getByLabelText('Mot de passe'), 'nope')
  await user.click(screen.getByRole('button', { name: 'Continuer' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Adresse e-mail ou mot de passe incorrect.')
})

test('password then code logs in and opens the admin area', async () => {
  const calls = mockApi({
    ...loggedOut,
    'POST /auth/login/': { body: { next: 'verify' } },
    'POST /auth/second-step/verify/': { body: OWNER },
    'GET /admin/admins/': page([{ ...OWNER, date_joined: '2026-10-16T10:00:00Z' }]),
    'GET /admin/invites/': page([]),
  })
  renderApp('/connexion')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Adresse e-mail'), 'owner@example.com')
  await user.type(screen.getByLabelText('Mot de passe'), 'secret-pass')
  await user.click(screen.getByRole('button', { name: 'Continuer' }))
  await user.type(await screen.findByLabelText(/Code à 6 chiffres/), '123456')
  await user.click(screen.getByRole('button', { name: 'Se connecter' }))
  expect(await screen.findByRole('heading', { name: 'Administrateurs' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy()
  expect(calls.find((c) => c.path === '/auth/second-step/verify/').body).toEqual({ code: '123456' })
})

test('first login goes to the security setup page', async () => {
  mockApi({
    ...loggedOut,
    'POST /auth/login/': { body: { next: 'setup' } },
    'POST /auth/second-step/setup/': { body: { otpauth_url: 'otpauth://totp/x', secret: 'ABC' } },
  })
  renderApp('/connexion')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Adresse e-mail'), 'owner@example.com')
  await user.type(screen.getByLabelText('Mot de passe'), 'secret-pass')
  await user.click(screen.getByRole('button', { name: 'Continuer' }))
  expect(await screen.findByRole('heading', { name: 'Sécurisez votre compte' })).toBeTruthy()
})

test('an expired code step offers a way back to login', async () => {
  mockApi({ ...loggedOut, 'POST /auth/second-step/verify/': { status: 401, body: { detail: 'Votre session a expiré. Reconnectez-vous.' } } })
  renderApp('/connexion/code')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(/Code à 6 chiffres/), '123456')
  await user.click(screen.getByRole('button', { name: 'Se connecter' }))
  expect(await screen.findByRole('link', { name: 'Revenir à la connexion' })).toBeTruthy()
})

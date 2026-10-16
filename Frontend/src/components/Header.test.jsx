import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { loggedInAs, loggedOut, mockApi, OWNER, renderApp } from '../test/renderApp'

test('shows the logo as a link to the home page', async () => {
  mockApi(loggedOut)
  renderApp('/')
  const logo = await screen.findByRole('img', { name: 'GenZ – La génération qui dit non' })
  expect(logo.getAttribute('src')).toMatch(/genz-logo/)
  expect(logo.closest('a').getAttribute('href')).toBe('/')
})

test('visitors see no admin links; logged-in admins do', async () => {
  mockApi(loggedOut)
  renderApp('/')
  await screen.findByRole('heading', { name: 'Bienvenue' })
  expect(screen.queryByRole('navigation', { name: 'Espace administrateur' })).toBeNull()
})

test('logged-in admins see their name and admin links', async () => {
  mockApi(loggedInAs(OWNER))
  renderApp('/')
  expect(await screen.findByText('Awa')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Administrateurs' })).toBeTruthy()
})

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ADMIN, loggedInAs, mockApi, OWNER, page, renderApp } from '../test/renderApp'

const TEAM = [
  { ...OWNER, date_joined: '2026-10-01T10:00:00Z' },
  { ...ADMIN, date_joined: '2026-10-10T10:00:00Z' },
]

test('the owner can create an invite link and manage admins', async () => {
  const calls = mockApi({
    ...loggedInAs(OWNER),
    'GET /admin/admins/': page(TEAM),
    'GET /admin/invites/': page([]),
    'GET /admin/former-admins/': page([]),
    'POST /admin/invites/': { status: 201, body: { id: 5, token: 'tok123', expires_at: '2026-10-18T10:00:00Z' } },
    'POST /admin/admins/2/remove/': { status: 204 },
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderApp('/admin/administrateurs')
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: "Créer un lien d'invitation" }))
  expect((await screen.findByLabelText("Lien d'invitation")).value).toBe(`${window.location.origin}/invitation#tok123`)

  const koffi = (await screen.findByText('Koffi')).closest('li')
  expect(within(koffi).getByText('Administrateur')).toBeTruthy()
  await user.click(within(koffi).getByRole('button', { name: 'Retirer' }))
  expect(calls.some((c) => c.method === 'POST' && c.path === '/admin/admins/2/remove/')).toBe(true)
  // The former-admins list reloads, so the removed person can be re-invited right away.
  await vi.waitFor(() => expect(calls.filter((c) => c.path === '/admin/former-admins/').length).toBeGreaterThan(1))

  const awa = screen.getByText('Awa', { selector: 'strong' }).closest('li')
  expect(within(awa).queryByRole('button')).toBeNull()
})

test('a regular admin sees the team but no management buttons', async () => {
  const calls = mockApi({ ...loggedInAs(ADMIN), 'GET /admin/admins/': page(TEAM) })
  renderApp('/admin/administrateurs')
  expect(await screen.findByText('Koffi', { selector: 'strong' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: "Créer un lien d'invitation" })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Anciens administrateurs' })).toBeNull()
  expect(calls.some((c) => c.path === '/admin/former-admins/')).toBe(false)
})

test('the owner re-invites a former admin with a link for that person only', async () => {
  const calls = mockApi({
    ...loggedInAs(OWNER),
    'GET /admin/admins/': page(TEAM.slice(0, 1)),
    'GET /admin/invites/': page([]),
    'GET /admin/former-admins/': page([{ id: 7, display_name: 'Moussa', email: 'moussa@example.com' }]),
    'POST /admin/former-admins/7/reinvite/': { status: 201, body: { id: 9, token: 'back7', expires_at: '2026-10-18T10:00:00Z' } },
  })
  renderApp('/admin/administrateurs')
  const user = userEvent.setup()
  const card = (await screen.findByRole('heading', { name: 'Anciens administrateurs' })).closest('section')
  await user.click(within(card).getByRole('button', { name: 'Réinviter' }))
  expect((await within(card).findByLabelText("Lien d'invitation")).value).toBe(`${window.location.origin}/invitation#back7`)
  expect(within(card).getByText(/Lien de réinvitation pour/).textContent).toContain('Lien de réinvitation pour Moussa.')
  // The pending-links list reloads so the new re-invite shows there too.
  await vi.waitFor(() => expect(calls.filter((c) => c.path === '/admin/invites/').length).toBeGreaterThan(1))
})

test('the next page of admins loads with the cursor', async () => {
  const calls = mockApi({
    ...loggedInAs(ADMIN),
    'GET /admin/admins/': () => page(TEAM.slice(0, 1), 'http://x/api/admin/admins/?cursor=abc'),
  })
  renderApp('/admin/administrateurs')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Voir plus' }))
  expect(calls.some((c) => c.search === '?cursor=abc')).toBe(true)
})

test('activity is written as French sentences', async () => {
  mockApi({
    ...loggedInAs(ADMIN),
    'GET /admin/activity/': page([
      { id: 4, action: 'admin_rejoined', actor: 'Koffi', target: 'Koffi', created_at: '2026-10-16T12:00:00Z' },
      { id: 3, action: 'admin_reinvited', actor: 'Awa', target: 'Koffi', created_at: '2026-10-16T11:00:00Z' },
      { id: 2, action: 'two_factor_reset', actor: 'Awa', target: 'Koffi', created_at: '2026-10-16T10:00:00Z' },
      { id: 1, action: 'admin_joined', actor: 'Koffi', target: 'Koffi', created_at: '2026-10-15T10:00:00Z' },
    ]),
  })
  renderApp('/admin/activite')
  expect(await screen.findByText('Awa a réinitialisé la double authentification de Koffi.')).toBeTruthy()
  expect(screen.getByText("Koffi a rejoint l'équipe des administrateurs.")).toBeTruthy()
  expect(screen.getByText('Awa a réinvité Koffi.')).toBeTruthy()
  expect(screen.getByText("Koffi a rejoint à nouveau l'équipe des administrateurs.")).toBeTruthy()
})

test('logging out returns to the home page without admin links', async () => {
  const calls = mockApi({ ...loggedInAs(ADMIN), 'GET /admin/activity/': page([]), 'POST /auth/logout/': { status: 204 } })
  renderApp('/admin/activite')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Se déconnecter' }))
  expect(await screen.findByRole('heading', { name: 'Bienvenue' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Activité' })).toBeNull()
  expect(calls.some((c) => c.path === '/auth/logout/')).toBe(true)
})

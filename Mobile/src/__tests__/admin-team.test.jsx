import { render, screen, userEvent } from '@testing-library/react-native'
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams } from 'expo-router'
import { Share } from 'react-native'
import { AdminContext } from '../admin/AdminContext'
import { adminApi } from '../api/admin'
import { api } from '../api/client'
import ActivityScreen from '../app/admin/activity'
import ModerationScreen from '../app/admin/post/[id]'
import TeamScreen from '../app/admin/team'
import { confirm } from '../components/confirm'
import { makePost, serve as serveVisitor, serveWith } from '../testing/serve'

jest.mock('../api/admin', () => ({ adminApi: jest.fn(), adminMediaUrl: (path) => path }))
jest.mock('../api/client', () => ({ api: jest.fn(), mediaUrl: (path) => path }))
jest.mock('../components/confirm', () => ({ confirm: jest.fn(async () => true) }))

const serve = serveWith(adminApi)
const OWNER = { id: 1, display_name: 'Awa', role: 'owner', email: 'awa@example.com', date_joined: '2026-10-01T10:00:00Z' }
const KOFFI = { id: 2, display_name: 'Koffi', role: 'admin', email: 'koffi@example.com', date_joined: '2026-10-02T10:00:00Z' }
const as = (user, ui) => <AdminContext.Provider value={{ user }}>{ui}</AdminContext.Provider>
const TEAM = {
  'GET /admin/admins/': { results: [OWNER, KOFFI], next: null },
  'GET /admin/invites/': { results: [], next: null },
  'GET /admin/former-admins/': { results: [], next: null },
}

beforeEach(() => jest.clearAllMocks())

test('the owner creates an invite link and sends or copies it', async () => {
  serve({ ...TEAM, 'POST /admin/invites/': { id: 7, token: 'tok', expires_at: '2026-10-19T10:00:00Z' } })
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })
  const user = userEvent.setup()
  await render(as(OWNER, <TeamScreen />))
  await user.press(await screen.findByRole('button', { name: "Créer un lien d'invitation" }))
  expect(await screen.findByText('https://genz.test/invitation#tok')).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Envoyer le lien' }))
  expect(share).toHaveBeenCalledWith({ message: 'https://genz.test/invitation#tok' })
  await user.press(screen.getByRole('button', { name: 'Copier le lien' }))
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://genz.test/invitation#tok')
})

test('the owner removes an admin after confirming; the list reloads', async () => {
  serve({ ...TEAM, 'POST /admin/admins/2/remove/': null })
  const user = userEvent.setup()
  await render(as(OWNER, <TeamScreen />))
  await user.press(await screen.findByRole('button', { name: 'Retirer' }))
  expect(confirm).toHaveBeenCalledWith('Retirer Koffi ?', expect.any(String), 'Retirer')
  expect(adminApi).toHaveBeenCalledWith('/admin/admins/2/remove/', { method: 'POST' })
  const loads = adminApi.mock.calls.filter(([path, options]) => path === '/admin/admins/' && !options)
  expect(loads.length).toBe(2)
})

test('other admins only see the team', async () => {
  serve(TEAM)
  await render(as(KOFFI, <TeamScreen />))
  expect(await screen.findByText(/Koffi · Administrateur/)).toBeOnTheScreen()
  expect(screen.queryByRole('button', { name: "Créer un lien d'invitation" })).not.toBeOnTheScreen()
  expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeOnTheScreen()
  expect(adminApi).not.toHaveBeenCalledWith('/admin/invites/')
})

test('the activity log reads as French sentences', async () => {
  serve({ 'GET /admin/activity/': { results: [{ id: 1, action: 'admin_removed', actor: 'Awa', target: 'Koffi', created_at: '2026-10-16T10:00:00Z' }], next: null } })
  await render(as(OWNER, <ActivityScreen />))
  expect(await screen.findByText('Awa a retiré Koffi des administrateurs.')).toBeOnTheScreen()
})

describe('moderating comments', () => {
  const now = new Date().toISOString()
  const comment = (id, body) => ({ id, name: 'Visiteur', body, is_page: false, created_at: now })

  beforeEach(() => {
    useLocalSearchParams.mockReturnValue({ id: '7' })
    serveVisitor({ 'GET /posts/7/comments/': { results: [comment(1, 'Spam ici')], next: null } })
  })

  test('admins delete a comment, reply as GenZ and turn comments off', async () => {
    const post = makePost(7, { status: 'published', author: 'Awa', interactions: { reactions: {}, comments: 1, shares: 0, my_reaction: null } })
    serve({
      'GET /admin/posts/7/': post,
      'DELETE /admin/comments/1/': null,
      'POST /admin/posts/7/comments/': ({ body }) => ({ id: 2, name: 'GenZ', body, is_page: true, created_at: now }),
      'PATCH /admin/posts/7/comments-enabled/': ({ enabled }) => ({ comments_enabled: enabled }),
    })
    const user = userEvent.setup()
    await render(as(OWNER, <ModerationScreen />))
    expect(await screen.findByText('Spam ici')).toBeOnTheScreen()
    await user.press(screen.getAllByRole('button', { name: 'Supprimer' }).at(-1))
    expect(adminApi).toHaveBeenCalledWith('/admin/comments/1/', { method: 'DELETE' })
    expect(screen.queryByText('Spam ici')).not.toBeOnTheScreen()
    await user.type(screen.getByLabelText('Répondre en tant que GenZ'), 'Merci à tous')
    await user.press(screen.getByRole('button', { name: 'Répondre en tant que GenZ' }))
    expect(await screen.findByText('Merci à tous')).toBeOnTheScreen()
    await user.press(screen.getByRole('button', { name: 'Désactiver les commentaires' }))
    expect(await screen.findByRole('button', { name: 'Réactiver les commentaires' })).toBeOnTheScreen()
    expect(api).toHaveBeenCalledWith('/posts/7/comments/')
  })
})

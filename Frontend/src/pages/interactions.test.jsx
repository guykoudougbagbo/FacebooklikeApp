import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { adminPost, minutesAgo, noInteractions, publicPost } from '../test/posts'
import { ADMIN, loggedInAs, loggedOut, mockApi, page, renderApp } from '../test/renderApp'
import { keyToBytes } from '../utils/push'

const summary = (extra) => ({ ...noInteractions(), ...extra })
const comment = (id, extra = {}) => ({ id, name: 'Awa', is_page: false, body: 'Bravo', created_at: minutesAgo(1), ...extra })

async function openPost(handlers, path = '/') {
  const calls = mockApi(handlers)
  renderApp(path)
  const post = await screen.findByRole('article', { name: 'Publication de GenZ' })
  return { calls, post, user: userEvent.setup() }
}

test('a visitor likes, changes to another reaction, and removes it', async () => {
  const { calls, post, user } = await openPost({
    ...loggedOut,
    'GET /posts/': page([publicPost(1)]),
    'POST /posts/1/reaction/': (body) => ({ body: summary({ reactions: { [body.kind]: 1 }, my_reaction: body.kind }) }),
    'DELETE /posts/1/reaction/': { body: summary() },
  })
  await user.click(within(post).getByRole('button', { name: /J'aime/ }))
  expect(await within(post).findByLabelText('1 réaction')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST').body).toEqual({ kind: 'like' })

  await user.click(within(post).getByRole('button', { name: 'Choisir une réaction' }))
  // A direct click: the test tool's simulated mouse "leaves" the menu between buttons, which real browsers don't.
  fireEvent.click(within(post).getByRole('button', { name: "J'adore" }))
  expect(await within(post).findByRole('button', { name: /J'adore/, pressed: true })).toBeTruthy()

  await user.click(within(post).getByRole('button', { name: /J'adore/, pressed: true }))
  expect(calls.at(-1).method).toBe('DELETE')
  expect(await within(post).findByRole('button', { name: /J'aime/, pressed: false })).toBeTruthy()
})

test('the summary shows the most used reactions, comments and shares', async () => {
  const { post } = await openPost({
    ...loggedOut,
    'GET /posts/': page([publicPost(1, { interactions: summary({ reactions: { sad: 1, love: 5, like: 3, wow: 2 }, comments: 2, shares: 1 }) })]),
  })
  expect(within(post).getByLabelText('11 réactions').textContent).toContain('❤️👍😮')
  expect(within(post).getByRole('button', { name: '2 commentaires' })).toBeTruthy()
  expect(within(post).getByText('1 partage')).toBeTruthy()
})

test('a visitor reads and writes comments; links in comments are not clickable', async () => {
  const { calls, post, user } = await openPost({
    ...loggedOut,
    'GET /posts/': page([publicPost(1)]),
    'GET /posts/1/comments/': page([comment(1, { body: 'Voir https://example.com' })]),
    'POST /posts/1/comments/': { status: 201, body: comment(2, { name: 'Koffi', body: 'Merci !' }) },
  })
  await user.click(within(post).getByRole('button', { name: /Commenter/ }))
  expect(await within(post).findByText('Voir https://example.com')).toBeTruthy()
  expect(within(post).queryByRole('link', { name: 'https://example.com' })).toBeNull()

  await user.type(within(post).getByLabelText('Votre nom'), 'Koffi')
  await user.type(within(post).getByLabelText('Votre commentaire'), 'Merci !')
  await user.click(within(post).getByRole('button', { name: 'Publier le commentaire' }))
  expect(await within(post).findByText('Merci !')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST').body).toEqual({ name: 'Koffi', body: 'Merci !', website: '' })
  expect(within(post).getByRole('button', { name: '1 commentaire' })).toBeTruthy()
})

test('when comments are off, visitors see a notice and no form', async () => {
  const { post, user } = await openPost({
    ...loggedOut,
    'GET /posts/': page([publicPost(1, { comments_enabled: false })]),
    'GET /posts/1/comments/': page([]),
  })
  await user.click(within(post).getByRole('button', { name: /Commenter/ }))
  expect(await within(post).findByText(/commentaires sont désactivés/)).toBeTruthy()
  expect(within(post).queryByLabelText('Votre commentaire')).toBeNull()
})

test('admins reply as GenZ, delete comments and turn comments off', async () => {
  const { calls, post, user } = await openPost({
    ...loggedInAs(ADMIN),
    'GET /admin/posts/': page([adminPost(1, { interactions: summary({ comments: 1 }) })]),
    'GET /posts/1/comments/': page([comment(5)]),
    'POST /admin/posts/1/comments/': { status: 201, body: comment(6, { name: 'GenZ', is_page: true, body: 'Merci à vous' }) },
    'DELETE /admin/comments/5/': { status: 204 },
    'PATCH /admin/posts/1/comments-enabled/': (body) => ({ body: { comments_enabled: body.enabled } }),
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(within(post).getByRole('button', { name: '1 commentaire' }))
  expect(within(post).queryByLabelText('Votre nom')).toBeNull()

  await user.type(await within(post).findByLabelText('Répondre en tant que GenZ'), 'Merci à vous')
  await user.click(within(post).getByRole('button', { name: 'Répondre en tant que GenZ' }))
  const reply = (await within(post).findByText('Merci à vous')).closest('li')
  expect(within(reply).getByText('Page')).toBeTruthy()

  const first = within(post).getByText('Bravo').closest('li')
  await user.click(within(first).getByRole('button', { name: 'Supprimer' }))
  expect(calls.some((c) => c.method === 'DELETE' && c.path === '/admin/comments/5/')).toBe(true)

  await user.click(within(post).getByRole('button', { name: 'Désactiver les commentaires' }))
  expect(await within(post).findByRole('button', { name: 'Réactiver les commentaires' })).toBeTruthy()
  expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ enabled: false })
})

test('sharing uses the phone share menu and counts the share', async () => {
  const share = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, share })
  const { calls, post, user } = await openPost({
    ...loggedOut,
    'GET /posts/': page([publicPost(1)]),
    'POST /posts/1/share/': { body: summary({ shares: 1 }) },
  })
  await user.click(within(post).getByRole('button', { name: /Partager/ }))
  expect(share).toHaveBeenCalledWith({ title: 'GenZ', url: `${window.location.origin}/p/1/` })
  expect(await within(post).findByText('1 partage')).toBeTruthy()
  expect(calls.some((c) => c.path === '/posts/1/share/')).toBe(true)
})

test('without a share menu the link is copied; cancelling a share counts nothing', async () => {
  const { calls, post, user } = await openPost({ ...loggedOut, 'GET /posts/': page([publicPost(1)]), 'POST /posts/1/share/': { body: summary({ shares: 1 }) } })
  // Installed after the test tool starts, because it replaces the clipboard with its own.
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
  await user.click(within(post).getByRole('button', { name: /Partager/ }))
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/1/`)
  expect(await within(post).findByText('Lien copié.')).toBeTruthy()

  const cancelled = Object.assign(new Error('cancel'), { name: 'AbortError' })
  vi.stubGlobal('navigator', { ...navigator, share: vi.fn(async () => { throw cancelled }) })
  const before = calls.filter((c) => c.path === '/posts/1/share/').length
  await user.click(within(post).getByRole('button', { name: /Partager/ }))
  expect(calls.filter((c) => c.path === '/posts/1/share/').length).toBe(before)
})

test('following asks permission, subscribes the browser and registers it', async () => {
  const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } }) }
  const subscribe = vi.fn(async () => subscription)
  vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: { register: vi.fn(async () => ({})), ready: Promise.resolve({ pushManager: { subscribe } }) },
  })
  const calls = mockApi({
    ...loggedOut,
    'GET /page/': { body: { followers: 4, following: false, push_public_key: 'AQID' } },
    'POST /page/follow/': { body: { followers: 5, following: true } },
  })
  renderApp('/')
  const user = userEvent.setup()
  expect(await screen.findByText(/4 abonnés/)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Suivre la page' }))
  expect(await screen.findByRole('button', { name: 'Ne plus suivre' })).toBeTruthy()
  expect(screen.getByText(/5 abonnés/)).toBeTruthy()
  expect(subscribe.mock.calls[0][0].userVisibleOnly).toBe(true)
  expect([...subscribe.mock.calls[0][0].applicationServerKey]).toEqual([1, 2, 3])
  expect(calls.find((c) => c.path === '/page/follow/').body).toEqual({ subscription: subscription.toJSON() })
})

test('on an iPhone browser tab, following explains how to add the site to the home screen', async () => {
  vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', serviceWorker: undefined })
  mockApi({ ...loggedOut, 'GET /page/': { body: { followers: 0, following: false, push_public_key: 'AQID' } } })
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Suivre la page' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/écran d'accueil/)
})

test("a post's own page opens with its comments", async () => {
  mockApi({ ...loggedOut, 'GET /posts/7/': { body: publicPost(7, { body: 'Publication partagée' }) }, 'GET /posts/7/comments/': page([comment(1)]) })
  renderApp('/publication/7')
  expect(await screen.findByText('Publication partagée')).toBeTruthy()
  expect(await screen.findByText('Bravo')).toBeTruthy()
})

test('a removed post shows a clear message', async () => {
  mockApi({ ...loggedOut, 'GET /posts/8/': { status: 404, body: { detail: 'Publication introuvable.' } } })
  renderApp('/publication/8')
  expect((await screen.findByRole('alert')).textContent).toMatch(/n'existe pas ou a été supprimée/)
})

test('the notification key converts from base64url to bytes', () => {
  expect([...keyToBytes('AQID')]).toEqual([1, 2, 3])
  expect([...keyToBytes('-_8')]).toEqual([251, 255])
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { minutesAgo } from '../test/posts'
import { ADMIN, FakeSocket, loggedInAs, mockApi, OWNER, page, renderApp } from '../test/renderApp'

const AWA = { id: 1, name: 'Awa' }
const KOFFI = { id: 2, name: 'Koffi' }

function text(id, sender, body, extra = {}) {
  return { id, kind: 'text', event: '', sender, target: null, body, created_at: minutesAgo(1), deleted: false, ...extra }
}

function direct(extra = {}) {
  return {
    id: 10, kind: 'direct', title: 'Awa', members: [KOFFI, AWA], manager_id: null,
    read_state: { 1: null, 2: null }, last_message: null, unread: false, ...extra,
  }
}

const me = { ...ADMIN, id: 2, display_name: 'Koffi' }

function messagingApi(extra = {}) {
  return {
    ...loggedInAs(me),
    'GET /messages/unread/': { body: { count: 0 } },
    'GET /messages/conversations/': page([direct({ last_message: text(5, KOFFI, 'À demain') })]),
    'GET /messages/conversations/10/': { body: direct() },
    'GET /messages/conversations/10/messages/': page([text(5, KOFFI, 'À demain'), text(4, AWA, 'Salut Koffi')]),
    'POST /messages/conversations/10/read/': { status: 204 },
    ...extra,
  }
}

test('the header badge shows unread conversations once the live connection opens', async () => {
  mockApi(messagingApi({ 'GET /messages/unread/': { body: { count: 3 } } }))
  renderApp('/admin/administrateurs')
  await screen.findByRole('link', { name: 'Messages' })
  const socket = await FakeSocket.opened()
  expect(socket.url).toBe(`ws://${window.location.host}/ws/messages/`)
  act(() => socket.open())
  expect(await screen.findByRole('link', { name: 'Messages, 3 non lus' })).toBeTruthy()
})

test('the list shows each conversation with a preview, and opening one shows messages oldest first', async () => {
  const calls = mockApi(messagingApi())
  renderApp('/admin/messages')
  const link = await screen.findByRole('link', { name: /Awa/ })
  expect(within(link).getByText('Vous : À demain')).toBeTruthy()

  const user = userEvent.setup()
  await user.click(link)
  const thread = await screen.findByRole('region', { name: 'Conversation : Awa' })
  const bubbles = within(thread).getAllByRole('listitem').map((li) => li.querySelector('.bubble__text').textContent)
  expect(bubbles).toEqual(['Salut Koffi', 'À demain'])
  await waitFor(() => expect(calls.find((c) => c.path === '/messages/conversations/10/read/')?.body).toEqual({ message_id: 5 }))
})

test('writing: Enter sends, Shift + Enter makes a new line', async () => {
  const calls = mockApi(messagingApi({
    'POST /messages/conversations/10/messages/': (body) => ({ status: 201, body: text(6, KOFFI, body.body) }),
  }))
  renderApp('/admin/messages/10')
  const user = userEvent.setup()
  const box = await screen.findByLabelText('Votre message')
  await user.type(box, 'Ligne 1{Shift>}{Enter}{/Shift}Ligne 2')
  expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/messages/'))).toBe(false)
  await user.type(box, '{Enter}')
  expect(await screen.findByText(/Ligne 1\s+Ligne 2/)).toBeTruthy()
  expect(box.value).toBe('')
})

test('"Vu" appears under my last message once the other person has read it, live', async () => {
  mockApi(messagingApi())
  renderApp('/admin/messages/10')
  await screen.findByText('À demain')
  expect(screen.queryByText('Vu')).toBeNull()
  const socket = await FakeSocket.opened()
  act(() => socket.push({ type: 'read', conversation: 10, user_id: 1, message_id: 5 }))
  expect(await screen.findByText('Vu')).toBeTruthy()
})

test('a new message arrives live and is marked read', async () => {
  const calls = mockApi(messagingApi())
  renderApp('/admin/messages/10')
  await screen.findByText('À demain')
  const socket = await FakeSocket.opened()
  act(() => socket.push({ type: 'message', conversation: 10, message: text(7, AWA, 'Tu es là ?') }))
  expect(await screen.findByText('Tu es là ?')).toBeTruthy()
  await waitFor(() => expect(calls.filter((c) => c.path === '/messages/conversations/10/read/').at(-1).body).toEqual({ message_id: 7 }))
})

test('I can delete my own message, not other people\'s', async () => {
  const calls = mockApi(messagingApi({ 'DELETE /messages/messages/5/': { status: 204 } }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderApp('/admin/messages/10')
  const mine = (await screen.findByText('À demain')).closest('li')
  expect(within(screen.getByText('Salut Koffi').closest('li')).queryByRole('button', { name: 'Supprimer' })).toBeNull()
  await userEvent.setup().click(within(mine).getByRole('button', { name: 'Supprimer' }))
  expect(await within(mine).findByText('Message supprimé')).toBeTruthy()
  expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
})

test('group events read as French sentences', async () => {
  const group = { ...direct(), kind: 'group', title: 'Équipe', manager_id: 1, members: [AWA, KOFFI] }
  mockApi(messagingApi({
    'GET /messages/conversations/10/': { body: group },
    'GET /messages/conversations/10/messages/': page([
      { ...text(3, AWA, 'Équipe'), kind: 'event', event: 'renamed' },
      { ...text(2, AWA, ''), kind: 'event', event: 'added', target: KOFFI },
      { ...text(1, AWA, ''), kind: 'event', event: 'created' },
    ]),
  }))
  renderApp('/admin/messages/10')
  expect(await screen.findByText('Awa a créé le groupe.')).toBeTruthy()
  expect(screen.getByText('Awa a ajouté Koffi.')).toBeTruthy()
  expect(screen.getByText('Awa a renommé le groupe « Équipe ».')).toBeTruthy()
})

test('starting a one-on-one conversation opens it', async () => {
  const calls = mockApi(messagingApi({
    'GET /messages/conversations/': page([]),
    'GET /admin/admins/': page([{ id: 2, display_name: 'Koffi' }, { id: 1, display_name: 'Awa' }]),
    'POST /messages/conversations/': { status: 201, body: direct() },
  }))
  renderApp('/admin/messages')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Nouveau' }))
  const form = screen.getByRole('form', { name: 'Nouvelle conversation' })
  expect(within(form).queryByLabelText('Koffi')).toBeNull()
  await user.click(await within(form).findByLabelText('Awa'))
  await user.click(within(form).getByRole('button', { name: 'Écrire' }))
  expect(await screen.findByRole('region', { name: 'Conversation : Awa' })).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST').body).toEqual({ kind: 'direct', user_id: 1 })
})

test('creating a group sends its name and members', async () => {
  const calls = mockApi(messagingApi({
    'GET /messages/conversations/': page([]),
    'GET /admin/admins/': page([{ id: 1, display_name: 'Awa' }, { id: 3, display_name: 'Moussa' }]),
    'POST /messages/conversations/': { status: 201, body: { ...direct(), kind: 'group', title: 'Équipe' } },
    'GET /messages/conversations/10/': { body: { ...direct(), kind: 'group', title: 'Équipe', manager_id: 2 } },
  }))
  renderApp('/admin/messages')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Nouveau' }))
  await user.click(screen.getByLabelText('Groupe'))
  await user.type(screen.getByLabelText('Nom du groupe'), 'Équipe')
  await user.click(await screen.findByLabelText('Awa'))
  await user.click(screen.getByLabelText('Moussa'))
  await user.click(screen.getByRole('button', { name: 'Créer le groupe' }))
  await screen.findByRole('region', { name: 'Conversation : Équipe' })
  expect(calls.find((c) => c.method === 'POST').body).toEqual({ kind: 'group', title: 'Équipe', member_ids: [1, 3] })
})

test('only the group manager sees rename and remove; everyone can leave', async () => {
  const group = { ...direct(), kind: 'group', title: 'Équipe', manager_id: 1, members: [AWA, KOFFI] }
  const calls = mockApi(messagingApi({
    'GET /messages/conversations/10/': { body: group },
    'GET /admin/admins/': page([]),
    'DELETE /messages/conversations/10/members/2/': { status: 204 },
  }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderApp('/admin/messages/10')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Membres' }))
  const settings = screen.getByRole('region', { name: 'Réglages du groupe' })
  expect(within(settings).queryByRole('button', { name: 'Renommer' })).toBeNull()
  expect(within(settings).queryByRole('button', { name: 'Retirer' })).toBeNull()
  await user.click(within(settings).getByRole('button', { name: 'Quitter le groupe' }))
  expect(await screen.findByText('Choisissez une conversation.')).toBeTruthy()
  expect(calls.some((c) => c.method === 'DELETE' && c.path === '/messages/conversations/10/members/2/')).toBe(true)
})

test('the manager can rename and remove members', async () => {
  const group = { ...direct(), kind: 'group', title: 'Équipe', manager_id: 2, members: [KOFFI, AWA] }
  const calls = mockApi(messagingApi({
    'GET /messages/conversations/10/': { body: group },
    'GET /admin/admins/': page([]),
    'PATCH /messages/conversations/10/': (body) => ({ body: { ...group, title: body.title } }),
    'DELETE /messages/conversations/10/members/1/': { status: 204 },
  }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderApp('/admin/messages/10')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Membres' }))
  const settings = screen.getByRole('region', { name: 'Réglages du groupe' })
  await user.clear(within(settings).getByLabelText('Nom du groupe'))
  await user.type(within(settings).getByLabelText('Nom du groupe'), 'Équipe com')
  await user.click(within(settings).getByRole('button', { name: 'Renommer' }))
  await user.click(within(settings).getByRole('button', { name: 'Retirer' }))
  expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ title: 'Équipe com' })
  expect(calls.some((c) => c.method === 'DELETE' && c.path === '/messages/conversations/10/members/1/')).toBe(true)
})

test('the live connection retries after a drop but stops when the session has ended', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
  try {
    mockApi(messagingApi({ ...loggedInAs(OWNER) }))
    renderApp('/admin/activite')
    await screen.findByRole('link', { name: 'Messages' })
    const first = await FakeSocket.opened()
    act(() => first.serverClose(1006))
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(FakeSocket.instances.length).toBe(2)
    act(() => FakeSocket.latest().serverClose(4401))
    await act(() => vi.advanceTimersByTimeAsync(60000))
    expect(FakeSocket.instances.length).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

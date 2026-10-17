import { act, render, screen, userEvent } from '@testing-library/react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AdminContext } from '../admin/AdminContext'
import { LiveMessagesContext } from '../admin/LiveMessagesContext'
import { adminApi } from '../api/admin'
import ConversationsScreen from '../app/admin/messages/index'
import ThreadScreen from '../app/admin/messages/[id]'
import NewConversationScreen from '../app/admin/messages/new'
import { confirm } from '../components/confirm'
import { setOpenConversation } from '../notifications/push'
import { serveWith } from '../testing/serve'

jest.mock('../api/admin', () => ({ adminApi: jest.fn() }))
jest.mock('../components/confirm', () => ({ confirm: jest.fn(async () => true) }))
jest.mock('../notifications/push', () => ({ setOpenConversation: jest.fn() }))

const serve = serveWith(adminApi)
const AWA = { id: 1, display_name: 'Awa', role: 'owner' }
const now = new Date().toISOString()
const text = (id, sender, body) => ({ id, kind: 'text', sender: { id: sender.id, name: sender.display_name }, body, created_at: now })
const KOFFI = { id: 2, display_name: 'Koffi' }

function withAdmin(ui, listeners = new Set()) {
  const live = { unread: 0, refreshUnread: jest.fn(), subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) } }
  return (
    <AdminContext.Provider value={{ user: AWA }}>
      <LiveMessagesContext.Provider value={live}>{ui}</LiveMessagesContext.Provider>
    </AdminContext.Provider>
  )
}

const DIRECT = { id: 10, kind: 'direct', title: 'Koffi', members: [{ id: 1, name: 'Awa' }, { id: 2, name: 'Koffi' }], read_state: { 1: 5, 2: 4 } }

beforeEach(() => {
  jest.clearAllMocks()
  useLocalSearchParams.mockReturnValue({ id: '10' })
})

test('a conversation shows its messages, marks them read, sends, and receives live', async () => {
  const listeners = new Set()
  serve({
    'GET /messages/conversations/10/': DIRECT,
    'GET /messages/conversations/10/messages/': { results: [text(5, AWA, 'À demain'), text(4, KOFFI, 'Salut')], next: null },
    'POST /messages/conversations/10/read/': null,
    'POST /messages/conversations/10/messages/': ({ body }) => text(6, AWA, body),
  })
  const user = userEvent.setup()
  await render(withAdmin(<ThreadScreen />, listeners))
  expect(await screen.findByText('Salut')).toBeOnTheScreen()
  expect(setOpenConversation).toHaveBeenCalledWith(10)
  expect(adminApi).toHaveBeenCalledWith('/messages/conversations/10/read/', { method: 'POST', body: { message_id: 5 } })
  await user.type(screen.getByLabelText('Votre message'), 'Bien reçu')
  await user.press(screen.getByRole('button', { name: 'Envoyer' }))
  expect(await screen.findByText('Bien reçu')).toBeOnTheScreen()
  await act(async () => listeners.forEach((l) => l({ type: 'message', conversation: 10, message: text(7, KOFFI, 'Super') })))
  expect(await screen.findByText('Super')).toBeOnTheScreen()
})

test('"Vu" shows under my last message once the other person read it, live', async () => {
  const listeners = new Set()
  serve({
    'GET /messages/conversations/10/': { ...DIRECT, read_state: { 1: 5, 2: 4 } },
    'GET /messages/conversations/10/messages/': { results: [text(5, AWA, 'À demain')], next: null },
    'POST /messages/conversations/10/read/': null,
  })
  await render(withAdmin(<ThreadScreen />, listeners))
  expect(await screen.findByText('À demain')).toBeOnTheScreen()
  expect(screen.queryByText(/· Vu$/)).not.toBeOnTheScreen()
  await act(async () => listeners.forEach((l) => l({ type: 'read', conversation: 10, user_id: 2, message_id: 5 })))
  expect(await screen.findByText(/· Vu$/)).toBeOnTheScreen()
})

test('my own message can be deleted with a long press', async () => {
  serve({
    'GET /messages/conversations/10/': DIRECT,
    'GET /messages/conversations/10/messages/': { results: [text(5, AWA, 'Oups')], next: null },
    'POST /messages/conversations/10/read/': null,
    'DELETE /messages/messages/5/': null,
  })
  const user = userEvent.setup()
  await render(withAdmin(<ThreadScreen />))
  await user.longPress(await screen.findByText('Oups'))
  expect(confirm).toHaveBeenCalled()
  expect(await screen.findByText('Message supprimé')).toBeOnTheScreen()
})

test('the list shows unread conversations with a preview', async () => {
  serve({
    'GET /messages/conversations/': {
      results: [{ ...DIRECT, unread: true, last_message: text(4, KOFFI, 'Tu es là ?') }], next: null,
    },
  })
  const user = userEvent.setup()
  await render(withAdmin(<ConversationsScreen />))
  expect(await screen.findByRole('button', { name: 'Koffi, non lu' })).toBeOnTheScreen()
  expect(screen.getByText('Tu es là ?')).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Koffi, non lu' }))
  expect(router.push).toHaveBeenCalledWith('/admin/messages/10')
})

test('a new group gets a name and members, then opens', async () => {
  serve({
    'GET /admin/admins/': { results: [AWA, KOFFI, { id: 3, display_name: 'Moussa' }], next: null },
    'POST /messages/conversations/': (body) => ({ id: 11, ...body }),
  })
  const user = userEvent.setup()
  await render(withAdmin(<NewConversationScreen />))
  await user.press(await screen.findByRole('radio', { name: 'Groupe' }))
  await user.type(screen.getByLabelText('Nom du groupe'), 'Équipe')
  await user.press(screen.getByRole('checkbox', { name: 'Koffi' }))
  await user.press(screen.getByRole('checkbox', { name: 'Moussa' }))
  expect(screen.queryByRole('checkbox', { name: 'Awa' })).not.toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Créer le groupe' }))
  expect(adminApi).toHaveBeenCalledWith('/messages/conversations/', {
    method: 'POST', body: { kind: 'group', title: 'Équipe', member_ids: [2, 3] },
  })
  expect(router.replace).toHaveBeenCalledWith('/admin/messages/11')
})

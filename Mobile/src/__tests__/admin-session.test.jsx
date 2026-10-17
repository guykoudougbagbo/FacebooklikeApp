import { render, screen, userEvent, waitFor } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Text } from 'react-native'
import { AdminContext, useAdmin } from '../admin/AdminContext'
import { AdminProvider } from '../admin/AdminProvider'
import { adminApi, liveConnection, whenLoginEnds } from '../api/admin'
import * as adminKey from '../api/adminKey'
import AdminButton from '../components/admin/AdminButton'
import { expoPushToken } from '../notifications/push'

jest.mock('../api/adminKey', () => {
  let stored = null
  return {
    load: jest.fn(async () => stored),
    save: jest.fn(async (value) => {
      stored = value
    }),
    forget: jest.fn(async () => {
      stored = null
    }),
  }
})
jest.mock('../notifications/push', () => ({ expoPushToken: jest.fn() }))

function answers(...list) {
  global.fetch = jest.fn()
  for (const [status, body] of list) {
    global.fetch.mockResolvedValueOnce({ status, ok: status < 400, json: async () => body })
  }
}
const sent = (i) => ({ url: global.fetch.mock.calls[i][0], ...global.fetch.mock.calls[i][1] })
const OWNER = { id: 1, display_name: 'Awa', role: 'owner' }

beforeEach(async () => {
  await adminKey.forget()
  jest.clearAllMocks()
})

describe('adminApi', () => {
  test('login steps go out without a key; afterwards every call carries it', async () => {
    answers([200, { next: 'verify', ticket: 't' }], [200, OWNER])
    await adminApi('/app/auth/login/', { method: 'POST', body: { email: 'a@b.c', password: 'x' } })
    expect(sent(0).headers.Authorization).toBeUndefined()
    await adminKey.save('k1')
    await adminApi('/auth/me/')
    expect(sent(1).headers.Authorization).toBe('Bearer k1')
  })

  test('uploads go as multipart, with no JSON type', async () => {
    await adminKey.save('k1')
    answers([201, { id: 3 }])
    const form = new FormData()
    form.append('body', 'Salut')
    await adminApi('/admin/posts/', { method: 'POST', body: form })
    expect(sent(0).body).toBe(form)
    expect(sent(0).headers['Content-Type']).toBeUndefined()
  })

  test('an ended login tells the app, which forgets it', async () => {
    const ended = jest.fn()
    whenLoginEnds(ended)
    await adminKey.save('k1')
    answers([401, { detail: 'Votre session a expiré. Reconnectez-vous.' }])
    await expect(adminApi('/auth/me/')).rejects.toThrow('Votre session a expiré')
    expect(ended).toHaveBeenCalled()
  })

  test('the live connection names the server as its origin and logs in with the key', async () => {
    await adminKey.save('k1')
    expect(await liveConnection()).toEqual({
      url: 'wss://api.test/ws/messages/',
      headers: { Authorization: 'Bearer k1', origin: 'https://api.test' },
    })
  })
})

function Who() {
  const { user, logOut } = useAdmin()
  if (user === undefined) return <Text>Vérification</Text>
  return <Text onPress={logOut}>{user ? `Connecté : ${user.display_name}` : 'Personne'}</Text>
}

describe('AdminProvider', () => {
  test('nobody is logged in without a saved key', async () => {
    await render(<AdminProvider><Who /></AdminProvider>)
    expect(await screen.findByText('Personne')).toBeOnTheScreen()
  })

  test('a saved key that still works logs the admin in and asks for message notifications', async () => {
    await adminKey.save('k1')
    expoPushToken.mockResolvedValue('ExponentPushToken[abc]')
    answers([200, OWNER], [204, null])
    await render(<AdminProvider><Who /></AdminProvider>)
    expect(await screen.findByText('Connecté : Awa')).toBeOnTheScreen()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(sent(1)).toMatchObject({ url: 'https://api.test/api/app/auth/push-token/', method: 'PUT' })
    expect(JSON.parse(sent(1).body)).toEqual({ expo_token: 'ExponentPushToken[abc]' })
  })

  test('a key the server no longer accepts is forgotten', async () => {
    await adminKey.save('old')
    answers([401, { detail: 'Votre session a expiré. Reconnectez-vous.' }])
    await render(<AdminProvider><Who /></AdminProvider>)
    expect(await screen.findByText('Personne')).toBeOnTheScreen()
    expect(await adminKey.load()).toBeNull()
  })

  test('logging out tells the server and forgets the key', async () => {
    await adminKey.save('k1')
    expoPushToken.mockRejectedValue(new Error('Expo Go'))
    answers([200, OWNER], [204, null])
    const user = userEvent.setup()
    await render(<AdminProvider><Who /></AdminProvider>)
    await user.press(await screen.findByText('Connecté : Awa'))
    expect(await screen.findByText('Personne')).toBeOnTheScreen()
    expect(sent(1)).toMatchObject({ url: 'https://api.test/api/app/auth/logout/', method: 'POST' })
    expect(await adminKey.load()).toBeNull()
  })
})

test('the Admin button exists only for an admin logged in on this phone', async () => {
  const user = userEvent.setup()
  const { rerender } = await render(<AdminContext.Provider value={{ user: null }}><AdminButton /></AdminContext.Provider>)
  expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeOnTheScreen()
  await rerender(<AdminContext.Provider value={{ user: OWNER }}><AdminButton /></AdminContext.Provider>)
  await user.press(screen.getByRole('button', { name: 'Admin' }))
  expect(router.push).toHaveBeenCalledWith('/admin')
})

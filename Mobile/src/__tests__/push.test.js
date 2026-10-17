import * as Notifications from 'expo-notifications'
import { expoPushToken, notificationTarget, PushUnavailable, setOpenConversation, shouldShow } from '../notifications/push'

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}))

const tap = (url, action = Notifications.DEFAULT_ACTION_IDENTIFIER) => ({
  actionIdentifier: action,
  notification: { request: { content: { data: { url } } } },
})

test('a tapped notification only ever opens a post or an admin conversation', () => {
  expect(notificationTarget(tap('/publication/12'))).toBe('/publication/12')
  expect(notificationTarget(tap('/admin/messages/5'))).toBe('/admin/messages/5')
  expect(notificationTarget(tap('/admin/team'))).toBeNull()
  expect(notificationTarget(tap('https://evil.example'))).toBeNull()
  expect(notificationTarget(tap('/publication/12/../admin'))).toBeNull()
  expect(notificationTarget(tap('/publication/12', 'other-action'))).toBeNull()
  expect(notificationTarget(null)).toBeNull()
})

test('asks permission, then returns the Expo token for this project', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
  Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' })
  Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' })
  await expect(expoPushToken()).resolves.toBe('ExponentPushToken[abc]')
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' })
})

test('explains when notifications are refused', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' })
  Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' })
  await expect(expoPushToken()).rejects.toThrow(PushUnavailable)
  await expect(expoPushToken()).rejects.toThrow('Autorisez les notifications')
})

test('a message notification stays quiet while its conversation is on screen', () => {
  const about = (url) => ({ request: { content: { data: { url } } } })
  setOpenConversation(5)
  expect(shouldShow(about('/admin/messages/5'))).toBe(false)
  expect(shouldShow(about('/admin/messages/6'))).toBe(true)
  expect(shouldShow(about('/publication/5'))).toBe(true)
  setOpenConversation(null)
  expect(shouldShow(about('/admin/messages/5'))).toBe(true)
})


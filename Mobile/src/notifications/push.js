import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { EAS_PROJECT_ID } from '../config'

export class PushUnavailable extends Error {}

// The server sends without a channel; Android then uses this one (defaultChannel in app.config.js).
const CHANNEL = 'default'
// Notifications can only ever open a post, or (for admins) a conversation.
const ALLOWED_PATH = /^\/(publication|admin\/messages)\/\d+$/

// The conversation on screen right now: its own notifications would only repeat what the admin is reading.
let openConversation = null

export function setOpenConversation(id) {
  openConversation = id
}

/** Whether to show a notification that arrives while the app is open. */
export function shouldShow(notification) {
  const url = notification?.request?.content?.data?.url
  return !(openConversation !== null && url === `/admin/messages/${openConversation}`)
}

/** Asks permission and returns this phone's Expo push token. */
export async function expoPushToken() {
  if (!EAS_PROJECT_ID) {
    throw new PushUnavailable("Les notifications ne sont pas encore disponibles dans cette version de l'application.")
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Nouvelles publications',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
  let { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync())
  if (status !== 'granted') {
    throw new PushUnavailable('Autorisez les notifications de GenZ dans les réglages du téléphone pour suivre la page.')
  }
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data
  } catch {
    throw new PushUnavailable("Impossible d'activer les notifications sur ce téléphone pour le moment.")
  }
}

/** Where a tapped notification leads: only to a post's screen or an admin conversation. */
export function notificationTarget(response) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null
  const url = response.notification?.request?.content?.data?.url
  return typeof url === 'string' && ALLOWED_PATH.test(url) ? url : null
}

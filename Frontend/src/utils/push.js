import { api } from '../api/client'

export class PushUnavailable extends Error {}

function isIPhone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

/** The browser's subscribe call wants the key as bytes, not base64url text. */
export function keyToBytes(base64url) {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration() {
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

/** Asks permission, subscribes this browser, and registers it as a follower. */
export async function followPage(publicKey) {
  if (!supported()) {
    throw new PushUnavailable(
      isIPhone() && !isInstalled()
        ? "Sur iPhone, ajoutez d'abord le site à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), puis ouvrez-le depuis l'icône."
        : 'Votre navigateur ne permet pas les notifications.',
    )
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new PushUnavailable('Les notifications sont bloquées. Autorisez-les dans les réglages de votre navigateur.')
  }
  const reg = await registration()
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) })
  return api('/page/follow/', { method: 'POST', body: { subscription: subscription.toJSON() } })
}

export async function unfollowPage() {
  if (supported()) {
    const reg = await navigator.serviceWorker.getRegistration()
    const subscription = await reg?.pushManager.getSubscription()
    await subscription?.unsubscribe()
  }
  return api('/page/follow/', { method: 'DELETE' })
}

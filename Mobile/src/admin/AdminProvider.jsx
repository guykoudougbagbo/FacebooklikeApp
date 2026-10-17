import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi, whenLoginEnds } from '../api/admin'
import * as adminKey from '../api/adminKey'
import { expoPushToken } from '../notifications/push'
import { AdminContext } from './AdminContext'

/** Asks for message notifications on this phone. Optional: without them (Expo Go, refused) the rest works. */
async function registerForMessages() {
  try {
    await adminApi('/app/auth/push-token/', { method: 'PUT', body: { expo_token: await expoPushToken() } })
  } catch {
    // Notifications are a bonus; nothing to show the admin here.
  }
}

/** Who is logged in as an admin on this phone: undefined while checking, null when nobody. */
export function AdminProvider({ children }) {
  const [user, setUser] = useState(undefined)

  const forget = useCallback(async () => {
    await adminKey.forget()
    setUser(null)
  }, [])

  useEffect(() => {
    whenLoginEnds(forget)
    let active = true
    adminKey.load().then(async (key) => {
      if (!key) return active && setUser(null)
      try {
        const me = await adminApi('/auth/me/')
        if (active) setUser(me)
        registerForMessages()
      } catch (err) {
        // Offline: keep the key and try again next time; any other answer means the login is gone.
        if (err.status === 0) return active && setUser(null)
        await forget()
      }
    })
    return () => {
      active = false
    }
  }, [forget])

  const logIn = useCallback(async (key, me) => {
    await adminKey.save(key)
    setUser(me)
    registerForMessages()
  }, [])

  const logOut = useCallback(async () => {
    try {
      await adminApi('/app/auth/logout/', { method: 'POST' })
    } catch {
      // Logged out on the phone either way; the server ends unused logins by itself.
    }
    await forget()
  }, [forget])

  const value = useMemo(() => ({ user, logIn, logOut }), [user, logIn, logOut])
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

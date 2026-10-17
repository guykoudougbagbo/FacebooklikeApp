import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminApi, liveConnection } from '../api/admin'
import { useAdmin } from './AdminContext'
import { LiveMessagesContext } from './LiveMessagesContext'

const FIRST_RETRY_MS = 1000
const LONGEST_RETRY_MS = 30000
// The server closes with these when trying again is pointless: login ended (4401) or not allowed (4403).
const LOGIN_ENDED = 4401
const NOT_ALLOWED = 4403

/** One live connection while an admin is logged in on this phone, and the unread count, like on the website. */
export function LiveMessagesProvider({ children }) {
  const { user, logOut } = useAdmin()
  const [unread, setUnread] = useState(0)
  const listeners = useRef(new Set())

  const refreshUnread = useCallback(() => {
    adminApi('/messages/unread/').then(({ count }) => setUnread(count), () => {})
  }, [])

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  useEffect(() => {
    if (!user) return undefined
    let socket = null
    let stopped = false
    let retryMs = FIRST_RETRY_MS
    let retryTimer = null

    async function open() {
      const { url, headers } = await liveConnection()
      if (stopped) return
      socket = new WebSocket(url, null, { headers })
      socket.onopen = () => {
        retryMs = FIRST_RETRY_MS
        refreshUnread()
      }
      socket.onmessage = (message) => {
        const event = JSON.parse(message.data)
        if (event.type !== 'read' || event.user_id === user.id) refreshUnread()
        listeners.current.forEach((listener) => listener(event))
      }
      socket.onclose = (closed) => {
        if (stopped || closed.code === NOT_ALLOWED) return
        if (closed.code === LOGIN_ENDED) {
          logOut()
          return
        }
        retryTimer = setTimeout(open, retryMs)
        retryMs = Math.min(retryMs * 2, LONGEST_RETRY_MS)
      }
    }

    refreshUnread()
    open()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      socket?.close()
    }
  }, [user, logOut, refreshUnread])

  const value = useMemo(() => ({ unread: user ? unread : 0, refreshUnread, subscribe }), [user, unread, refreshUnread, subscribe])
  return <LiveMessagesContext.Provider value={value}>{children}</LiveMessagesContext.Provider>
}

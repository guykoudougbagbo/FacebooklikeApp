import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MessagingContext } from './MessagingContext'

// Close codes after which reconnecting is pointless.
const STOP_CODES = new Set([4401, 4403])
const FIRST_RETRY_MS = 1000
const LONGEST_RETRY_MS = 30000

function socketUrl() {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws/messages/`
}

/** Keeps one live connection open while an admin is logged in, and the unread count up to date. */
export function MessagingProvider({ children }) {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)
  const listeners = useRef(new Set())

  const refreshUnread = useCallback(() => {
    api('/messages/unread/').then(({ count }) => setUnread(count), () => {})
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

    function open() {
      socket = new WebSocket(socketUrl())
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
        if (stopped || STOP_CODES.has(closed.code)) return
        retryTimer = setTimeout(open, retryMs)
        retryMs = Math.min(retryMs * 2, LONGEST_RETRY_MS)
      }
    }

    open()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      socket?.close()
    }
  }, [user, refreshUnread])

  const value = useMemo(() => ({ unread: user ? unread : 0, refreshUnread, subscribe }), [user, unread, refreshUnread, subscribe])
  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
}

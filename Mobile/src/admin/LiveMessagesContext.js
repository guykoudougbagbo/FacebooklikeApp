import { createContext, useContext, useEffect, useRef } from 'react'

export const LiveMessagesContext = createContext({ unread: 0, refreshUnread: () => {}, subscribe: () => () => {} })

export function useLiveMessages() {
  return useContext(LiveMessagesContext)
}

/** Calls `listener` for every live event while the screen is shown. */
export function useMessagingEvents(listener) {
  const { subscribe } = useLiveMessages()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  }, [listener])
  useEffect(() => subscribe((event) => latest.current(event)), [subscribe])
}

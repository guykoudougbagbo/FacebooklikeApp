import { createContext, useContext, useEffect } from 'react'

export const MessagingContext = createContext({ unread: 0, refreshUnread: () => {}, subscribe: () => () => {} })

export function useMessaging() {
  return useContext(MessagingContext)
}

/** Calls listener(event) for every live messaging event while the component is shown. */
export function useMessagingEvents(listener) {
  const { subscribe } = useMessaging()
  useEffect(() => subscribe(listener), [subscribe, listener])
}

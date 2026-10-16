import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  // undefined while loading, null when logged out.
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    let active = true
    api('/auth/me/').then(
      (me) => active && setUser(me),
      () => active && setUser(null),
    )
    return () => {
      active = false
    }
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout/', { method: 'POST' })
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, setUser, logout }), [user, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

import { useCallback, useMemo, useState } from 'react'
import { VisitorViewContext } from './VisitorViewContext'

const KEY = 'visitorView'

function remembered() {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Lets a logged-in admin see the site exactly as visitors do, for this browser tab. */
export function VisitorViewProvider({ children }) {
  const [visitorView, setState] = useState(remembered)

  const setVisitorView = useCallback((on) => {
    setState(on)
    try {
      if (on) sessionStorage.setItem(KEY, '1')
      else sessionStorage.removeItem(KEY)
    } catch {
      // Storage can be blocked (private windows); the switch still works until the tab closes.
    }
  }, [])

  const value = useMemo(() => ({ visitorView, setVisitorView }), [visitorView, setVisitorView])
  return <VisitorViewContext.Provider value={value}>{children}</VisitorViewContext.Provider>
}

import { createContext, useContext } from 'react'

export const VisitorViewContext = createContext({ visitorView: false, setVisitorView: () => {} })

export function useVisitorView() {
  return useContext(VisitorViewContext)
}

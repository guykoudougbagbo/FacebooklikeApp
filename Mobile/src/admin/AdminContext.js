import { createContext, useContext } from 'react'

export const AdminContext = createContext({ user: null, logIn: async () => {}, logOut: async () => {} })

export function useAdmin() {
  return useContext(AdminContext)
}

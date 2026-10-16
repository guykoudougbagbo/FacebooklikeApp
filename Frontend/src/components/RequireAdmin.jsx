import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Loading } from './ui'

export default function RequireAdmin() {
  const { user } = useAuth()
  if (user === undefined) return <Loading />
  if (user === null) return <Navigate to="/connexion" replace />
  return <Outlet />
}

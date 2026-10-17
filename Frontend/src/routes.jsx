import { Navigate } from 'react-router'
import Layout from './components/Layout'
import RequireAdmin from './components/RequireAdmin'
import ActivityPage from './pages/ActivityPage'
import AdminsPage from './pages/AdminsPage'
import HomePage from './pages/HomePage'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
import PostPage from './pages/PostPage'
import SetupPage from './pages/SetupPage'
import VerifyPage from './pages/VerifyPage'

export const routes = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/publication/:postId', element: <PostPage /> },
      { path: '/connexion', element: <LoginPage /> },
      { path: '/connexion/code', element: <VerifyPage /> },
      { path: '/connexion/securite', element: <SetupPage /> },
      { path: '/invitation', element: <InvitePage /> },
      {
        path: '/admin',
        element: <RequireAdmin />,
        children: [
          { index: true, element: <Navigate to="/admin/administrateurs" replace /> },
          { path: 'administrateurs', element: <AdminsPage /> },
          { path: 'activite', element: <ActivityPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

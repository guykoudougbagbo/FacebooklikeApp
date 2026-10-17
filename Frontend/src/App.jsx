import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { MessagingProvider } from './messaging/MessagingProvider'
import { routes } from './routes'

const router = createBrowserRouter(routes)

function App() {
  return (
    <AuthProvider>
      <MessagingProvider>
        <RouterProvider router={router} />
      </MessagingProvider>
    </AuthProvider>
  )
}

export default App

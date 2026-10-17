import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { VisitorViewProvider } from './auth/VisitorView'
import { MessagingProvider } from './messaging/MessagingProvider'
import { routes } from './routes'

const router = createBrowserRouter(routes)

function App() {
  return (
    <AuthProvider>
      <VisitorViewProvider>
        <MessagingProvider>
          <RouterProvider router={router} />
        </MessagingProvider>
      </VisitorViewProvider>
    </AuthProvider>
  )
}

export default App

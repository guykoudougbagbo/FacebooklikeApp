import { Outlet } from 'react-router'
import Header from './Header'
import './Layout.css'

export default function Layout() {
  return (
    <>
      <div className="page-backdrop" aria-hidden="true" />
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  )
}

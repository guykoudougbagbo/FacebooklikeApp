import { Link, NavLink, useNavigate } from 'react-router'
import logo from '../assets/brand/genz-logo.jpg'
import { useAuth } from '../auth/AuthContext'
import './Header.css'

function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    // Leave the admin area first; otherwise it redirects to the login page as soon as the user is cleared.
    navigate('/')
    await logout()
  }

  return (
    <header className="site-header">
      <Link to="/" className="site-header__home">
        <img
          src={logo}
          className="site-header__logo"
          alt="GenZ – La génération qui dit non"
        />
      </Link>
      {user && (
        <nav className="site-header__nav" aria-label="Espace administrateur">
          <NavLink to="/admin/administrateurs">Administrateurs</NavLink>
          <NavLink to="/admin/activite">Activité</NavLink>
          <span className="site-header__user">{user.display_name}</span>
          <button type="button" className="site-header__logout" onClick={handleLogout}>
            Se déconnecter
          </button>
        </nav>
      )}
    </header>
  )
}

export default Header

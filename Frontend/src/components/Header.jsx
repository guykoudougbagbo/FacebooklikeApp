import { Link, NavLink, useNavigate } from 'react-router'
import logo from '../assets/brand/genz-logo.jpg'
import { useAuth } from '../auth/AuthContext'
import { useVisitorView } from '../auth/VisitorViewContext'
import { useMessaging } from '../messaging/MessagingContext'
import './Header.css'

function Header() {
  const { user, logout } = useAuth()
  const { unread } = useMessaging()
  const { visitorView, setVisitorView } = useVisitorView()
  const navigate = useNavigate()

  function seeAsVisitor() {
    setVisitorView(true)
    navigate('/')
  }

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
      {user && visitorView && (
        <div className="site-header__visitor" role="status">
          <span>Vous voyez la page comme un visiteur.</span>
          <button type="button" className="site-header__logout" onClick={() => setVisitorView(false)}>
            Revenir à l'espace administrateur
          </button>
        </div>
      )}
      {user && !visitorView && (
        <nav className="site-header__nav" aria-label="Espace administrateur">
          <NavLink to="/admin/administrateurs">Administrateurs</NavLink>
          <NavLink to="/admin/activite">Activité</NavLink>
          <NavLink to="/admin/messages" aria-label={unread ? `Messages, ${unread} non lus` : 'Messages'}>
            Messages{unread > 0 && <span className="site-header__badge" aria-hidden="true">{unread}</span>}
          </NavLink>
          <button type="button" className="site-header__logout" onClick={seeAsVisitor}>Voir comme un visiteur</button>
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

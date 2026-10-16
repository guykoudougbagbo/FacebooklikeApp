import logo from '../assets/brand/genz-logo.jpg'
import './Header.css'

function Header() {
  return (
    <header className="site-header">
      <a href="/" className="site-header__home">
        <img
          src={logo}
          className="site-header__logo"
          alt="GenZ – La génération qui dit non"
        />
      </a>
    </header>
  )
}

export default Header

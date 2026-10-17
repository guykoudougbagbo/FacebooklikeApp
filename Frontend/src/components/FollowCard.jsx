import { useEffect, useState } from 'react'
import { api } from '../api/client'
import logo from '../assets/brand/genz-logo.jpg'
import { followPage, unfollowPage } from '../utils/push'
import { plural } from '../utils/reactions'
import { Button, ErrorMessage } from './ui'
import './Interactions.css'

export default function FollowCard() {
  const [page, setPage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api('/page/').then((info) => active && setPage(info), () => {})
    return () => {
      active = false
    }
  }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      const info = page.following ? await unfollowPage() : await followPage(page.push_public_key)
      setPage((current) => ({ ...current, ...info }))
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!page) return null

  return (
    <section className="follow" aria-label="La page GenZ">
      <img src={logo} alt="" className="follow__logo" />
      <div className="follow__text">
        <strong>GenZ</strong>
        <span>La génération qui dit non · {plural(page.followers, 'abonné', 'abonnés')}</span>
      </div>
      <Button variant={page.following ? 'secondary' : 'primary'} busy={busy} onClick={toggle}>
        {page.following ? 'Ne plus suivre' : 'Suivre la page'}
      </Button>
      <ErrorMessage>{error}</ErrorMessage>
    </section>
  )
}

import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import { Button, Card, ErrorMessage, Loading } from '../components/ui'
import { usePagedList } from '../utils/usePagedList'
import './HomePage.css'

const PROCESSING_POLL_MS = 3000

function isProcessing(post) {
  return post.status === 'processing' || post.media.some((m) => m.status === 'pending')
}

/** Refreshes posts whose photos or videos are still being prepared, until they're done. */
function useProcessingRefresh(feed, enabled) {
  const { items, replaceItem } = feed

  useEffect(() => {
    const waiting = enabled ? (items ?? []).filter(isProcessing) : []
    if (!waiting.length) return undefined
    // Each refreshed post changes `items`, which schedules the next check.
    const timer = setTimeout(() => {
      waiting.forEach((post) => api(`/admin/posts/${post.id}/`).then(replaceItem, () => {}))
    }, PROCESSING_POLL_MS)
    return () => clearTimeout(timer)
  }, [enabled, items, replaceItem])
}

/** Loads the next page when the end of the feed scrolls into view. */
function useLoadMoreOnScroll(feed) {
  const sentinel = useRef(null)
  const { hasMore, loadingMore, loadMore } = feed

  useEffect(() => {
    if (!hasMore || loadingMore || !sentinel.current || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    }, { rootMargin: '400px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])

  return sentinel
}

function Feed({ admin }) {
  const feed = usePagedList(admin ? '/admin/posts/' : '/posts/')
  const sentinel = useLoadMoreOnScroll(feed)
  useProcessingRefresh(feed, admin)

  return (
    <div className="feed">
      {admin && (
        <section className="post" aria-label="Nouvelle publication">
          <PostComposer onSaved={feed.prependItem} />
        </section>
      )}
      <ErrorMessage>{feed.error}</ErrorMessage>
      {feed.items === null ? <Loading /> : feed.items.length === 0 ? (
        <Card title="Bienvenue">
          <p>Les publications de la page apparaîtront ici très bientôt.</p>
        </Card>
      ) : (
        feed.items.map((post) => (
          <PostCard key={post.id} post={post} admin={admin} onChanged={feed.replaceItem} onDeleted={feed.removeItem} />
        ))
      )}
      <div ref={sentinel} />
      {feed.hasMore && (
        <div className="feed__more">
          <Button variant="secondary" busy={feed.loadingMore} onClick={feed.loadMore}>Voir plus</Button>
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  if (user === undefined) return <Loading />
  // A new key when logging in or out, so the right feed loads from the start.
  return <Feed key={user ? 'admin' : 'public'} admin={Boolean(user)} />
}

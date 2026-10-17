import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api/client'
import PostCard from '../components/PostCard'
import { Card, ErrorMessage, Loading } from '../components/ui'
import './HomePage.css'

/** One post on its own page: where shared links and notifications lead. */
export default function PostPage() {
  const { postId } = useParams()
  const [post, setPost] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api(`/posts/${postId}/`).then(
      (found) => active && setPost(found),
      (err) => active && setError(err.status === 404 ? "Cette publication n'existe pas ou a été supprimée." : err.message),
    )
    return () => {
      active = false
    }
  }, [postId])

  if (error) {
    return (
      <Card title="Publication">
        <ErrorMessage>{error}</ErrorMessage>
        <p><Link to="/">Voir toutes les publications</Link></p>
      </Card>
    )
  }
  if (!post) return <Loading />
  return (
    <div className="feed">
      <PostCard post={post} commentsOpen />
      <p className="feed__more"><Link to="/">Voir toutes les publications</Link></p>
    </div>
  )
}

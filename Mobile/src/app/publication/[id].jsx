import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../api/client'
import Backdrop from '../../components/Backdrop'
import { Comment, CommentForm, CommentsClosed } from '../../components/Comments'
import PostCard from '../../components/PostCard'
import { Button, ErrorText } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'

const NOT_FOUND = 'Publication introuvable.'

function Post({ id }) {
  const [post, setPost] = useState(null)
  const [error, setError] = useState('')
  const comments = usePagedList(`/posts/${id}/comments/`)
  const list = useRef(null)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    let active = true
    api(`/posts/${id}/`).then((found) => active && setPost(found), (err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [id])

  if (!post) return error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color="#fff" style={styles.loading} />

  function added(comment) {
    comments.addItem(comment)
    setPost((p) => ({ ...p, interactions: { ...p.interactions, comments: p.interactions.comments + 1 } }))
  }

  // Comments read oldest first, like Facebook.
  const ordered = [...(comments.items ?? [])].sort((a, b) => a.id - b.id)

  return (
    <FlatList
      ref={list}
      data={ordered}
      keyExtractor={(comment) => String(comment.id)}
      renderItem={({ item }) => <Comment comment={item} />}
      ListHeaderComponent={
        <View style={styles.post}>
          <PostCard post={post} onChange={setPost} onComment={() => list.current?.scrollToEnd()} />
        </View>
      }
      ListFooterComponent={
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {comments.hasMore && (
            <Button variant="secondary" busy={comments.loadingMore} onPress={comments.loadMore}>Voir plus de commentaires</Button>
          )}
          <ErrorText>{comments.error}</ErrorText>
          {post.comments_enabled ? <CommentForm postId={post.id} onAdded={added} /> : <CommentsClosed />}
        </View>
      }
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
    />
  )
}

export default function PostScreen() {
  const { id } = useLocalSearchParams()
  return (
    <Backdrop>
      {/^\d+$/.test(String(id)) ? <Post id={id} /> : <ErrorText>{NOT_FOUND}</ErrorText>}
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  list: { padding: 8 },
  post: { marginBottom: 12 },
  footer: { gap: 8, marginHorizontal: 4, marginTop: 4 },
  loading: { marginVertical: 24 },
})

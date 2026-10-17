import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { adminApi } from '../../../api/admin'
import AdminPostCard from '../../../components/admin/AdminPostCard'
import Backdrop from '../../../components/Backdrop'
import { Comment, CommentsClosed } from '../../../components/Comments'
import { confirm } from '../../../components/confirm'
import { Button, ErrorText } from '../../../components/ui'
import { usePagedList } from '../../../hooks/usePagedList'
import { useTheme } from '../../../theme'

function ReplyForm({ postId, onAdded }) {
  const theme = useTheme()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    try {
      onAdded(await adminApi(`/admin/posts/${postId}/comments/`, { method: 'POST', body: { body } }))
      setBody('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <View style={styles.form}>
      <ErrorText>{error}</ErrorText>
      <TextInput accessibilityLabel="Répondre en tant que GenZ" placeholder="Répondre en tant que GenZ…"
        placeholderTextColor={theme.text} value={body} onChangeText={setBody} multiline maxLength={1000}
        style={[styles.input, { color: theme.textStrong, backgroundColor: theme.surfaceMuted }]} />
      <Button busy={busy} disabled={!body.trim()} onPress={submit}>Répondre en tant que GenZ</Button>
    </View>
  )
}

function Moderation({ id }) {
  const [post, setPost] = useState(null)
  const [error, setError] = useState('')
  const comments = usePagedList(`/posts/${id}/comments/`)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    adminApi(`/admin/posts/${id}/`).then(setPost, (err) => setError(err.message))
  }, [id])

  if (!post) return error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color="#fff" style={styles.loading} />

  const changeCount = (delta) =>
    setPost((p) => ({ ...p, interactions: { ...p.interactions, comments: p.interactions.comments + delta } }))

  async function remove(comment) {
    if (!(await confirm('Supprimer ce commentaire ?', comment.body.slice(0, 120), 'Supprimer'))) return
    setError('')
    try {
      await adminApi(`/admin/comments/${comment.id}/`, { method: 'DELETE' })
      comments.removeItem(comment.id)
      changeCount(-1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggle() {
    setError('')
    try {
      const { comments_enabled: enabled } = await adminApi(`/admin/posts/${id}/comments-enabled/`, {
        method: 'PATCH', body: { enabled: !post.comments_enabled },
      })
      setPost((p) => ({ ...p, comments_enabled: enabled }))
    } catch (err) {
      setError(err.message)
    }
  }

  // Comments read oldest first, like Facebook.
  const ordered = [...(comments.items ?? [])].sort((a, b) => a.id - b.id)

  return (
    <FlatList
      data={ordered}
      keyExtractor={(comment) => String(comment.id)}
      renderItem={({ item }) => (
        <View>
          <Comment comment={item} />
          <View style={styles.commentAction}>
            <Button variant="danger" onPress={() => remove(item)}>Supprimer</Button>
          </View>
        </View>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <AdminPostCard post={post} onChange={setPost} onDeleted={() => setError('Cette publication a été supprimée.')} />
          <ErrorText>{error || comments.error}</ErrorText>
          <Button variant="secondary" onPress={toggle}>
            {post.comments_enabled ? 'Désactiver les commentaires' : 'Réactiver les commentaires'}
          </Button>
        </View>
      }
      ListFooterComponent={
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {comments.hasMore && (
            <Button variant="secondary" busy={comments.loadingMore} onPress={comments.loadMore}>Voir plus de commentaires</Button>
          )}
          {!post.comments_enabled && <CommentsClosed />}
          <ReplyForm postId={post.id} onAdded={(comment) => { comments.addItem(comment); changeCount(1) }} />
        </View>
      }
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
    />
  )
}

export default function ModerationScreen() {
  const { id } = useLocalSearchParams()
  return (
    <Backdrop>
      {/^\d+$/.test(String(id)) ? <Moderation id={id} /> : <ErrorText>Publication introuvable.</ErrorText>}
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  list: { padding: 8 },
  header: { gap: 8, marginBottom: 12 },
  commentAction: { alignItems: 'flex-start', marginLeft: 12, marginBottom: 10 },
  footer: { gap: 8, marginTop: 4 },
  form: { gap: 8 },
  input: { minHeight: 70, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, textAlignVertical: 'top' },
  loading: { marginVertical: 24 },
})

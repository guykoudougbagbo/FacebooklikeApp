import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { adminApi } from '../../api/admin'
import { useTheme } from '../../theme'
import PostCard from '../PostCard'
import { confirm } from '../confirm'
import { Button, ErrorText, Notice } from '../ui'

function Status({ post }) {
  const pending = post.media.filter((m) => m.status === 'pending').length
  const failed = post.media.filter((m) => m.status === 'failed').length
  return (
    <>
      {post.status === 'processing' && <Notice>Publication en cours… Les photos et vidéos sont en préparation.</Notice>}
      {post.status === 'failed' && (
        <ErrorText>Échec de la publication : aucune photo ni vidéo n'a pu être traitée. Supprimez-la et réessayez.</ErrorText>
      )}
      {post.status === 'published' && pending > 0 && <Notice>Nouvelles photos ou vidéos en préparation…</Notice>}
      {failed > 0 && post.status !== 'failed' && (
        <Notice>{failed === 1 ? "1 photo ou vidéo n'a pas pu être traitée." : `${failed} photos ou vidéos n'ont pas pu être traitées.`}</Notice>
      )}
    </>
  )
}

/** A post as admins see it: who published it, its preparation state, and what they may do with it. */
export default function AdminPostCard({ post, onChange, onDeleted }) {
  const theme = useTheme()
  const [error, setError] = useState('')
  const published = post.status === 'published'

  async function remove() {
    if (!(await confirm('Supprimer cette publication ?', 'Cette action est définitive.', 'Supprimer'))) return
    setError('')
    try {
      await adminApi(`/admin/posts/${post.id}/`, { method: 'DELETE' })
      onDeleted(post.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const header = (
    <View style={styles.admin}>
      <Text style={{ color: theme.text }}>Publié par {post.author}</Text>
      <Status post={post} />
      <ErrorText>{error}</ErrorText>
      <View style={styles.actions}>
        {post.can_edit && <Button variant="secondary" onPress={() => router.push(`/admin/compose?post=${post.id}`)}>Modifier</Button>}
        {post.can_delete && <Button variant="danger" onPress={remove}>Supprimer</Button>}
        {published && <Button variant="secondary" onPress={() => router.push(`/admin/post/${post.id}`)}>Commentaires</Button>}
      </View>
    </View>
  )

  return (
    <PostCard post={post} onChange={onChange} header={header} showInteractions={published}
      onComment={() => router.push(`/admin/post/${post.id}`)} />
  )
}

const styles = StyleSheet.create({
  admin: { paddingHorizontal: 12, marginBottom: 8, gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})

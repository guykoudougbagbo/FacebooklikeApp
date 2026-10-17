import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { adminApi } from '../../api/admin'
import Composer from '../../components/admin/Composer'
import Backdrop from '../../components/Backdrop'
import { ErrorText } from '../../components/ui'

/** A new post, or ?post=<id> to edit one. */
export default function ComposeScreen() {
  const { post: postId } = useLocalSearchParams()
  const editing = postId !== undefined
  const known = !editing || /^\d+$/.test(String(postId))
  const [post, setPost] = useState(null)
  const [loadError, setLoadError] = useState('')
  const error = known ? loadError : 'Publication introuvable.'
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (!editing || !known) return
    adminApi(`/admin/posts/${postId}/`).then(setPost, (err) => setLoadError(err.message))
  }, [editing, known, postId])

  return (
    <Backdrop>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <ErrorText>{error}</ErrorText>
          {editing && !post && !error && <ActivityIndicator color="#fff" />}
          {(!editing || post) && <Composer post={post} onSaved={() => router.back()} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 12 },
})

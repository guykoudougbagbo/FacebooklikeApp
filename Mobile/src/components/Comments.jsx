import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { formatRelative } from '@shared/format'
import { api } from '../api/client'
import { useTheme } from '../theme'
import { Button, ErrorText, Notice } from './ui'

const NAME_KEY = 'comment_name'

export function Comment({ comment }) {
  const theme = useTheme()
  return (
    <View style={styles.comment}>
      <View style={[styles.bubble, { backgroundColor: theme.surfaceMuted }]}>
        <Text style={[styles.name, { color: theme.textStrong }]}>
          {comment.name}{comment.is_page ? '  ·  Page' : ''}
        </Text>
        {/* Links in comments stay plain text, as on the website. */}
        <Text style={[styles.body, { color: theme.textStrong }]} selectable>{comment.body}</Text>
      </View>
      <Text style={[styles.meta, { color: theme.text }]}>{formatRelative(comment.created_at)}</Text>
    </View>
  )
}

export function CommentForm({ postId, onAdded }) {
  const theme = useTheme()
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    SecureStore.getItemAsync(NAME_KEY).then((saved) => saved && setName((current) => current || saved), () => {})
  }, [])

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const comment = await api(`/posts/${postId}/comments/`, { method: 'POST', body: { name, body } })
      SecureStore.setItemAsync(NAME_KEY, name).catch(() => {})
      setBody('')
      onAdded(comment)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const input = [styles.input, { color: theme.textStrong, backgroundColor: theme.surfaceMuted }]
  return (
    <View style={styles.form}>
      <ErrorText>{error}</ErrorText>
      <TextInput style={input} placeholder="Votre nom" placeholderTextColor={theme.text} value={name} maxLength={40}
        onChangeText={setName} autoComplete="nickname" accessibilityLabel="Votre nom" />
      <TextInput style={[input, styles.text]} placeholder="Écrivez un commentaire…" placeholderTextColor={theme.text}
        value={body} maxLength={1000} multiline onChangeText={setBody} accessibilityLabel="Votre commentaire" />
      <Button busy={busy} disabled={!name.trim() || !body.trim()} onPress={submit}>Publier le commentaire</Button>
    </View>
  )
}

export function CommentsClosed() {
  return <Notice>Les commentaires sont désactivés pour cette publication.</Notice>
}

const styles = StyleSheet.create({
  comment: { paddingHorizontal: 12, marginBottom: 10 },
  bubble: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  name: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 15 },
  meta: { fontSize: 12, marginTop: 2, marginLeft: 12 },
  form: { gap: 8, padding: 12 },
  input: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  text: { minHeight: 70, textAlignVertical: 'top' },
})

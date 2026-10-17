import { router } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { plural } from '@shared/format'
import { REACTION_BY_KIND, REACTIONS, topReactions } from '@shared/reactions'
import { api } from '../api/client'
import { SITE_URL } from '../config'
import { useTheme } from '../theme'
import { ErrorText } from './ui'

function Action({ children, onPress, onLongPress, active, label }) {
  const theme = useTheme()
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: theme.surfaceMuted }]}>
      <Text style={[styles.actionText, { color: active ? theme.purple : theme.text }]}>{children}</Text>
    </Pressable>
  )
}

/** Reactions (press: J'aime; long press: choose), comments and sharing, like on the website. */
export default function InteractionBar({ post, onChange, onComment }) {
  const theme = useTheme()
  const summary = post.interactions
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')

  const setSummary = (interactions) => onChange({ ...post, interactions })
  const { top, total } = topReactions(summary.reactions)
  const mine = summary.my_reaction ? REACTION_BY_KIND[summary.my_reaction] : null

  async function react(kind) {
    setPicking(false)
    setError('')
    try {
      const removing = kind === summary.my_reaction
      setSummary(await api(`/posts/${post.id}/reaction/`, removing ? { method: 'DELETE' } : { method: 'POST', body: { kind } }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function share() {
    setError('')
    const url = `${SITE_URL}/p/${post.id}/`
    let result
    try {
      // iOS shares the link itself; Android only takes text.
      result = await Share.share(Platform.OS === 'ios' ? { url } : { message: url, title: 'GenZ' })
    } catch {
      setError('Impossible de partager pour le moment.')
      return
    }
    if (result.action !== Share.sharedAction) return
    try {
      setSummary(await api(`/posts/${post.id}/share/`, { method: 'POST' }))
    } catch {
      // The link was shared; only the counter failed to update.
    }
  }

  const comment = onComment ?? (() => router.push(`/publication/${post.id}`))

  return (
    <View style={styles.bar}>
      {(total > 0 || summary.comments > 0 || summary.shares > 0) && (
        <View style={styles.summary}>
          {total > 0 && (
            <Text style={{ color: theme.text }} accessibilityLabel={plural(total, 'réaction', 'réactions')}>
              {top.map((r) => r.emoji).join('')} {total}
            </Text>
          )}
          <View style={styles.spacer} />
          {summary.comments > 0 && (
            <Text style={{ color: theme.text }} onPress={comment}>{plural(summary.comments, 'commentaire', 'commentaires')}</Text>
          )}
          {summary.shares > 0 && <Text style={{ color: theme.text }}>{plural(summary.shares, 'partage', 'partages')}</Text>}
        </View>
      )}
      {picking && (
        <View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityLabel="Réactions">
          {REACTIONS.map((r) => (
            <Pressable key={r.kind} onPress={() => react(r.kind)} accessibilityRole="button" accessibilityLabel={r.label}
              accessibilityState={{ selected: summary.my_reaction === r.kind }} style={styles.pick} hitSlop={4}>
              <Text style={styles.pickEmoji}>{r.emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.actions, { borderColor: theme.border }]}>
        <Action active={Boolean(mine)} label={mine?.label ?? "J'aime"} onPress={() => react(summary.my_reaction ?? 'like')}
          onLongPress={() => setPicking(true)}>
          {mine?.emoji ?? '👍'} {mine?.label ?? "J'aime"}
        </Action>
        <Action label="Choisir une réaction" onPress={() => setPicking((v) => !v)}>▾</Action>
        <Action label="Commenter" onPress={comment}>💬 Commenter</Action>
        <Action label="Partager" onPress={share}>↗ Partager</Action>
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  spacer: { flex: 1 },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  action: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 6, borderRadius: 6 },
  actionText: { fontSize: 14, fontWeight: '600' },
  picker: { flexDirection: 'row', alignSelf: 'flex-start', gap: 4, padding: 6, borderRadius: 24, borderWidth: 1, marginBottom: 6 },
  pick: { padding: 4 },
  pickEmoji: { fontSize: 28 },
})

import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAdmin } from '../../../admin/AdminContext'
import { adminApi } from '../../../api/admin'
import Backdrop from '../../../components/Backdrop'
import { Button, Card, ErrorText, Field } from '../../../components/ui'
import { usePagedList } from '../../../hooks/usePagedList'
import { useTheme } from '../../../theme'

function Choice({ label, selected, onPress, multiple }) {
  const theme = useTheme()
  return (
    <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={multiple ? { checked: selected } : { selected }}
      accessibilityLabel={label} onPress={onPress}
      style={[styles.choice, { borderColor: selected ? theme.purple : theme.border, backgroundColor: theme.surfaceMuted }]}>
      <Text style={{ color: theme.textStrong, fontWeight: selected ? '700' : '400' }}>{selected ? '✓ ' : ''}{label}</Text>
    </Pressable>
  )
}

/** Start a one-on-one conversation, or create a group. */
export default function NewConversationScreen() {
  const { user } = useAdmin()
  const theme = useTheme()
  const team = usePagedList('/admin/admins/', adminApi)
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState('direct')
  const [chosen, setChosen] = useState(() => new Set())
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const others = (team.items ?? []).filter((person) => person.id !== user.id)

  function toggle(id) {
    setChosen((current) => {
      if (mode === 'direct') return new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const body = mode === 'direct'
        ? { kind: 'direct', user_id: [...chosen][0] }
        : { kind: 'group', title, member_ids: [...chosen] }
      const conversation = await adminApi('/messages/conversations/', { method: 'POST', body })
      router.replace(`/admin/messages/${conversation.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Type de conversation">
            <Choice label="Message privé" selected={mode === 'direct'} onPress={() => { setMode('direct'); setChosen(new Set()) }} />
            <Choice label="Groupe" selected={mode === 'group'} onPress={() => { setMode('group'); setChosen(new Set()) }} />
          </View>
          <ErrorText>{error || team.error}</ErrorText>
          {mode === 'group' && <Field label="Nom du groupe" value={title} onChangeText={setTitle} maxLength={80} />}
          <Text style={[styles.legend, { color: theme.textStrong }]}>{mode === 'direct' ? 'Avec qui ?' : 'Membres'}</Text>
          {team.items === null ? <ActivityIndicator /> : others.length === 0 ? (
            <Text style={{ color: theme.text }}>Aucun autre administrateur pour le moment.</Text>
          ) : others.map((person) => (
            <Choice key={person.id} label={person.display_name} selected={chosen.has(person.id)} multiple={mode === 'group'}
              onPress={() => toggle(person.id)} />
          ))}
          {team.hasMore && <Button variant="secondary" busy={team.loadingMore} onPress={team.loadMore}>Voir plus</Button>}
          <Button busy={busy} disabled={chosen.size === 0 || (mode === 'group' && !title.trim())} onPress={submit}>
            {mode === 'direct' ? 'Écrire' : 'Créer le groupe'}
          </Button>
        </Card>
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  page: { padding: 12 },
  modes: { flexDirection: 'row', gap: 8 },
  choice: { borderWidth: 2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  legend: { fontWeight: '700', fontSize: 15 },
})

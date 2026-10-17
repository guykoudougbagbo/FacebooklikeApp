import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAdmin } from '../../admin/AdminContext'
import { adminApi } from '../../api/admin'
import { usePagedList } from '../../hooks/usePagedList'
import { useTheme } from '../../theme'
import { confirm } from '../confirm'
import { Button, ErrorText, Field } from '../ui'

/** Members of a group; its manager can rename it and add or remove people; anyone can leave. */
export default function GroupSettings({ conversation, onChanged }) {
  const { user } = useAdmin()
  const theme = useTheme()
  const isManager = conversation.manager_id === user.id
  const team = usePagedList('/admin/admins/', adminApi)
  const [title, setTitle] = useState(conversation.title)
  const [error, setError] = useState('')
  const memberIds = new Set(conversation.members.map((m) => m.id))
  const addable = (team.items ?? []).filter((person) => !memberIds.has(person.id))
  const base = `/messages/conversations/${conversation.id}`

  async function run(request, after = onChanged) {
    setError('')
    try {
      after(await request())
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <View style={styles.panel} accessibilityLabel="Réglages du groupe">
      <ErrorText>{error}</ErrorText>
      {isManager && (
        <>
          <Field label="Nom du groupe" value={title} onChangeText={setTitle} maxLength={80} />
          <Button variant="secondary" disabled={!title.trim()}
            onPress={() => run(() => adminApi(`${base}/`, { method: 'PATCH', body: { title } }))}>Renommer</Button>
        </>
      )}
      <Text style={[styles.heading, { color: theme.textStrong }]}>Membres</Text>
      {conversation.members.map((member) => (
        <View key={member.id} style={styles.row}>
          <Text style={[styles.name, { color: theme.textStrong }]}>
            {member.name}{member.id === conversation.manager_id ? ' · gère le groupe' : ''}
          </Text>
          {isManager && member.id !== user.id && (
            <Button variant="danger" onPress={async () => {
              if (await confirm(`Retirer ${member.name} du groupe ?`, '', 'Retirer')) {
                run(() => adminApi(`${base}/members/${member.id}/`, { method: 'DELETE' }))
              }
            }}>Retirer</Button>
          )}
        </View>
      ))}
      {isManager && addable.length > 0 && (
        <>
          <Text style={[styles.heading, { color: theme.textStrong }]}>Ajouter</Text>
          {addable.map((person) => (
            <Button key={person.id} variant="secondary"
              onPress={() => run(() => adminApi(`${base}/members/`, { method: 'POST', body: { user_id: person.id } }))}>
              {`+ ${person.display_name}`}
            </Button>
          ))}
        </>
      )}
      {isManager && team.hasMore && <Button variant="secondary" busy={team.loadingMore} onPress={team.loadMore}>Voir plus de personnes</Button>}
      <Button variant="danger" onPress={async () => {
        if (await confirm('Quitter ce groupe ?', 'Vous ne verrez plus ses messages.', 'Quitter')) {
          run(() => adminApi(`${base}/members/${user.id}/`, { method: 'DELETE' }), () => router.replace('/admin/messages'))
        }
      }}>Quitter le groupe</Button>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15 },
})

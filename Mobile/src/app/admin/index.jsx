import { router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROLE_LABELS } from '@shared/team'
import { useAdmin } from '../../admin/AdminContext'
import { useLiveMessages } from '../../admin/LiveMessagesContext'
import Backdrop from '../../components/Backdrop'
import { confirm } from '../../components/confirm'
import { Button } from '../../components/ui'
import { useTheme } from '../../theme'

function Row({ label, detail, onPress }) {
  const theme = useTheme()
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={detail ? `${label}, ${detail}` : label} onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[styles.rowLabel, { color: theme.textStrong }]}>{label}</Text>
      {detail ? <Text style={[styles.badge, { backgroundColor: theme.purple }]}>{detail}</Text> : null}
      <Text style={{ color: theme.text }}>›</Text>
    </Pressable>
  )
}

export default function AdminHome() {
  const { user, logOut } = useAdmin()
  const { unread } = useLiveMessages()
  const insets = useSafeAreaInsets()

  async function leave() {
    if (await confirm('Se déconnecter ?', 'Vous devrez vous reconnecter avec votre code pour revenir ici.', 'Se déconnecter', false)) {
      await logOut()
      router.replace('/')
    }
  }

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.hello}>
          <Text style={styles.name}>{user.display_name}</Text>
          <Text style={styles.role}>{ROLE_LABELS[user.role]}</Text>
        </View>
        <Row label="Publications" onPress={() => router.push('/admin/posts')} />
        <Row label="Messages" detail={unread ? `${unread} non lus` : null} onPress={() => router.push('/admin/messages')} />
        <Row label="Équipe" onPress={() => router.push('/admin/team')} />
        <Row label="Activité" onPress={() => router.push('/admin/activity')} />
        <Row label="Voir la page comme un visiteur" onPress={() => router.replace('/')} />
        <Button variant="secondary" onPress={leave}>Se déconnecter</Button>
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  page: { padding: 12, gap: 10 },
  hello: { paddingVertical: 8 },
  name: { color: '#fff', fontSize: 22, fontWeight: '700' },
  role: { color: '#ccc', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, borderRadius: 10 },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: '600' },
  badge: { color: '#fff', fontSize: 13, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
})

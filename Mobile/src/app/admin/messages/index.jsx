import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatRelative } from '@shared/format'
import { preview } from '@shared/messages'
import { useAdmin } from '../../../admin/AdminContext'
import { useMessagingEvents } from '../../../admin/LiveMessagesContext'
import { adminApi } from '../../../api/admin'
import Backdrop from '../../../components/Backdrop'
import { Button, ErrorText, Notice } from '../../../components/ui'
import { usePagedList } from '../../../hooks/usePagedList'
import { useTheme } from '../../../theme'

function ConversationRow({ conversation, myId }) {
  const theme = useTheme()
  const last = conversation.last_message
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={conversation.unread ? `${conversation.title}, non lu` : conversation.title}
      onPress={() => router.push(`/admin/messages/${conversation.id}`)}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.title, { color: theme.textStrong, fontWeight: conversation.unread ? '800' : '600' }]} numberOfLines={1}>
          {conversation.title}
        </Text>
        {conversation.unread && <View style={[styles.dot, { backgroundColor: theme.purple }]} />}
        {last && <Text style={[styles.time, { color: theme.text }]}>{formatRelative(last.created_at)}</Text>}
      </View>
      <Text style={{ color: theme.text }} numberOfLines={1}>{preview(last, conversation, myId)}</Text>
    </Pressable>
  )
}

export default function ConversationsScreen() {
  const { user } = useAdmin()
  const list = usePagedList('/messages/conversations/', adminApi)
  const insets = useSafeAreaInsets()
  const shown = useRef(false)
  const { reload } = list

  // Any live change can reorder the list or change a preview; it's short, so reload it.
  useMessagingEvents(useCallback(() => reload(), [reload]))
  useFocusEffect(useCallback(() => {
    if (shown.current) reload()
    shown.current = true
  }, [reload]))

  return (
    <Backdrop>
      <FlatList
        data={list.items ?? []}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => <ConversationRow conversation={item} myId={user.id} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button onPress={() => router.push('/admin/messages/new')}>Nouveau</Button>
            <ErrorText>{list.error}</ErrorText>
          </View>
        }
        ListEmptyComponent={list.items === null
          ? <ActivityIndicator color="#fff" style={styles.loading} />
          : !list.error && <Notice>Aucune conversation. Commencez-en une avec « Nouveau ».</Notice>}
        onEndReached={list.loadMore}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor="#fff" />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
      />
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  list: { padding: 8, gap: 8 },
  header: { gap: 8 },
  row: { borderRadius: 10, padding: 12, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  time: { fontSize: 12 },
  loading: { marginVertical: 24 },
})

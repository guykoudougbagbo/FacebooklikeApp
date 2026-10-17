import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatDateTime } from '@shared/format'
import { describeActivity } from '@shared/team'
import { adminApi } from '../../api/admin'
import Backdrop from '../../components/Backdrop'
import { ErrorText, Notice } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { useTheme } from '../../theme'

export default function ActivityScreen() {
  const activity = usePagedList('/admin/activity/', adminApi)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Backdrop>
      <FlatList
        data={activity.items ?? []}
        keyExtractor={(entry) => String(entry.id)}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.textStrong }}>{describeActivity(item)}</Text>
            <Text style={[styles.time, { color: theme.text }]}>{formatDateTime(item.created_at)}</Text>
          </View>
        )}
        ListHeaderComponent={<ErrorText>{activity.error}</ErrorText>}
        ListEmptyComponent={activity.items === null
          ? <ActivityIndicator color="#fff" style={styles.loading} />
          : !activity.error && <Notice>Aucune activité pour le moment.</Notice>}
        onEndReached={activity.loadMore}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
      />
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  list: { padding: 8, gap: 8 },
  row: { borderRadius: 10, padding: 12, gap: 4 },
  time: { fontSize: 13 },
  loading: { marginVertical: 24 },
})

import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { adminApi } from '../../api/admin'
import AdminPostCard from '../../components/admin/AdminPostCard'
import Backdrop from '../../components/Backdrop'
import { Button, ErrorText, Notice } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'

// Same pace as the website while photos and videos are being prepared.
const PROCESSING_POLL_MS = 3000

function isProcessing(post) {
  return post.status === 'processing' || post.media.some((m) => m.status === 'pending')
}

export default function AdminPosts() {
  const feed = usePagedList('/admin/posts/', adminApi)
  const insets = useSafeAreaInsets()
  const { items, replaceItem, refresh } = feed
  const shown = useRef(false)

  // Back from writing or editing a post: show it.
  useFocusEffect(useCallback(() => {
    if (shown.current) refresh()
    shown.current = true
  }, [refresh]))

  useEffect(() => {
    const waiting = (items ?? []).filter(isProcessing)
    if (!waiting.length) return undefined
    const timer = setTimeout(() => {
      waiting.forEach((post) => adminApi(`/admin/posts/${post.id}/`).then(replaceItem, () => {}))
    }, PROCESSING_POLL_MS)
    return () => clearTimeout(timer)
  }, [items, replaceItem])

  return (
    <Backdrop>
      <FlatList
        data={items ?? []}
        keyExtractor={(post) => String(post.id)}
        renderItem={({ item }) => <AdminPostCard post={item} onChange={replaceItem} onDeleted={feed.removeItem} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button onPress={() => router.push('/admin/compose')}>Nouvelle publication</Button>
            <ErrorText>{feed.error}</ErrorText>
          </View>
        }
        ListEmptyComponent={items === null
          ? <ActivityIndicator color="#fff" style={styles.loading} />
          : !feed.error && <Notice>Aucune publication pour le moment.</Notice>}
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color="#fff" style={styles.loading} /> : null}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={refresh} tintColor="#fff" />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
      />
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  list: { padding: 8, gap: 10 },
  header: { gap: 8 },
  loading: { marginVertical: 24 },
})

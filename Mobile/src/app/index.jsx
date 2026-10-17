import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Backdrop from '../components/Backdrop'
import FollowCard from '../components/FollowCard'
import PostCard from '../components/PostCard'
import { ErrorText, Notice } from '../components/ui'
import { usePagedList } from '../hooks/usePagedList'

export default function FeedScreen() {
  const feed = usePagedList('/posts/')
  const insets = useSafeAreaInsets()

  return (
    <Backdrop>
      <FlatList
        data={feed.items ?? []}
        keyExtractor={(post) => String(post.id)}
        renderItem={({ item }) => <PostCard post={item} onChange={feed.replaceItem} />}
        ListHeaderComponent={
          <>
            <FollowCard />
            <ErrorText>{feed.error}</ErrorText>
          </>
        }
        ListEmptyComponent={
          feed.items === null
            ? <ActivityIndicator color="#fff" style={styles.loading} />
            : !feed.error && <Notice>Les publications de la page apparaîtront ici très bientôt.</Notice>
        }
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator color="#fff" style={styles.loading} /> : null}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} tintColor="#fff" />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
      />
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  list: { padding: 8, gap: 10 },
  loading: { marginVertical: 24 },
})

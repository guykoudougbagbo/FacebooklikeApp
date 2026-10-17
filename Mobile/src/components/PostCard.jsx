import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'
import { formatRelative } from '@shared/format'
import { readyItems } from '@shared/media'
import { useTheme } from '../theme'
import InteractionBar from './InteractionBar'
import MediaGrid from './MediaGrid'
import PostText from './PostText'

const LOGO = require('../../assets/genz-logo.jpg')

export default function PostCard({ post, onChange, onComment }) {
  const theme = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]} accessibilityLabel="Publication de GenZ">
      <View style={styles.header}>
        <Image source={LOGO} style={styles.avatar} contentFit="cover" />
        <View>
          <Text style={[styles.author, { color: theme.textStrong }]}>GenZ</Text>
          <Text style={[styles.meta, { color: theme.text }]}>
            {formatRelative(post.published_at)}{post.edited_at ? ' · modifiée' : ''}
          </Text>
        </View>
      </View>
      <PostText text={post.body} style={styles.body} />
      <MediaGrid items={readyItems(post.media)} />
      <InteractionBar post={post} onChange={onChange} onComment={onComment} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, overflow: 'hidden', paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  author: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
  body: { paddingHorizontal: 12, marginBottom: 10 },
})

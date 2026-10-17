import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatDuration } from '@shared/format'
import { mediaUrl } from '../api/client'
import MediaViewer from './MediaViewer'

// Like Facebook: one item full width, then rows of two and three; "+N" on the last tile.
const LAYOUTS = { 1: [[0]], 2: [[0, 1]], 3: [[0], [1, 2]], 4: [[0, 1], [2, 3]], 5: [[0, 1], [2, 3, 4]] }

/** A single item keeps its shape; very tall ones are trimmed to 4:5. */
function singleRatio({ width, height }) {
  return width && height ? Math.max(width / height, 4 / 5) : 1
}

function Tile({ item, index, count, more, onOpen }) {
  const video = item.kind === 'video'
  return (
    <Pressable
      style={styles.tile}
      onPress={() => onOpen(index)}
      accessibilityRole="button"
      accessibilityLabel={video ? `Lire la vidéo ${index + 1} sur ${count}` : `Agrandir la photo ${index + 1} sur ${count}`}
    >
      <Image source={{ uri: mediaUrl(video ? item.poster_url : item.feed_url) }} style={StyleSheet.absoluteFill}
        contentFit="cover" transition={150} />
      {video && (
        <View style={styles.play} pointerEvents="none">
          <Text style={styles.playIcon}>▶</Text>
          <Text style={styles.duration}>{formatDuration(item.duration_seconds)}</Text>
        </View>
      )}
      {more > 0 && (
        <View style={styles.more} pointerEvents="none">
          <Text style={styles.moreText}>+{more}</Text>
        </View>
      )}
    </Pressable>
  )
}

export default function MediaGrid({ items }) {
  const [openAt, setOpenAt] = useState(null)
  if (!items.length) return null
  const rows = LAYOUTS[Math.min(items.length, 5)]
  const shown = rows.flat().length
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, { aspectRatio: items.length === 1 ? singleRatio(items[0]) : row.length === 1 ? 16 / 9 : row.length }]}>
          {row.map((i) => (
            <Tile key={items[i].id} item={items[i]} index={i} count={items.length} onOpen={setOpenAt}
              more={i === shown - 1 ? items.length - shown : 0} />
          ))}
        </View>
      ))}
      {openAt !== null && <MediaViewer items={items} startIndex={openAt} onClose={() => setOpenAt(null)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { gap: 2 },
  row: { flexDirection: 'row', gap: 2, width: '100%' },
  tile: { flex: 1, backgroundColor: '#111', overflow: 'hidden' },
  play: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  playIcon: { color: '#fff', fontSize: 40 },
  duration: { position: 'absolute', right: 8, bottom: 8, color: '#fff', fontSize: 13, fontWeight: '600' },
  more: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  moreText: { color: '#fff', fontSize: 28, fontWeight: '700' },
})

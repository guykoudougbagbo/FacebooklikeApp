import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mediaUrl } from '../api/client'

function PlayingVideo({ item }) {
  // Only created once the visitor presses play, so nothing downloads before that.
  const player = useVideoPlayer(mediaUrl(item.video_url), (p) => p.play())
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls
    fullscreenOptions={{ enable: true }} />
}

function VideoPage({ item, playing, onPlay }) {
  if (playing) return <PlayingVideo item={item} />
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPlay} accessibilityRole="button"
      accessibilityLabel="Lire la vidéo">
      <Image source={{ uri: mediaUrl(item.poster_url) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      <View style={styles.play} pointerEvents="none"><Text style={styles.playIcon}>▶</Text></View>
    </Pressable>
  )
}

/** Full screen, swipe between items. Only the video that was pressed starts by itself. */
export default function MediaViewer({ items, startIndex, onClose }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(startIndex)
  const [playingId, setPlayingId] = useState(items[startIndex].id)

  function showPage(i) {
    if (i === index) return
    setIndex(i)
    setPlayingId(null)
  }
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          horizontal
          pagingEnabled
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => showPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          extraData={playingId}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              {item.kind === 'video'
                ? <VideoPage item={item} playing={item.id === playingId} onPlay={() => setPlayingId(item.id)} />
                : <Image source={{ uri: mediaUrl(item.full_url) }} style={StyleSheet.absoluteFill} contentFit="contain" />}
            </View>
          )}
        />
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer"
          style={[styles.close, { top: insets.top + 8 }]} hitSlop={12}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {items.length > 1 && (
          <Text style={[styles.counter, { bottom: insets.bottom + 16 }]}>{index + 1} / {items.length}</Text>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  play: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#fff', fontSize: 56 },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  closeText: { color: '#fff', fontSize: 20 },
  counter: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: 14 },
})

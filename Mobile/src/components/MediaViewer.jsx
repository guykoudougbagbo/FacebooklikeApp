import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mediaUrl } from '../api/client'
import PlayButton from './PlayButton'

const BAR_HEIGHT = 56

function PlayingVideo({ item }) {
  // Only created once the visitor presses play, so nothing downloads before that.
  const player = useVideoPlayer(mediaUrl(item.video_url), (p) => p.play())
  // No second, built-in full screen: the viewer already is one, and that player has no way back to it.
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls
    fullscreenOptions={{ enable: false }} />
}

function VideoPage({ item, playing, onPlay }) {
  if (playing) return <PlayingVideo item={item} />
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPlay} accessibilityRole="button"
      accessibilityLabel="Lire la vidéo">
      <Image source={{ uri: mediaUrl(item.poster_url) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      <View style={styles.play} pointerEvents="none">
        <PlayButton size={72} />
      </View>
    </Pressable>
  )
}

/**
 * Full screen, swipe between items. Only the video that was pressed starts by itself.
 * The close button sits in its own bar above the photos and videos, so a playing video can never cover it.
 */
export default function MediaViewer({ items, startIndex, onClose }) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(startIndex)
  const [playingId, setPlayingId] = useState(items[startIndex].id)
  const [measured, setMeasured] = useState(null)
  const area = measured ?? { width: window.width, height: window.height - insets.top - BAR_HEIGHT - insets.bottom }

  function showPage(i) {
    if (i === index) return
    setIndex(i)
    setPlayingId(null)
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.bar}>
          <Text style={styles.counter}>{items.length > 1 ? `${index + 1} / ${items.length}` : ''}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={12}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Text style={styles.closeText}>✕  Fermer</Text>
          </Pressable>
        </View>
        <View style={styles.area} onLayout={(e) => setMeasured(e.nativeEvent.layout)}>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: area.width, offset: area.width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => showPage(Math.round(e.nativeEvent.contentOffset.x / area.width))}
            extraData={playingId}
            renderItem={({ item }) => (
              <View style={{ width: area.width, height: area.height }}>
                {item.kind === 'video'
                  ? <VideoPage item={item} playing={item.id === playingId} onPlay={() => setPlayingId(item.id)} />
                  : <Image source={{ uri: mediaUrl(item.full_url) }} style={StyleSheet.absoluteFill} contentFit="contain" />}
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  bar: { height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  counter: { color: '#fff', fontSize: 15 },
  close: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  area: { flex: 1 },
  play: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
})

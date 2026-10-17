import Slider from '@react-native-community/slider'
import * as DocumentPicker from 'expo-document-picker'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { adminApi, adminMediaUrl } from '../../api/admin'
import { useTheme } from '../../theme'
import { Button, ErrorText } from '../ui'

function fromPicker(asset) {
  const video = asset.type === 'video'
  return {
    key: asset.assetId ?? asset.uri,
    kind: video ? 'video' : 'photo',
    file: {
      uri: asset.uri,
      name: asset.fileName ?? (video ? 'video.mov' : 'photo.jpg'),
      type: asset.mimeType ?? (video ? 'video/quicktime' : 'image/jpeg'),
    },
    original: 100,
    music: null,
    musicVolume: 100,
  }
}

function Volume({ label, value, onChange }) {
  const theme = useTheme()
  return (
    <View>
      <Text style={{ color: theme.textStrong }}>{label} : {value} %</Text>
      <Slider accessibilityLabel={label} minimumValue={0} maximumValue={100} step={5} value={value}
        onValueChange={(v) => onChange(Math.round(v))} minimumTrackTintColor={theme.purple} />
    </View>
  )
}

/** The sound of one new video: keep, mute, replace or mix with music (like on the website). */
function SoundControls({ item, number, onChange }) {
  const theme = useTheme()
  const [error, setError] = useState('')

  async function pickMusic() {
    setError('')
    const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true })
    if (picked.canceled) return
    const asset = picked.assets[0]
    onChange({ music: { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'audio/mpeg' } })
  }

  return (
    <View style={styles.sound}>
      <Volume label={`Son d'origine de la vidéo ${number}`} value={item.original} onChange={(original) => onChange({ original })} />
      <ErrorText>{error}</ErrorText>
      {item.music ? (
        <>
          <Text style={{ color: theme.textStrong }}>Musique : {item.music.name}</Text>
          <Volume label={`Musique de la vidéo ${number}`} value={item.musicVolume} onChange={(musicVolume) => onChange({ musicVolume })} />
          <Button variant="secondary" onPress={() => onChange({ music: null })}>Retirer la musique</Button>
        </>
      ) : (
        <Button variant="secondary" onPress={pickMusic}>{`Choisir une musique pour la vidéo ${number}`}</Button>
      )}
    </View>
  )
}

function Thumbnail({ uri, video, removed }) {
  return (
    <View style={[styles.thumb, removed && styles.removed]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      {video && <Text style={styles.videoMark}>Vidéo</Text>}
    </View>
  )
}

/** Writes a new post, or edits `post` when given. */
export default function Composer({ post = null, onSaved }) {
  const theme = useTheme()
  const [body, setBody] = useState(post?.body ?? '')
  const [items, setItems] = useState([])
  const [removeIds, setRemoveIds] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const kept = (post?.media.length ?? 0) - removeIds.size

  async function addMedia() {
    setError('')
    // iPhones only hand videos over once the photo library may be read.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError('Autorisez GenZ à accéder à vos photos dans les réglages du téléphone.')
      return
    }
    // The server says how many a post may hold, as it does for the website.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1,
    })
    if (picked.canceled) return
    setItems((current) => [...current, ...picked.assets.map(fromPicker)])
  }

  function update(index, changes) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  }

  function toggleRemove(id) {
    setRemoveIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    const form = new FormData()
    form.append('body', body)
    items.forEach((item, i) => {
      form.append('media', item.file)
      if (item.kind !== 'video') return
      form.append(`sound_original_${i}`, String(item.original))
      if (item.music) {
        form.append(`music_${i}`, item.music)
        form.append(`sound_music_${i}`, String(item.musicVolume))
      }
    })
    removeIds.forEach((id) => form.append('remove_media_ids', String(id)))
    setBusy(true)
    setError('')
    try {
      onSaved(post
        ? await adminApi(`/admin/posts/${post.id}/`, { method: 'PATCH', body: form })
        : await adminApi('/admin/posts/', { method: 'POST', body: form }))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // "Vidéo 2" means the second video among the new items, as on the website.
  const videoNumbers = items.map((_, i) => items.slice(0, i + 1).filter((other) => other.kind === 'video').length)
  return (
    <View style={styles.form}>
      <ErrorText>{error}</ErrorText>
      <TextInput accessibilityLabel="Texte de la publication" placeholder="Quoi de neuf ?" placeholderTextColor={theme.text}
        value={body} onChangeText={setBody} multiline
        style={[styles.text, { color: theme.textStrong, backgroundColor: theme.surface }]} />
      {post?.media.length > 0 && (
        <View style={styles.list} accessibilityLabel="Photos et vidéos de la publication">
          {post.media.map((item, i) => (
            <View key={item.id} style={styles.row}>
              <Thumbnail uri={adminMediaUrl(item.kind === 'video' ? item.poster_url : item.feed_url)}
                video={item.kind === 'video'} removed={removeIds.has(item.id)} />
              <Button variant="secondary" onPress={() => toggleRemove(item.id)}>
                {removeIds.has(item.id) ? 'Garder' : `Retirer l'élément ${i + 1}`}
              </Button>
            </View>
          ))}
        </View>
      )}
      {items.map((item, i) => {
        return (
          <View key={item.key} style={[styles.newItem, { backgroundColor: theme.surface }]}>
            <View style={styles.row}>
              <Thumbnail uri={item.kind === 'photo' ? item.file.uri : null} video={item.kind === 'video'} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Enlever ${item.file.name}`}
                onPress={() => setItems((current) => current.filter((_, j) => j !== i))}>
                <Text style={{ color: theme.danger }}>Enlever</Text>
              </Pressable>
            </View>
            {item.kind === 'video' && (
              <SoundControls item={item} number={videoNumbers[i]} onChange={(changes) => update(i, changes)} />
            )}
          </View>
        )
      })}
      <Button variant="secondary" onPress={addMedia}>Ajouter des photos ou vidéos</Button>
      <Button busy={busy} disabled={!body.trim() && kept + items.length === 0} onPress={submit}>
        {post ? 'Enregistrer' : 'Publier'}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  text: { minHeight: 110, borderRadius: 10, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  newItem: { borderRadius: 10, padding: 10, gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#222', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  removed: { opacity: 0.3 },
  videoMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sound: { gap: 6 },
})

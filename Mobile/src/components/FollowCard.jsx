import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { plural } from '@shared/format'
import { api } from '../api/client'
import { expoPushToken } from '../notifications/push'
import { useTheme } from '../theme'
import { Button, ErrorText } from './ui'

const LOGO = require('../../assets/genz-logo.jpg')

export default function FollowCard() {
  const theme = useTheme()
  const [page, setPage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api('/page/').then((info) => active && setPage(info), () => {})
    return () => {
      active = false
    }
  }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      const info = page.following
        ? await api('/page/follow/', { method: 'DELETE' })
        : await api('/page/follow/', { method: 'POST', body: { expo_token: await expoPushToken() } })
      setPage((current) => ({ ...current, ...info }))
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!page) return null

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]} accessibilityLabel="La page GenZ">
      <View style={styles.row}>
        <Image source={LOGO} style={styles.logo} contentFit="cover" />
        <View style={styles.text}>
          <Text style={[styles.name, { color: theme.textStrong }]}>GenZ</Text>
          <Text style={{ color: theme.text }}>La génération qui dit non · {plural(page.followers, 'abonné', 'abonnés')}</Text>
        </View>
      </View>
      <Button variant={page.following ? 'secondary' : 'primary'} busy={busy} onPress={toggle}>
        {page.following ? 'Ne plus suivre' : 'Suivre la page'}
      </Button>
      <ErrorText>{error}</ErrorText>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 10, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 24 },
  text: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700' },
})

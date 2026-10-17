import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatRelative } from '@shared/format'
import { describeEvent, seenLabel } from '@shared/messages'
import { useAdmin } from '../../../admin/AdminContext'
import { useMessagingEvents } from '../../../admin/LiveMessagesContext'
import { adminApi } from '../../../api/admin'
import GroupSettings from '../../../components/admin/GroupSettings'
import Backdrop from '../../../components/Backdrop'
import { confirm } from '../../../components/confirm'
import { Button, ErrorText } from '../../../components/ui'
import { usePagedList } from '../../../hooks/usePagedList'
import { setOpenConversation } from '../../../notifications/push'
import { useTheme } from '../../../theme'

function Composer({ conversationId, onSent }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!body.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      onSent(await adminApi(`/messages/conversations/${conversationId}/messages/`, { method: 'POST', body: { body } }))
      setBody('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <View style={[styles.composer, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 8 }]}>
      <ErrorText>{error}</ErrorText>
      <View style={styles.composerRow}>
        <TextInput accessibilityLabel="Votre message" placeholder="Écrire un message…" placeholderTextColor={theme.text}
          value={body} onChangeText={setBody} multiline maxLength={2000}
          style={[styles.input, { color: theme.textStrong, backgroundColor: theme.surfaceMuted }]} />
        <Button busy={busy} disabled={!body.trim()} onPress={send}>Envoyer</Button>
      </View>
    </View>
  )
}

function Bubble({ message, mine, group, seen, onLongPress }) {
  const theme = useTheme()
  return (
    <View style={[styles.bubbleWrap, mine && styles.mine]}>
      <Pressable onLongPress={onLongPress} disabled={!onLongPress} accessibilityHint={onLongPress ? 'Appui long pour supprimer' : undefined}
        style={[styles.bubble, { backgroundColor: mine ? theme.purple : theme.surface }]}>
        {!mine && group && <Text style={[styles.sender, { color: theme.text }]}>{message.sender?.name}</Text>}
        <Text style={{ color: mine ? '#fff' : theme.textStrong, fontStyle: message.deleted ? 'italic' : 'normal', fontSize: 16 }}>
          {message.deleted ? 'Message supprimé' : message.body}
        </Text>
      </Pressable>
      <Text style={styles.meta}>{formatRelative(message.created_at)}{seen ? ` · ${seen}` : ''}</Text>
    </View>
  )
}

function Thread({ id }) {
  const { user } = useAdmin()
  const headerHeight = useHeaderHeight()
  const [conversation, setConversation] = useState(null)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const messages = usePagedList(`/messages/conversations/${id}/messages/`, adminApi)
  const { items, prependItem, replaceItem } = messages
  const lastMarked = useRef(0)

  const loadConversation = useCallback(() => {
    adminApi(`/messages/conversations/${id}/`).then(setConversation, (err) => setError(err.message))
  }, [id])

  useEffect(() => {
    loadConversation()
  }, [loadConversation])

  // While this conversation is on screen, its own notifications would only repeat it.
  useFocusEffect(useCallback(() => {
    setOpenConversation(Number(id))
    return () => setOpenConversation(null)
  }, [id]))

  // The API gives newest first, which is what an upside-down list shows at the bottom.
  const newestId = items?.[0]?.id ?? 0
  useEffect(() => {
    if (!newestId || newestId <= lastMarked.current) return
    lastMarked.current = newestId
    adminApi(`/messages/conversations/${id}/read/`, { method: 'POST', body: { message_id: newestId } }).catch(() => {})
  }, [id, newestId])

  const addMessage = useCallback((message) => {
    if (!(items ?? []).some((m) => m.id === message.id)) prependItem(message)
  }, [items, prependItem])

  useMessagingEvents(useCallback((event) => {
    if (event.conversation !== Number(id)) return
    if (event.type === 'message') {
      addMessage(event.message)
      if (event.message.kind === 'event') loadConversation()
    } else if (event.type === 'message_deleted') {
      const current = (items ?? []).find((m) => m.id === event.message_id)
      if (current) replaceItem({ ...current, deleted: true, body: '' })
    } else if (event.type === 'read') {
      setConversation((c) => c && { ...c, read_state: { ...c.read_state, [event.user_id]: event.message_id } })
    } else if (event.type === 'removed') {
      setError('Vous ne faites plus partie de cette conversation.')
    }
  }, [id, addMessage, loadConversation, items, replaceItem]))

  async function remove(message) {
    if (!(await confirm('Supprimer ce message ?', '', 'Supprimer'))) return
    try {
      await adminApi(`/messages/messages/${message.id}/`, { method: 'DELETE' })
      replaceItem({ ...message, deleted: true, body: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  if (error) {
    return (
      <View style={styles.page}>
        <ErrorText>{error}</ErrorText>
        <Button variant="secondary" onPress={() => router.replace('/admin/messages')}>Retour aux conversations</Button>
      </View>
    )
  }
  if (!conversation || items === null) return <ActivityIndicator color="#fff" style={styles.loading} />

  const group = conversation.kind === 'group'
  const myLastId = items.find((m) => m.kind === 'text' && m.sender?.id === user.id && !m.deleted)?.id
  const seen = myLastId ? seenLabel(conversation, myLastId, user.id) : null

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <Stack.Screen options={{
        title: conversation.title,
        headerRight: group ? () => (
          <Pressable accessibilityRole="button" onPress={() => setShowSettings(true)} hitSlop={8}>
            <Text style={styles.headerButton}>Membres</Text>
          </Pressable>
        ) : undefined,
      }} />
      <FlatList
        inverted
        data={items}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => {
          if (item.kind === 'event') {
            const text = describeEvent(item, conversation)
            return text ? <Text style={styles.event}>{text}</Text> : null
          }
          const mine = item.sender?.id === user.id
          return (
            <Bubble message={item} mine={mine} group={group} seen={item.id === myLastId ? seen : null}
              onLongPress={mine && !item.deleted ? () => remove(item) : null} />
          )
        }}
        onEndReached={messages.loadMore}
        ListFooterComponent={messages.loadingMore ? <ActivityIndicator color="#fff" /> : null}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
      <Composer conversationId={id} onSent={addMessage} />
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSettings(false)}>
        <Backdrop>
          <ScrollView contentContainerStyle={styles.settings}>
            <Button variant="secondary" onPress={() => setShowSettings(false)}>Fermer</Button>
            <GroupSettings conversation={conversation} onChanged={() => { loadConversation(); setShowSettings(false) }} />
          </ScrollView>
        </Backdrop>
      </Modal>
    </KeyboardAvoidingView>
  )
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams()
  return (
    <Backdrop>
      {/^\d+$/.test(String(id)) ? <Thread id={id} /> : <ErrorText>Conversation introuvable.</ErrorText>}
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 12, gap: 8 },
  list: { padding: 10, gap: 6 },
  loading: { marginVertical: 24 },
  event: { color: '#bbb', textAlign: 'center', fontSize: 13, marginVertical: 4 },
  bubbleWrap: { alignItems: 'flex-start', maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  sender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  meta: { color: '#bbb', fontSize: 11, marginTop: 2, marginHorizontal: 6 },
  composer: { paddingHorizontal: 10, paddingTop: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, maxHeight: 120, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  headerButton: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settings: { padding: 16, gap: 12 },
})

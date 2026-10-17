import * as Clipboard from 'expo-clipboard'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatDate, formatDateTime } from '@shared/format'
import { inviteUrl, ROLE_LABELS } from '@shared/team'
import { useAdmin } from '../../admin/AdminContext'
import { adminApi } from '../../api/admin'
import Backdrop from '../../components/Backdrop'
import { confirm } from '../../components/confirm'
import { Button, Card, ErrorText, Notice } from '../../components/ui'
import { SITE_URL } from '../../config'
import { usePagedList } from '../../hooks/usePagedList'
import { useTheme } from '../../theme'

/** Reloads `list` each time `changes` goes up (after an invite, a removal…), not on first show. */
function useReloadOn(changes, list) {
  const first = useRef(changes)
  const { reload } = list
  useEffect(() => {
    if (changes !== first.current) reload()
  }, [changes, reload])
}

function linkFrom(invite, extra = {}) {
  return { url: inviteUrl(SITE_URL, invite.token), expiresAt: invite.expires_at, ...extra }
}

function InviteLink({ link }) {
  const theme = useTheme()
  const [copied, setCopied] = useState(false)
  return (
    <View style={styles.link}>
      <Notice>
        {link.forName ? `Lien de réinvitation pour ${link.forName}. ` : ''}
        Envoyez ce lien maintenant : il ne sera plus affiché. Valable jusqu'au {formatDateTime(link.expiresAt)}.
      </Notice>
      <Text selectable style={{ color: theme.textStrong }} accessibilityLabel="Lien d'invitation">{link.url}</Text>
      <View style={styles.actions}>
        <Button onPress={() => Share.share({ message: link.url })}>Envoyer le lien</Button>
        <Button variant="secondary" onPress={async () => setCopied(await Clipboard.setStringAsync(link.url))}>
          {copied ? 'Copié !' : 'Copier le lien'}
        </Button>
      </View>
    </View>
  )
}

function Invites({ onChange, changes }) {
  const theme = useTheme()
  const invites = usePagedList('/admin/invites/', adminApi)
  useReloadOn(changes, invites)
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setError('')
    try {
      setLink(linkFrom(await adminApi('/admin/invites/', { method: 'POST' })))
      onChange()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function revoke(id) {
    if (!(await confirm("Annuler ce lien d'invitation ?", 'Il ne fonctionnera plus.', 'Annuler le lien'))) return
    try {
      await adminApi(`/admin/invites/${id}/`, { method: 'DELETE' })
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card title="Inviter un administrateur">
      <Text style={{ color: theme.text }}>
        Créez un lien, puis envoyez-le vous-même à la personne (SMS, WhatsApp…). Il ne fonctionne qu'une fois.
      </Text>
      <ErrorText>{error || invites.error}</ErrorText>
      <Button busy={busy} onPress={create}>Créer un lien d'invitation</Button>
      {link && <InviteLink key={link.url} link={link} />}
      {invites.items?.length > 0 && (
        <>
          <Text style={[styles.subtitle, { color: theme.textStrong }]}>Liens en attente</Text>
          {invites.items.map((invite) => (
            <View key={invite.id} style={styles.row}>
              <Text style={[styles.rowText, { color: theme.text }]}>
                {invite.for_user ? `Réinvitation de ${invite.for_user}` : 'Nouvel administrateur'} · créé par {invite.created_by}
                {' '}· expire le {formatDateTime(invite.expires_at)}
              </Text>
              <Button variant="danger" onPress={() => revoke(invite.id)}>Annuler</Button>
            </View>
          ))}
        </>
      )}
    </Card>
  )
}

function FormerAdmins({ onChange, changes }) {
  const theme = useTheme()
  const former = usePagedList('/admin/former-admins/', adminApi)
  useReloadOn(changes, former)
  const [link, setLink] = useState(null)
  const [error, setError] = useState('')

  async function reinvite(person) {
    setError('')
    try {
      setLink(linkFrom(await adminApi(`/admin/former-admins/${person.id}/reinvite/`, { method: 'POST' }), { forName: person.display_name }))
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!former.items?.length && !link && !former.error) return null
  return (
    <Card title="Anciens administrateurs">
      <Text style={{ color: theme.text }}>
        Un lien de réinvitation ne fonctionne que pour cette personne. Elle garde son nom et choisit un nouveau mot de passe.
      </Text>
      <ErrorText>{error || former.error}</ErrorText>
      {link && <InviteLink key={link.url} link={link} />}
      {former.items?.map((person) => (
        <View key={person.id} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: theme.textStrong }]}>{person.display_name}</Text>
            <Text style={{ color: theme.text }}>{person.email}</Text>
          </View>
          <Button variant="secondary" onPress={() => reinvite(person)}>Réinviter</Button>
        </View>
      ))}
      {former.hasMore && <Button variant="secondary" busy={former.loadingMore} onPress={former.loadMore}>Voir plus</Button>}
    </Card>
  )
}

export default function TeamScreen() {
  const { user } = useAdmin()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [changes, setChanges] = useState(0)
  const admins = usePagedList('/admin/admins/', adminApi)
  useReloadOn(changes, admins)
  const [error, setError] = useState('')
  const isOwner = user.role === 'owner'
  const onChange = () => setChanges((c) => c + 1)

  async function act(admin, path, title, message, action) {
    if (!(await confirm(title, message, action))) return
    setError('')
    try {
      await adminApi(`/admin/admins/${admin.id}/${path}/`, { method: 'POST' })
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]}>
        {isOwner && <Invites changes={changes} onChange={onChange} />}
        <Card title="Administrateurs">
          <ErrorText>{error || admins.error}</ErrorText>
          {admins.items === null ? <ActivityIndicator /> : admins.items.map((admin) => (
            <View key={admin.id} style={styles.person}>
              <Text style={[styles.name, { color: theme.textStrong }]}>{admin.display_name} · {ROLE_LABELS[admin.role]}</Text>
              <Text style={{ color: theme.text }}>{admin.email} · depuis le {formatDate(admin.date_joined)}</Text>
              {isOwner && admin.role !== 'owner' && (
                <View style={styles.actions}>
                  <Button variant="secondary" onPress={() => act(admin, 'reset-second-step',
                    'Réinitialiser la double authentification ?',
                    `${admin.display_name} devra la reconfigurer à sa prochaine connexion.`, 'Réinitialiser')}>
                    Réinitialiser la double authentification
                  </Button>
                  <Button variant="danger" onPress={() => act(admin, 'remove', `Retirer ${admin.display_name} ?`,
                    'Cette personne sera déconnectée immédiatement. Vous pourrez la réinviter plus tard.', 'Retirer')}>
                    Retirer
                  </Button>
                </View>
              )}
            </View>
          ))}
          {admins.hasMore && <Button variant="secondary" busy={admins.loadingMore} onPress={admins.loadMore}>Voir plus</Button>}
        </Card>
        {isOwner && <FormerAdmins changes={changes} onChange={onChange} />}
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  page: { padding: 12, gap: 12 },
  link: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subtitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1 },
  person: { gap: 4, paddingVertical: 6 },
  name: { fontSize: 16, fontWeight: '700' },
})

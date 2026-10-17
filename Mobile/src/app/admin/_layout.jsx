import { Stack } from 'expo-router'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useAdmin } from '../../admin/AdminContext'
import { LiveMessagesProvider } from '../../admin/LiveMessagesProvider'
import Backdrop from '../../components/Backdrop'
import LoginFlow from '../../components/admin/LoginFlow'

/**
 * The admin side. Nothing in the app links here: admins open genz://admin (or the "Admin" button that
 * appears once they are logged in on this phone). Every screen below needs a logged-in admin.
 */
export default function AdminLayout() {
  const { user } = useAdmin()
  if (user === undefined) {
    return <Backdrop><ActivityIndicator color="#fff" style={styles.loading} /></Backdrop>
  }
  if (!user) return <LoginFlow />
  return (
    <LiveMessagesProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#000' },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Administration' }} />
        <Stack.Screen name="posts" options={{ title: 'Publications' }} />
        <Stack.Screen name="compose" options={{ title: 'Publication', presentation: 'modal' }} />
        <Stack.Screen name="post/[id]" options={{ title: 'Commentaires' }} />
        <Stack.Screen name="messages/index" options={{ title: 'Messages' }} />
        <Stack.Screen name="messages/new" options={{ title: 'Nouvelle conversation' }} />
        <Stack.Screen name="messages/[id]" options={{ title: 'Conversation' }} />
        <Stack.Screen name="team" options={{ title: 'Équipe' }} />
        <Stack.Screen name="activity" options={{ title: 'Activité' }} />
      </Stack>
    </LiveMessagesProvider>
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: 48 },
})

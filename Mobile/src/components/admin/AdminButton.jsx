import { router } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useAdmin } from '../../admin/AdminContext'

/** Shown only to an admin logged in on this phone; visitors never see a way to the admin side. */
export default function AdminButton() {
  const { user } = useAdmin()
  if (!user) return null
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/admin')} hitSlop={8}>
      <Text style={styles.label}>Admin</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

import { Image } from 'expo-image'
import * as Notifications from 'expo-notifications'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AdminProvider } from '../admin/AdminProvider'
import AdminButton from '../components/admin/AdminButton'
import { notificationTarget, shouldShow } from '../notifications/push'

const LOGO = require('../../assets/genz-logo.jpg')

// Notifications show as banners even while the app is open, except for the conversation already on screen.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const show = shouldShow(notification)
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false }
  },
})

function Brand() {
  return (
    <View style={styles.brand}>
      <Image source={LOGO} style={styles.logo} contentFit="cover" />
      <Text style={styles.title}>GenZ</Text>
    </View>
  )
}

function Navigation() {
  // A tapped notification opens its post or conversation, whether the app was closed or in the background.
  const response = Notifications.useLastNotificationResponse()
  useEffect(() => {
    const target = notificationTarget(response)
    if (target) router.push(target)
  }, [response])

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#000' },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerTitle: () => <Brand />, headerRight: () => <AdminButton /> }} />
        <Stack.Screen name="publication/[id]" options={{ title: 'Publication' }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <AdminProvider>
      <Navigation />
    </AdminProvider>
  )
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
})

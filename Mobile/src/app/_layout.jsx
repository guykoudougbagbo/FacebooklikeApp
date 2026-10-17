import { Image } from 'expo-image'
import * as Notifications from 'expo-notifications'
import { router, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { notificationTarget } from '../notifications/push'

const LOGO = require('../../assets/genz-logo.jpg')

// New posts show as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

function Brand() {
  return (
    <View style={styles.brand}>
      <Image source={LOGO} style={styles.logo} contentFit="cover" />
      <Text style={styles.title}>GenZ</Text>
    </View>
  )
}

export default function RootLayout() {
  // A tapped notification opens its post, whether the app was closed or in the background.
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
        <Stack.Screen name="index" options={{ headerTitle: () => <Brand /> }} />
        <Stack.Screen name="publication/[id]" options={{ title: 'Publication' }} />
      </Stack>
    </>
  )
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
})

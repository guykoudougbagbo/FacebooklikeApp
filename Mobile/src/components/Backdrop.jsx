import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

const LOGO = require('../../assets/genz-logo-large.jpg')

/** The logo behind the content, dimmed toward black like on the website. */
export default function Backdrop({ children }) {
  return (
    <View style={styles.page}>
      <Image source={LOGO} style={styles.logo} contentFit="contain" pointerEvents="none" />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  logo: { ...StyleSheet.absoluteFillObject, margin: 16, opacity: 0.55 },
})

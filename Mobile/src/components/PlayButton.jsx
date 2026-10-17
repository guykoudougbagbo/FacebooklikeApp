import { StyleSheet, View } from 'react-native'

const TRIANGLE_WIDTH = 20
const TRIANGLE_HEIGHT = 24

/**
 * The round play button drawn with shapes, not a "▶" character (whose font spacing, or emoji form on iPhone,
 * keeps it off center). Same look as the website's: a dark circle with a white triangle.
 */
export default function PlayButton({ size = 56 }) {
  return (
    <View
      testID="play-button"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View style={styles.triangle} />
    </View>
  )
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: TRIANGLE_WIDTH,
    borderTopWidth: TRIANGLE_HEIGHT / 2,
    borderBottomWidth: TRIANGLE_HEIGHT / 2,
    borderLeftColor: '#fff',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    // A triangle looks centered when its balance point (a third of the way from its flat side) is centered.
    transform: [{ translateX: TRIANGLE_WIDTH / 6 }],
  },
})

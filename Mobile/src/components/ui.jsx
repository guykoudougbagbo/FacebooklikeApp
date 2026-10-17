import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '../theme'

export function Button({ children, onPress, variant = 'primary', busy = false, disabled = false }) {
  const theme = useTheme()
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.purple : theme.surfaceMuted, opacity: pressed || busy ? 0.7 : 1 },
      ]}
    >
      {busy && <ActivityIndicator color={primary ? '#fff' : theme.textStrong} />}
      <Text style={[styles.label, { color: primary ? '#fff' : theme.textStrong }]}>{children}</Text>
    </Pressable>
  )
}

export function ErrorText({ children }) {
  const theme = useTheme()
  if (!children) return null
  return (
    <Text accessibilityRole="alert" style={[styles.message, { color: theme.danger, backgroundColor: theme.dangerBg }]}>
      {children}
    </Text>
  )
}

export function Notice({ children }) {
  const theme = useTheme()
  return <Text style={[styles.message, { color: theme.text, backgroundColor: theme.surfaceMuted }]}>{children}</Text>
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  label: { fontSize: 15, fontWeight: '600' },
  message: { padding: 10, borderRadius: 8, fontSize: 14, marginVertical: 6 },
})

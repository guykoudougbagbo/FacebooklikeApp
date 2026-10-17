import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../theme'

export function Button({ children, onPress, variant = 'primary', busy = false, disabled = false }) {
  const theme = useTheme()
  const primary = variant === 'primary'
  const danger = variant === 'danger'
  const background = primary ? theme.purple : danger ? theme.dangerBg : theme.surfaceMuted
  const color = primary ? '#fff' : danger ? theme.danger : theme.textStrong
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: pressed || busy || disabled ? 0.6 : 1 },
      ]}
    >
      {busy && <ActivityIndicator color={color} />}
      <Text style={[styles.label, { color }]}>{children}</Text>
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

/** A labelled text box. */
export function Field({ label, hint, style, ...input }) {
  const theme = useTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textStrong }]}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={theme.text}
        style={[styles.input, { color: theme.textStrong, backgroundColor: theme.surfaceMuted }, style]} {...input} />
      {hint ? <Text style={[styles.hint, { color: theme.text }]}>{hint}</Text> : null}
    </View>
  )
}

/** A white box with a title, like the website's cards. */
export function Card({ title, children }) {
  const theme = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {title ? <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.textStrong }]}>{title}</Text> : null}
      {children}
    </View>
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
  field: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600' },
  input: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 13 },
  card: { borderRadius: 10, padding: 14, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
})

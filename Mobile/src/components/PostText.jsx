import { Linking, StyleSheet, Text } from 'react-native'
import { splitLinks } from '@shared/links'
import { useTheme } from '../theme'

/** The post's text, with web addresses opening in the browser. */
export default function PostText({ text, style }) {
  const theme = useTheme()
  if (!text) return null
  return (
    <Text style={[styles.text, { color: theme.textStrong }, style]} selectable>
      {splitLinks(text).map((part, i) =>
        typeof part === 'string' ? part : (
          <Text key={i} accessibilityRole="link" style={{ color: theme.purple }} onPress={() => Linking.openURL(part.url)}>
            {part.url}
          </Text>
        ),
      )}
    </Text>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 22 },
})

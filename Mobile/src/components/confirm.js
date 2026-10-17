import { Alert } from 'react-native'

/** Asks before something that can't be undone. Resolves to true when confirmed. */
export function confirm(title, message, action, destructive = true) {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  })
}

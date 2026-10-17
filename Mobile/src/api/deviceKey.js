import * as SecureStore from 'expo-secure-store'

// The phone's anonymous key: the server only keeps its hash, so it lives in the phone's secure storage.
const KEY = 'device_key'

export function load() {
  return SecureStore.getItemAsync(KEY)
}

export function save(value) {
  return SecureStore.setItemAsync(KEY, value)
}

export function forget() {
  return SecureStore.deleteItemAsync(KEY)
}

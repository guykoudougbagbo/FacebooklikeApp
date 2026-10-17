import * as SecureStore from 'expo-secure-store'

// The admin's login key on this phone. The server only keeps its hash, so it lives in secure storage.
const KEY = 'admin_key'

export function load() {
  return SecureStore.getItemAsync(KEY)
}

export function save(value) {
  return SecureStore.setItemAsync(KEY, value)
}

export function forget() {
  return SecureStore.deleteItemAsync(KEY)
}

/* global jest */
// Native parts the tests don't exercise, and the settings app.config.js would supply.

// The phone's FormData (files given as { uri, name, type }), not the one Node.js provides.
global.FormData = require('react-native/Libraries/Network/FormData').default

jest.mock('./src/config', () => ({ API_URL: 'https://api.test', SITE_URL: 'https://genz.test', EAS_PROJECT_ID: 'project-1' }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-video', () => ({ useVideoPlayer: jest.fn(() => ({})), VideoView: jest.fn(() => null) }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  const Stack = ({ children }) => children ?? null
  Stack.Screen = () => null
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (effect) => useEffect(() => effect(), [effect]),
    Stack,
  }
})
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }))
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }))
jest.mock('@react-native-community/slider', () => () => null)
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock')
  return mock.default ?? mock
})

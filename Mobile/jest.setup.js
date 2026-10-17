/* global jest */
// Native parts the tests don't exercise, and the settings app.config.js would supply.

jest.mock('./src/config', () => ({ API_URL: 'https://api.test', SITE_URL: 'https://genz.test', EAS_PROJECT_ID: 'project-1' }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-video', () => ({ useVideoPlayer: jest.fn(() => ({})), VideoView: () => null }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn(() => ({})) }))
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock')
  return mock.default ?? mock
})

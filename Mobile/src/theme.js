import { useColorScheme } from 'react-native'

// Same colors as the website (Frontend/src/index.css).
const brand = { purple: '#7a1fd1', orange: '#f77f00', green: '#1e8f3a' }

const light = {
  ...brand,
  page: '#000',
  surface: '#fff',
  surfaceMuted: '#e9ebee',
  text: '#4b4f56',
  textStrong: '#1c1e21',
  border: '#ccd0d5',
  danger: '#b3261e',
  dangerBg: '#fde8e7',
}

const dark = {
  ...light,
  surface: '#242526',
  surfaceMuted: '#3a3b3c',
  text: '#b0b3b8',
  textStrong: '#e4e6eb',
  border: '#3e4042',
  danger: '#ffb4ab',
  dangerBg: '#5c1a16',
}

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light
}

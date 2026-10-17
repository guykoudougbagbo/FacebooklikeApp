// Expo CLI loads Mobile/.env before reading this file. Every setting is described in Mobile/.env.example.

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required setting ${name}. Set it in Mobile/.env (see Mobile/.env.example).`)
  return value
}

// Store builds need the permanent app ID and the Expo project. Expo Go (for trying the app) doesn't.
function requiredForBuilds(name) {
  const value = process.env[name]
  if (!value && process.env.EAS_BUILD) required(name)
  return value
}

export default () => {
  const appId = requiredForBuilds('APP_BUNDLE_ID')
  const projectId = requiredForBuilds('EAS_PROJECT_ID')
  return {
    name: 'GenZ',
    slug: 'genz',
    version: '1.0.0',
    scheme: 'genz',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      ...(appId && { bundleIdentifier: appId }),
    },
    android: {
      adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#000000' },
      ...(appId && { package: appId }),
    },
    plugins: [
      'expo-router',
      'expo-status-bar',
      'expo-secure-store',
      'expo-video',
      'expo-image',
      ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 220, backgroundColor: '#000000' }],
      ['expo-notifications', { icon: './assets/notification-icon.png', color: '#7a1fd1', defaultChannel: 'default' }],
      // Admins pick photos and videos from the library; the app never uses the camera or microphone.
      ['expo-image-picker', {
        photosPermission: 'GenZ ouvre vos photos et vidéos seulement pour les publications que vous choisissez.',
        cameraPermission: false,
        microphonePermission: false,
      }],
    ],
    extra: {
      apiUrl: required('API_URL'),
      siteUrl: required('SITE_URL'),
      ...(projectId && { eas: { projectId } }),
    },
  }
}

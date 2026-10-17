import Constants from 'expo-constants'

// Checked when the app starts (app.config.js); see Mobile/.env.example.
const extra = Constants.expoConfig?.extra ?? {}

export const API_URL = extra.apiUrl
export const SITE_URL = extra.siteUrl
export const EAS_PROJECT_ID = extra.eas?.projectId

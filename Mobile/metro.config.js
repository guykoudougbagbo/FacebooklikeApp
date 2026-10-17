const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

// Logic shared with the website lives in ../Shared, imported as "@shared/..." (alias in jsconfig.json).
const SHARED = path.resolve(__dirname, '../Shared')

const config = getDefaultConfig(__dirname)
config.watchFolders = [...(config.watchFolders ?? []), SHARED]
// Shared/ has no packages of its own: helpers Babel adds to its files come from this app's node_modules.
config.resolver.nodeModulesPaths = [...config.resolver.nodeModulesPaths, path.resolve(__dirname, 'node_modules')]

module.exports = config

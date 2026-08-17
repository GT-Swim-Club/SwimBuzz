const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// Watch only workspace packages the app imports. Watching the whole monorepo
// (including apps/web) from iCloud Drive makes the first bundle hang in Expo Go.
config.watchFolders = [
  path.resolve(workspaceRoot, "packages/api"),
  path.resolve(workspaceRoot, "packages/shared"),
  path.resolve(workspaceRoot, "packages/tokens"),
  path.resolve(workspaceRoot, "packages/ui"),
]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]
config.resolver.disableHierarchicalLookup = true

module.exports = config

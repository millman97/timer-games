// Generate Expo's route declarations without starting Metro or a watcher.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
process.env.EXPO_ROUTER_APP_ROOT = path.resolve('src/app');
fs.mkdirSync('.expo/types', { recursive: true });
cliRequire('@expo/router-server/build/typed-routes').regenerateDeclarations(
  path.resolve('.expo/types'),
  {},
);

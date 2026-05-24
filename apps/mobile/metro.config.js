// Metro config — Expo SDK 54 default + monorepo extensions for the
// `@autotradeil/shared-types` workspace package.
//
// Why this file exists:
//   * `watchFolders` tells Metro to scan ../../packages/shared-types
//     for changes. Without it, edits to the shared package don't
//     trigger a re-bundle.
//   * `nodeModulesPaths` lets Metro resolve the workspace's hoisted
//     dependencies (everything in the repo-root node_modules — pnpm
//     stores transitive deps there). Without it, `import` from inside
//     the shared package fails when its deps live one directory up.
//   * `unstable_enableSymlinks: true` is the pnpm-on-Windows escape
//     hatch — pnpm creates real symlinks under node_modules and Metro
//     ignores them by default on older releases.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, "packages/shared-types"),
];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ],
  unstable_enableSymlinks: true,
  unstable_enablePackageExports: true,
};

module.exports = config;

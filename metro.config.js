// Metro bundler config for Qitlo Mobile.
//
// Default Metro only resolves modules within the project root. We depend on
// `qitlo-shared` via `file:../Qitlo-Shared` (a symlink in node_modules
// pointing to a sibling folder), so we have to:
//
//   1. Add the sibling folder to `watchFolders` so Metro will read files
//      from it and rebundle when they change.
//   2. Pin `nodeModulesPaths` to the project's own node_modules so resolution
//      doesn't get confused by the sibling's deps.
//
// This is the standard pattern documented in
// https://docs.expo.dev/guides/monorepos/ — even though we're not strictly a
// monorepo, the sibling-package setup is the same shape.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "..", "Qitlo-Shared");

const config = getDefaultConfig(projectRoot);

// Watch the sibling shared package so changes get picked up and Metro can
// actually read its files (the qitlo-shared symlink in node_modules
// resolves into here).
config.watchFolders = [sharedRoot];

// Resolve all `require` lookups via the project's own node_modules tree.
// Without this, Metro may try to pull duplicates of React from the sibling
// package's node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
];

// Metro 0.79+ enables symlink resolution by default, but we set it
// explicitly so older Expo SDKs work too.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;

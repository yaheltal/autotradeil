module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./src",
            // Metro doesn't read tsconfig paths. The shared workspace
            // package gets resolved here at bundle time. Points at the
            // BUILT `dist/` (not raw src/) so Metro doesn't try to
            // re-transpile the package's TypeScript itself — the
            // package's own `pnpm build` produces ESM JS + .d.ts that
            // both Metro and tsc consume directly.
            "@autotradeil/shared-types": "../../packages/shared-types/dist",
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
        },
      ],
    ],
  };
};

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Native flat-config exports (eslint-config-next >= 15), not the legacy
// FlatCompat('next/core-web-vitals') shim -- that path hits a known
// "Converting circular structure to JSON" crash on ESLint 9 (the legacy
// validator trips over the same plugin object being reachable under two
// names). This is the export eslint-config-next ships specifically to
// avoid that, now that `next lint` itself (which used to paper over this)
// was removed in Next 16 -- see package.json's "lint" script.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // '**/.next/**' (not just '.next/**') so this also catches admin/.next --
    // a plain '.next/**' only matches a top-level .next folder from this
    // config file's own directory, so admin's build output was slipping
    // through into `npm run lint` (eslint . from repo root) every time it
    // had been built locally; android/**/build/** for the same reason --
    // Android's build intermediates (generated JS bundled into the native
    // app shell) aren't source either.
    ignores: ['**/node_modules/**', '**/.next/**', 'public/**', 'scripts/**', 'android/**/build/**'],
  },
];

export default eslintConfig;

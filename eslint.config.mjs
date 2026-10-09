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
    // admin/ is excluded here, not just admin/.next -- it's a separate
    // Next.js app with its own eslint.config.mjs, own node_modules, and
    // its own CI job (ci.yml's admin-app job) that already lints it
    // correctly. Sweeping it in from here too was actively misleading:
    // the SAME rule (@next/next/no-html-link-for-pages) reported real,
    // needed eslint-disable comments there as "unused" under this
    // config's plugin resolution, while admin's own `npm run lint`
    // correctly flags them as still load-bearing. Found this the hard
    // way while clearing the lint backlog -- almost removed 4 real
    // suppressions before admin's own lint caught it.
    ignores: ['**/node_modules/**', '**/.next/**', 'public/**', 'scripts/**', 'android/**/build/**', 'admin/**'],
  },
];

export default eslintConfig;

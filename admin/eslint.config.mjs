import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Native flat-config exports (eslint-config-next >= 15), not the legacy
// FlatCompat('next/core-web-vitals') shim -- that path hits a known
// "Converting circular structure to JSON" crash on ESLint 9. This is the
// export eslint-config-next ships specifically to avoid that, now that
// `next lint` itself (which used to paper over this) was removed in
// Next 16 -- see package.json's "lint" script.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['node_modules/**', '.next/**', 'public/**', 'scripts/**'],
  },
];

export default eslintConfig;

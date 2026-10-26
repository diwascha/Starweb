import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Next 16 removed `next lint`; ESLint runs directly with Next's shared rules.
export default [
  ...nextVitals,
  ...nextTs,
  { ignores: ['out/**', '.next/**', 'src-tauri/**', 'node_modules/**', 'scripts/**', 'supabase/**'] },
];

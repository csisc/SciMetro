// Builds the harness with the project's own Vite configuration (production mode, relative base).
import { build } from 'vite';
const out = process.argv[2];
await build({ configFile: 'vite.config.ts', logLevel: 'silent', build: { outDir: out, emptyOutDir: true, rollupOptions: { input: 'tests/browser/harness.html' } } });
console.log('harness built in', out);

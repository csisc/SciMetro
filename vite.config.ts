import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs: the same build works at the site root, on a GitHub Pages project site
  // (https://user.github.io/<repo>/) and on a custom domain. An absolute base ("/") makes every
  // script, style and font 404 on a project site and leaves a blank page.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});

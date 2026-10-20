import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' : le build fonctionne tel quel sur GitHub Pages (sous-dossier) ou en ouvrant dist/.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});

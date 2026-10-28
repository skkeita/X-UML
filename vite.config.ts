import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import { readFileSync } from 'node:fs';

/** Polices chargées par CSS (non détectées par l'analyse JS) : leur licence OFL doit aussi être livrée. */
const CSS_PACKAGES = ['@fontsource/ibm-plex-sans', '@fontsource/ibm-plex-mono'];
const cssDeps = () =>
  CSS_PACKAGES.map((name) => {
    const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
    return { name, version: pkg.version, license: pkg.license, author: pkg.author, repository: pkg.repository, licenseText: readFileSync(`node_modules/${name}/LICENSE`, 'utf8') };
  });

// base './' : le build fonctionne tel quel sur GitHub Pages (sous-dossier) ou en ouvrant dist/.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Licences des composants tiers réellement livrés au navigateur (obligation des licences MIT / OFL :
    // conserver leurs textes). Générées à chaque build → la liste ne peut pas se périmer.
    {
      ...license({
        thirdParty: {
          includePrivate: false,
          output: {
            file: 'dist/third-party-licenses.txt',
            template(deps) {
              const head =
                'X-UML inclut les composants open source suivants.\nTexte complet de chaque licence ci-dessous.\n\n';
              return (
                head +
                [...deps, ...cssDeps()]
                  .map(
                    (d) =>
                      `${'='.repeat(72)}\n${d.name}@${d.version}\nLicence : ${d.license ?? 'voir ci-dessous'}\n${typeof d.author === 'object' && d.author?.name ? `Auteur : ${d.author.name}\n` : ''}${d.repository && typeof d.repository !== 'string' ? `Source : ${d.repository.url}\n` : ''}${'-'.repeat(72)}\n${(d.licenseText ?? '').trim()}\n`,
                  )
                  .join('\n')
              );
            },
          },
        },
      }),
      apply: 'build',
    },
  ],
  test: { environment: 'node' },
});

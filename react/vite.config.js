// https://vite.dev/config/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    // Increase warning limit to handle bundled RTC SDK (~1.8 MB unminified)
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Separate large vendor SDKs into their own chunks for better caching
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-realtime': ['ably'],
          'vendor-rtc': ['agora-rtc-sdk-ng'],
        },
      },
      plugins: [
        // ── Automatic OSS License Notice Generation ──────────────────────
        // Collects all third-party licenses from bundled npm packages and
        // writes them to dist/THIRD_PARTY_LICENSES.txt at build time.
        //
        // This satisfies the attribution requirements of:
        //   MIT      — agora-rtc-sdk-ng, react, react-dom, dayjs, ...
        //   Apache-2 — ably, firebase, ...
        //
        // Enterprise customers may request this file for legal compliance.
        license({
          thirdParty: {
            output: {
              file: path.join('dist', 'THIRD_PARTY_LICENSES.txt'),
              template(dependencies) {
                return [
                  '================================================================================',
                  'THIRD-PARTY LICENSES',
                  'HyperBabel React Demo',
                  '================================================================================',
                  '',
                  'This application bundles the following open-source packages.',
                  'Their respective licenses are reproduced below.',
                  '',
                  '================================================================================',
                  '',
                  ...dependencies.map((dep) => [
                    `Package : ${dep.name}@${dep.version}`,
                    `License : ${dep.license}`,
                    dep.author?.name ? `Author  : ${dep.author.name}` : null,
                    dep.homepage ? `Homepage: ${dep.homepage}` : null,
                    '',
                    dep.licenseText
                      ? dep.licenseText.trim()
                      : '(Full license text not available — see the package homepage)',
                    '',
                    '--------------------------------------------------------------------------------',
                    '',
                  ].filter(Boolean).join('\n')),
                ].join('\n');
              },
            },
          },
        }),
      ],
    },
  },
});

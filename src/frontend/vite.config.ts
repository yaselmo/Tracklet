import { platform, release } from 'node:os';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import { defineConfig } from 'vite';
import istanbul from 'vite-plugin-istanbul';

import { __INVENTREE_VERSION_INFO__ } from './version-info';

// Detect if the current environment is WSL
// Required for enabling file system polling
const IS_IN_WSL = platform().includes('WSL') || release().includes('WSL');
const USE_POLLING = process.env.VITE_USE_POLLING === 'true' || IS_IN_WSL;
const BACKEND_PROXY_TARGET =
  process.env.VITE_BACKEND_PROXY_TARGET ?? 'http://localhost:8000';

if (USE_POLLING) {
  console.log('Using polling for file system events');
}

// Output directory for the built files
const OUTPUT_DIR = '../../src/backend/Tracklet/web/static/web';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // In 'build' mode, we want to use an empty base URL (for static file generation)
  const baseUrl: string | undefined = command === 'build' ? '' : undefined;

  return {
    plugins: [
      react({
        babel: {
          plugins: ['macros']
        }
      }),
      vanillaExtractPlugin(),
      license({
        sourcemap: true,
        thirdParty: {
          includePrivate: true,
          multipleVersions: true,
          output: {
            file: `${OUTPUT_DIR}/.vite/dependencies.json`,
            template(dependencies) {
              return JSON.stringify(dependencies);
            }
          }
        }
      }),
      istanbul({
        include: ['src/*', 'lib/*'],
        exclude: ['node_modules', 'test/'],
        extension: ['.js', '.ts', '.tsx'],
        requireEnv: true
      }),
      codecovVitePlugin({
        enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
        bundleName: 'pui_v1',
        uploadToken: process.env.CODECOV_TOKEN
      })
    ],
    // When building, set the base path to an empty string
    // This is required to ensure that the static path prefix is observed
    base: baseUrl,
    build: {
      manifest: true,
      outDir: OUTPUT_DIR,
      sourcemap: true
    },
    resolve: {
      alias: {
        '@lib': '/lib'
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/media': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: true,
          secure: true
        },
        '/static': {
          target: BACKEND_PROXY_TARGET,
          changeOrigin: true,
          secure: true
        }
      },
      watch: {
        // Use polling where filesystem notifications are unreliable (WSL / container bind mounts)
        // Ref: https://github.com/vitejs/vite/issues/1153#issuecomment-785467271
        usePolling: USE_POLLING
      }
    },
    define: {
      ...__INVENTREE_VERSION_INFO__
    }
  };
});

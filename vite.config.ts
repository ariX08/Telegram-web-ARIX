/// <reference types="vitest/config" />
import {defineConfig, searchForWorkspaceRoot} from 'vite';
import solidPlugin from 'vite-plugin-solid';
// @ts-ignore no type declarations
import handlebars from 'vite-plugin-handlebars';
import basicSsl from '@vitejs/plugin-basic-ssl';
// import devtools from 'solid-devtools/vite'
import autoprefixer from 'autoprefixer';
import {resolve} from 'path';
import {existsSync, copyFileSync, readFileSync, realpathSync} from 'fs';
import {createHash} from 'crypto';
import {Plugin, ServerOptions} from 'vite';
import {vitestWorkers} from './scripts/testQueue';
import devChecks from './scripts/dev-checks.mjs';
import settingsSearchPlugin from './scripts/settings-search-plugin.mjs';
import watchTransformCache from './scripts/watch-transform-cache.mjs';
import hotReloadPlugin from './scripts/hot-reload-plugin.mjs';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';

const require = createRequire(import.meta.url);
const {watchLangFile} = require('./watch-lang.js') as typeof import('./watch-lang.js');
const {watchScssTypes} = require('./scss-types.js') as typeof import('./scss-types.js');

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(rootDir, 'certs');
const ENV_LOCAL_FILE_PATH = path.join(rootDir, '.env.local');
const LANG_PACK_LOCAL_FILE_PATH = path.join(rootDir, 'src', 'langPackLocalVersion.ts');
const NODE_MODULES_PATH = path.join(rootDir, 'node_modules');
const SERVER_FS_ALLOW = new Set([searchForWorkspaceRoot(rootDir)]);

if(existsSync(NODE_MODULES_PATH)) {
  SERVER_FS_ALLOW.add(realpathSync(NODE_MODULES_PATH));
}

const isDEV = process.env.NODE_ENV === 'development';
const generateDevCssModuleScopedName = (name: string, filename: string) => {
  const relativePath = path.relative(rootDir, filename).split(path.sep).join('/');
  const fileHash = createHash('sha1').update(relativePath).digest('hex').slice(0, 10);
  return `_${name}_${fileHash}`;
};

if(!existsSync(LANG_PACK_LOCAL_FILE_PATH)) {
  copyFileSync(path.join(rootDir, 'src', 'langPackLocalVersion.example.ts'), LANG_PACK_LOCAL_FILE_PATH);
}

if(isDEV) {
  if(!existsSync(ENV_LOCAL_FILE_PATH)) {
    copyFileSync(path.join(rootDir, '.env.local.example'), ENV_LOCAL_FILE_PATH);
  }
  if(!process.env.TWEB_E2E) {
    watchLangFile();
    watchScssTypes();
  }
}

const handlebarsPlugin = handlebars({
  context: {
    title: 'KuchuGRAM',
    description: 'KuchuGRAM — a custom messaging client focused on speed and security.',
    url: 'https://kuchugram.vercel.app/',
    origin: 'https://kuchugram.vercel.app/'
  }
});

const USE_SSL = false;
const USE_SIGNED_CERTS = USE_SSL && true;
const USE_SELF_SIGNED_CERTS = USE_SSL && false;
const host = USE_SSL ? 'web.telegram.org' : 'localhost';

const DEV_HTTP2_KEY = path.join(certsDir, 'localhost-key.pem');
const DEV_HTTP2_CERT = path.join(certsDir, 'localhost.pem');
const USE_DEV_HTTP2 = !USE_SSL && !process.env.TWEB_PREVIEW && !process.env.VITEST &&
  existsSync(DEV_HTTP2_KEY) && existsSync(DEV_HTTP2_CERT);

const serverOptions: ServerOptions = {
  host,
  port: USE_SSL ? 443 : 8080,
  fs: {
    allow: [...SERVER_FS_ALLOW],
    deny: [
      '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
      '**/tmp/*', '**/tmp/!(vite-preview-cache|vite-e2e-cache)/**'
    ]
  },
  watch: {
    ignored: [
      resolve(rootDir, '.claude') + '/**',
      resolve(rootDir, '.pnpm-store') + '/**',
      resolve(rootDir, 'tmp') + '/**',
      '**/*.module.d.scss.ts'
    ]
  },
  sourcemapIgnoreList(sourcePath, sourcemapPath) {
    return sourcePath.includes('node_modules') ||
      sourcePath.includes('logger') ||
      sourcePath.includes('eventListenerBase');
  },
  https: USE_SIGNED_CERTS ? {
    key: path.join(certsDir, host + '-key.pem'),
    cert: path.join(certsDir, host + '.pem')
  } : USE_DEV_HTTP2 ? {
    key: readFileSync(DEV_HTTP2_KEY),
    cert: readFileSync(DEV_HTTP2_CERT)
  } : undefined
};

const SOLID_SRC_PATH = 'src/solid/packages/solid';
const SOLID_BUILT_PATH = 'src/vendor/solid';
const USE_SOLID_SRC = false;
const SOLID_PATH = USE_SOLID_SRC ? SOLID_SRC_PATH : SOLID_BUILT_PATH;
const USE_OWN_SOLID = existsSync(resolve(rootDir, SOLID_PATH));

const NO_MINIFY = false;
const BASIC_SSL_CONFIG: Parameters<typeof basicSsl>[0] = USE_SELF_SIGNED_CERTS ? {
  name: host,
  certDir: certsDir
} : undefined;

const ADDITIONAL_ALIASES = {
  'solid-transition-group': resolve(rootDir, 'src/vendor/solid-transition-group'),
  '@components': resolve(rootDir, 'src/components'),
  '@helpers': resolve(rootDir, 'src/helpers'),
  '@hooks': resolve(rootDir, 'src/hooks'),
  '@stores': resolve(rootDir, 'src/stores'),
  '@lib': resolve(rootDir, 'src/lib'),
  '@appManagers': resolve(rootDir, 'src/lib/appManagers'),
  '@richTextProcessor': resolve(rootDir, 'src/lib/richTextProcessor'),
  '@environment': resolve(rootDir, 'src/environment'),
  '@customEmoji': resolve(rootDir, 'src/lib/customEmoji'),
  '@config': resolve(rootDir, 'src/config'),
  '@vendor': resolve(rootDir, 'src/vendor'),
  '@layer': resolve(rootDir, 'src/layer'),
  '@types': resolve(rootDir, 'src/types'),
  '@': resolve(rootDir, 'src')
};

if(USE_OWN_SOLID) {
  console.log('using own solid', SOLID_PATH, 'built', !USE_SOLID_SRC);
} else {
  console.log('using original solid');
}

function compileHintsPlugin(): Plugin {
  const hint = '//# allFunctionsCalledOnLoad\n';
  return {
    name: 'compile-hints',
    apply: 'build',
    augmentChunkHash: () => hint,
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for(const chunk of Object.values(bundle)) {
          if(chunk.type !== 'chunk') continue;
          chunk.code = hint + chunk.code;
          const mapAsset = bundle[chunk.fileName + '.map'];
          if(mapAsset?.type === 'asset') {
            const map = JSON.parse(String(mapAsset.source));
            map.mappings = ';' + map.mappings;
            mapAsset.source = JSON.stringify(map);
          }
        }
      }
    }
  };
}

function preloadHelperCssWaitPlugin(): Plugin {
  const waitRe = /new Promise\(\(res, rej\) => \{\s*link\.addEventListener\("load", res\);\s*link\.addEventListener\("error", \(\) => rej\([^;]*?\)\);\s*\}\)/;
  return {
    name: 'preload-helper-css-wait',
    apply: 'build',
    transform(code, id) {
      if(!id.includes('vite/preload-helper')) return;
      if(!waitRe.test(code)) {
        throw new Error('preload-helper-css-wait: the CSS wait in Vite\'s preload helper changed, update the plugin');
      }

      return {
        code: code.replace(waitRe, '__waitForPreloadedCss(link, dep)') + `
function __waitForPreloadedCss(link, dep) {
  return new Promise((res, rej) => {
    link.addEventListener("load", res);
    link.addEventListener("error", () => rej(new Error(\`Unable to preload CSS for \${dep}\`)));
  });
}`,
        map: null
      };
    }
  };
}

export default defineConfig({
  plugins: [
    process.env.VITEST || process.env.TWEB_PREVIEW ? undefined : devChecks(rootDir),
    process.env.VITEST ? undefined : settingsSearchPlugin(),
    watchTransformCache(),
    hotReloadPlugin(),
    solidPlugin(),
    handlebarsPlugin as any,
    compileHintsPlugin(),
    preloadHelperCssWaitPlugin(),
    USE_SELF_SIGNED_CERTS ? basicSsl(BASIC_SSL_CONFIG) : undefined,
    process.env.ANALYZE ? import('rollup-plugin-visualizer').then(({visualizer}) => visualizer({
      gzipSize: true,
      template: 'treemap'
    })) : undefined
  ].filter(Boolean),
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/.pnpm-store/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/solid/**',
      'e2e/**',
      'tmp/**'
    ],
    environment: 'jsdom',
    testTimeout: 15_000,
    hookTimeout: 30_000,
    pool: 'forks',
    maxWorkers: vitestWorkers(),
    globals: true,
    setupFiles: ['./src/tests/setup.ts']
  },
  server: serverOptions,
  base: '',
  optimizeDeps: {
    entries: ['index.html', 'src/**/*.worker.{ts,js}']
  },
  build: {
    target: 'es2020',
    cssTarget: ['chrome87', 'edge87', 'firefox78', 'safari14.1'],
    sourcemap: true,
    assetsDir: '',
    copyPublicDir: false,
    emptyOutDir: true,
    minify: NO_MINIFY ? false : undefined,
    rolldownOptions: {
      output: {
        sourcemapIgnoreList: serverOptions.sourcemapIgnoreList
      }
    }
  },
  worker: {
    format: 'es'
  },
  css: {
    devSourcemap: true,
    modules: isDEV ? {
      generateScopedName: generateDevCssModuleScopedName
    } : undefined,
    postcss: {
      plugins: [
        autoprefixer({})
      ]
    }
  },
  resolve: {
    alias: USE_OWN_SOLID ? {
      'rxcore': resolve(rootDir, SOLID_PATH, 'web/core'),
      'solid-js/jsx-runtime': resolve(rootDir, SOLID_PATH, 'dist', isDEV ? 'dev.js' : 'solid.js'),
      'solid-js/html': resolve(rootDir, SOLID_PATH, 'html/dist/html.js'),
      'solid-js/h': resolve(rootDir, SOLID_PATH, 'h/dist/h.js'),
      'solid-js/web': resolve(rootDir, SOLID_PATH, 'web/dist', isDEV ? 'dev.js' : 'web.js'),
      'solid-js/store': resolve(rootDir, SOLID_PATH, 'store/dist', isDEV ? 'dev.js' : 'store.js'),
      'solid-js': resolve(rootDir, SOLID_PATH, 'dist', isDEV ? 'dev.js' : 'solid.js'),
      ...ADDITIONAL_ALIASES
    } : ADDITIONAL_ALIASES
  }
});

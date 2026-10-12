import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[react()],css:{postcss:{plugins:[tailwindcss()]}},
  build:{outDir:fileURLToPath(new URL('../../.cache/advisor-staging-assets',import.meta.url)),emptyOutDir:true,sourcemap:false},server:{host:'127.0.0.1'}});

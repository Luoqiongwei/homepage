// https://astro.build/config
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'fs';
import path from 'path';

const targetDir = 'src/content/game-docs';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

export default defineConfig({
  site: "https://luoqiongwei.github.io/homepage", 
  base: "/homepage/", 
  outDir: "./dist", 
  integrations: [sitemap()],
  output: "static", 
  trailingSlash: 'always',
  build: {
    format: "directory", 
  },
});

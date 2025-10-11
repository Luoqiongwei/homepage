// https://astro.build/config
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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

// https://astro.build/config
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: "https://luoqiongwei.github.io/homepage", 
  base: "/homepage/", 
  outDir: "./dist", 
  output: "static", 
  trailingSlash: 'always',
  build: {
    format: "directory", 
  },
});

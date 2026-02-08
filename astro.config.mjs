// https://astro.build/config
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'fs';
import path from 'path';

const sourceDir = 'external/game';
const targetDir = 'src/content/game-docs';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

if (fs.existsSync(sourceDir)) {
  const files = fs.readdirSync(sourceDir);
  
  files.forEach(file => {
    if (file.endsWith('.md')) {
      const srcPath = path.join(sourceDir, file);
      const destPath = path.join(targetDir, file);
      
      try {
        fs.copyFileSync(srcPath, destPath);
        console.log(`已同步文档: ${file}`);
      } catch (err) {
        console.error(`复制 ${file} 失败:`, err);
      }
    }
  });
} else {
  console.warn('未找到 external/game 目录，跳过文档同步');
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

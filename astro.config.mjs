// https://astro.build/config
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: "https://luoqiongwei.github.io/homepage", // ✅ 完整站点地址
  base: "/homepage/", // ✅ GitHub Pages 仓库名
  outDir: "./dist", // ✅ 输出目录
  output: "static", // ✅ 确保是静态站点
  build: {
    format: "directory", // ✅ 使用目录结构（不生成 .html）
  },
});

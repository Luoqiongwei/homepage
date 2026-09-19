# 洛穹偎的一家言

![Node.js](https://img.shields.io/badge/node.js-%3E%3D20.x-brightgreen?logo=node.js&logoColor=white)
![Astro](https://img.shields.io/badge/astro-5.14.1-orange?logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5.9.3-blue?logo=typescript&logoColor=white)

「洛穹偎的一家言」是洛穹偎的个人静态站点，收录随笔、番剧与游戏评论，也承载一些交互实验和游戏原型。项目使用 Astro 5 构建，不依赖 React、Vue 等前端框架。

- 站点：<https://luoqiongwei.github.io/homepage/>
- 作者：[洛穹偎](https://github.com/Luoqiongwei)

## 主要内容

- 文章目录与近期文章：首页展示近期内容，文章页按主题分类维护。
- 亮色/暗色主题：主题偏好保存在浏览器本地。
- 系统装饰：可选开关的心电图效果，以及 Canvas 动态句子场、余烬生命游戏等计算艺术视觉实验。
- 工具与实验：包括「从夯到拉」、Marching Cubes 技术页和「熔炉 · 边界站」原型。
- Markdown 文档：通过 Astro Content Collections 生成游戏设计文档页面。
- Live2D 展示：站内角色「疏燕 · 偎红」。

## 技术栈

- Astro 5 + TypeScript
- `@astrojs/sitemap`
- `sharp` / Astro Images
- Bootstrap 5、Font Awesome、Google Fonts（CDN）
- 原生 JavaScript、Canvas、Web Worker 与 Live2D Cubism Web 运行时

站点采用纯静态输出，部署目标固定为 GitHub Pages 的 `/homepage/` 子路径。

## 项目结构

```text
/
├── .github/workflows/        # GitHub Pages 部署流程
├── public/
│   ├── assets/               # favicon 与文章插图
│   ├── css/                  # 全站及特殊页面样式
│   ├── js/                   # 全站脚本
│   ├── live2d/               # Live2D 查看器、模型与许可声明
│   └── tools/furnace/        # 独立游戏原型
├── src/
│   ├── assets/img/           # 由 Astro 优化的页面头图
│   ├── components/           # 页面与交互组件
│   ├── config/               # Live2D 等功能配置
│   ├── content/game-docs/    # 游戏文档 Markdown
│   ├── layouts/              # 通用、文章与特殊样式布局
│   ├── pages/                # 文件路由、文章与工具页面
│   └── scripts/              # Canvas 组件运行时与 Worker
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## 本地开发

需要 Node.js 20.x 或更高版本，以及 npm 9.x 或更高版本。

```bash
git clone https://github.com/Luoqiongwei/homepage.git
cd homepage
npm ci
npm run dev
```

开发站点地址为 <http://localhost:4321/homepage/>。由于生产环境部署在子路径，开发时也应从 `/homepage/` 访问，而不是站点根路径。

### 可用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Astro 开发服务器 |
| `npm run build` | 构建静态站点到 `dist/` |
| `npm run preview` | 预览已构建的站点 |

## 内容维护

文章使用 Astro 页面。先在 `src/pages/post/` 新建文件：

```astro
---
import PostLayout from "../../layouts/PostLayout.astro";
import bg from "../../assets/img/post-bg.jpg";
---

<PostLayout
  title="示例文章"
  subtitle="副标题"
  date="September 20, 2026"
  upload="September 20, 2026"
  background={bg}
>
  <p>这里是文章正文。</p>
</PostLayout>
```

## 构建与部署

`astro.config.mjs` 已配置静态输出、sitemap、末尾斜杠和 `/homepage/` base。执行 `npm run build` 后，产物位于 `dist/`。

推送到 `main` 分支会触发 GitHub Actions：`withastro/action@v3` 负责安装与构建，`actions/deploy-pages@v4` 发布到 GitHub Pages。工作流也支持在 Actions 页面手动触发。

## 许可

- 代码采用 [MIT License](LICENSE)。
- 原创文章、评论与一般图像内容采用 [CC BY-NC 4.0](CONTENT-LICENSE)，转载须署名“洛穹偎”并附原文链接，且不得商用。
- `public/live2d/model/` 下的角色模型、纹理与动作资产不适用上述两项许可；详情见 `public/live2d/rights.html`。
- `public/live2d/vendor/` 中的第三方运行库遵循各自许可。

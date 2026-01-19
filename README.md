# 洛穹偎的一家言

这是一个基于 Astro 的个人静态博客模板，使用 Bootstrap 的栅格系统。仓库包含站点源码、组件与样式，适合用于写个人文章、展示作品或搭建简洁的静态博客。

## 目录（快速导航）

- [特性](#特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [常用操作示例](#常用操作示例)
- [部署](#部署)
- [许可](#许可)

## 特性

- 响应式布局（Bootstrap 5）
- 支持亮/暗主题切换
- 组件：导航、页首 Hero、文章预览、图片/视频嵌入组件
- 使用 Astro 进行静态页面生成，构建速度快，兼容 Markdown 页面

## 技术栈

- 框架：Astro
- 打包/运行：Node.js + npm

## 项目结构

```
/
├── .astro/                
├── .github/               # workflows
├── public/                # 静态资源
│   ├── assets/
│   ├── css/
│   └── js/
├── src/
│   ├── components/
│   ├── layouts/
│   └── pages/
├── package.json
├── astro.config.mjs
└── README.md
```

组件说明（位于 `src/components/`）

- `Navbar.astro`：站点导航条，包含主题切换按钮
- `HeroHeader.astro`：页面顶部大图与标题区域
- `IllustrationEmbed.astro`：在文章中嵌入图片，支持多行 caption、align、宽度和可选轻盒（lightbox）行为
- `VideoEmbed.astro`：嵌入视频（对某些源自动追加参数）
- `PostPreview.astro`：文章列表项的预览样式

## 快速开始

先确保已安装 Node.js。

安装依赖：

```bash
npm install
```

本地开发：

```bash
npm run dev
```

默认 `package.json` 中 `dev` 脚本使用了 `--base /homepage/`，运行后可在浏览器访问：

```
http://localhost:4321/homepage/
```

若希望在根路径运行，编辑 `package.json` 中的 `dev` 脚本或在 `astro.config.mjs` 中修改 `base`。

## 常用操作示例

1) 新增一篇文章（`.astro`）：

在 `src/pages/post/` 新建文件，比如 `my-first-post.astro`，示例：

```astro
---
import PostLayout from '../../layouts/PostLayout.astro';
---
<PostLayout title="示例文章" subtitle="副标题" meta="2025-12-11">
  <p>这里是文章正文。</p>
</PostLayout>
```

2) 在文章中嵌入图像（多行 caption 示例）：

```astro
---
import IllustrationEmbed from '../../components/IllustrationEmbed.astro';
---
<IllustrationEmbed src="/assets/img/post-bg.jpg" alt="示例图" caption="第一行说明|第二行说明" width="80%" />
```

3) 暗色模式说明：

- 在页面右上角的导航栏有主题切换按钮，会将偏好保存到 `localStorage`（key=`theme-preference`）。
- 暗色主题的变量定义位于`public/css/styles.css`较靠后的位置 ；亮色变量在 `public/css/styles.css` 的 `:root` 中。


## 部署

推荐使用 GitHub Pages、Netlify、Vercel 等静态托管服务。主要步骤：

1. 在 `astro.config.mjs` 中确认 `base` 与 `site` 设置（若部署到子路径，需设置 `base`）。
2. 运行 `npm run build`。
3. 将 `dist/` 目录的内容上传到静态主机。

若使用 GitHub Actions 自动部署，可参考 Astro 官方和你的托管平台的示例工作流。

## 许可

### Code License
本项目的所有代码（包括 /src, /public 中的脚本、组件、样式等）均采用 MIT License 授权。  
详见根目录下的 LICENSE 文件。

### Content License
所有原创文章内容（包括随笔、评论、图像等），除另行注明外，均采用 CC BY-NC 4.0 协议授权。  
允许非商业转载，但必须注明作者“洛穹偎”及原文链接。  
不得将内容用于任何商业用途。

协议全文：
https://creativecommons.org/licenses/by-nc/4.0/

---

作者：洛穹偎
仓库：[https://github.com/Luoqiongwei/homepage](https://github.com/Luoqiongwei/homepage)
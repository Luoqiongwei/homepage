# 第二阶段 Live2D 网页与嵌入组件

来源：Live2D 素材项目中 2026-09-28 的 `web_v2/public/`，模型来自 `cubism/second_stage/export/`。本目录包含真实 MOC3、4096 纹理、7 种表情、5 段动作，以及 pixi-live2d-display 0.4.0、PixiJS 6.5.10、Cubism Core 5.1。本地资源独立完整，不依赖 Live2D 项目的开发服务器。

- `index.html`：完整互动页。
- `index.html?embed=1`：紧凑 iframe，同一套模型与互动逻辑。

Tools 及嵌入组件不提供到完整页的跳转。界面使用简短的功能文案，角色多数触碰只做动作、不显示台词；日常触碰保持平静，打招呼和唤醒等仅有简短回应。微笑、害羞等表情仍可手动选择，不设置熟悉度系统。
- `mode.js` / `embed.css`：嵌入布局。
- `embed.mjs`：父页面连接器，复用第一阶段的同源连接与离屏检测，同步网站主题。
- `embed-runtime.mjs`：子页面接口，只接受同源父窗口、指定消息通道及明确允许的方法。
- `app.mjs`：网页渲染、触碰、设置及显示控制。
- `controller.mjs` / `dynamics.mjs` / `motion.mjs`：表情、动作与次级动态的统一参数驱动。
- `model/source-manifest.json`：模型来源记录与文件清单。

第一阶段保留在上一级目录，没有替换它的模型或运行代码。第二阶段 iframe 默认值来自站点 `src/config/live2d.json` 的 `secondStage`；嵌入时不读取或写入独立页面的偏好存储。

## iframe 接口

父页面按第一阶段的方式，从 `window.live2dCharacters.get('site-character')` 取得接口；先等待 `api.ready`，再调用 `setExpression`、`play`、`interact`、`pause`、`setParameter`、`releaseParameter`、`lookAt`、`setDynamics`、`configure` 或 `getState`。

新版表情 ID 为 `neutral / smile / relaxed / shy / annoyed / surprised / sleepy`；动作是 `idle / nod / tilt / wink / talk`；触碰包括 `pat / face / hair / ribbon / body / greet / sleep / wake`。暂停状态不会因普通表情或触碰请求自动解除。

中性表情支持独立眼球移动；其他表情使用整眼差分。嘴型仍为模型原有的闭合/微张两态，没有音频或摄像头面捕。默认跟随同时涉及视线、头部与身体，颈部由原 Cubism 身体层驱动。

运行库许可证见 [NOTICE.md](NOTICE.md) 和 `vendor/licenses/`；角色资产遵循上一级 [使用声明](../rights.html)，不适用第三方代码的 MIT 许可。

## 本轮验证

在 `/homepage/` 子路径下构建成功。已检查 Tools 中真实模型加载、摸头、暂停/继续、网站主题同步和系统装饰开关；完整页面与旧版入口可独立加载。未提交或推送代码，未发布线上站点。

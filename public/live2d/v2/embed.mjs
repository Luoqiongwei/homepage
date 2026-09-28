// 复用第一阶段的同源消息接口和离屏暂停，旧组件继续使用原入口。
import '../embed.mjs';
const frames=[...document.querySelectorAll('iframe[data-live2d-version="2"]')];
function syncTheme(){
  const theme=document.documentElement.dataset.bsTheme==='dark'?'dark':'light';
  for(const frame of frames)frame.contentWindow?.postMessage({channel:'homepage-live2d',method:'setTheme',args:[theme]},location.origin);
}
for(const frame of frames)frame.addEventListener('character-ready',syncTheme);
new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-bs-theme']});
syncTheme();

import {EXPRESSIONS,PARAMETERS} from './controller.mjs';
const embedded=document.documentElement.hasAttribute('data-embedded');
const presentationBounds={height:[260,800],zoom:[.5,1.4],fps:[15,60],resolution:[1,2]};
let presentation={};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function configure(config){
  if(!object(config))throw Error('设置格式不正确');
  for(const [key,value] of Object.entries(config.presentation??{})){
    const bounds=presentationBounds[key];if(!bounds||!Number.isFinite(value)||value<bounds[0]||value>bounds[1])throw Error('显示参数越界');
  }
  if(config.expression!==undefined&&!EXPRESSIONS.includes(config.expression))throw Error('未知表情');
  for(const [key,value] of Object.entries(config.behavior??{}))if(!['idle','follow','interactive'].includes(key)||typeof value!=='boolean')throw Error('互动参数不正确');
  for(const [id,value] of Object.entries(config.parameters??{})){const range=PARAMETERS[id];if(!range||!Number.isFinite(value)||value<range[0]||value>range[1])throw Error('模型参数越界');}
  const api=window.live2d;
  if(config.dynamics)api.setDynamics(config.dynamics);
  if(config.presentation){presentation={...presentation,...config.presentation};api.setPresentation(config.presentation);}
  if(config.expression)api.setExpression(config.expression);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior=config.behavior??{};
  if('idle' in behavior)api.setIdle(behavior.idle&&!reduced);
  if('follow' in behavior)api.setFollow(behavior.follow&&!reduced);
  if('interactive' in behavior)api.setInteractive(behavior.interactive);
  if(config.parameters){for(const id of Object.keys(api.getState().manual))api.releaseParameter(id);for(const [id,value] of Object.entries(config.parameters))api.setParameter(id,value);}
  return state();
}
function state(){return {...window.live2d.getState(),dynamics:window.live2d.getDynamics(),presentation:{...presentation},configured:true,version:2};}
function ready(){
  if(!embedded)return;
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='homepage-live2d')return;
    const {method,args=[],requestId}=event.data;
    try{
      if(!Array.isArray(args))throw Error('参数格式不正确');
      let result;
      if(method==='configure')result=configure(args[0]);
      else if(method==='getState')result=state();
      else if(method==='setTheme'){if(!['light','dark'].includes(args[0]))throw Error('未知主题');document.documentElement.dataset.theme=args[0];}
      else if(['setDynamics','setExpression','setParameter','releaseParameter','lookAt','play','interact','pause','setVisible'].includes(method))result=window.live2d[method](...args);
      else throw Error('未知调用');
      if(requestId)parent.postMessage({channel:'homepage-live2d',type:'result',requestId,result},location.origin);
    }catch(error){if(requestId)parent.postMessage({channel:'homepage-live2d',type:'result',requestId,error:error.message},location.origin);}
  });
  parent.postMessage({channel:'homepage-live2d',type:'ready'},location.origin);
}
if(window.live2d)ready();else document.addEventListener('live2d-ready',ready,{once:true});
document.addEventListener('live2d-error',event=>{if(embedded)parent.postMessage({channel:'homepage-live2d',type:'error',error:event.detail},location.origin);});

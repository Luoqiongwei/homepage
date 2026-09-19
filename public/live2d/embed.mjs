// 独立 iframe 接口，避免 Pixi 全局对象与站点其他实验页面冲突。
export function connectCharacter(frame,initial={}){
 let next=0,loaded=false,settled=false;const pending=new Map();let resolveReady,rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const call=(method,...args)=>ready.then(()=>send(method,args));
 function send(method,args){return new Promise((resolve,reject)=>{const requestId=++next;const timeout=setTimeout(()=>{pending.delete(requestId);reject(Error('角色响应超时'));},10000);pending.set(requestId,{resolve,reject,timeout});frame.contentWindow.postMessage({channel:'homepage-live2d',method,args,requestId},location.origin);});}
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.channel!=='homepage-live2d')return;
  const d=e.data;
  if(d.type==='ready'){
   try{await send('configure',[initial]);loaded=true;resolveReady();settled=true;frame.dispatchEvent(new CustomEvent('character-ready'));}catch(error){rejectReady(error);settled=true;}
  }else if(d.type==='error'){if(!settled)rejectReady(Error(d.error));frame.dispatchEvent(new CustomEvent('character-error',{detail:d.error}));}
  else if(d.type==='result'){const task=pending.get(d.requestId);if(task){clearTimeout(task.timeout);pending.delete(d.requestId);d.error?task.reject(Error(d.error)):task.resolve(d.result);}}
 });
 const api={ready,configure:config=>{initial=config;return call('configure',config);},setDynamics:p=>call('setDynamics',p),setExpression:name=>call('setExpression',name),setParameter:(id,v)=>call('setParameter',id,v),releaseParameter:id=>call('releaseParameter',id),lookAt:(x,y)=>call('lookAt',x,y),play:name=>call('play',name),interact:name=>call('interact',name),pause:value=>call('pause',value),getState:()=>call('getState')};
 let visible=true;const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(loaded)send('setVisible',[visible]).catch(()=>{});},{threshold:0});observer.observe(frame);
 ready.then(()=>send('setVisible',[visible])).catch(()=>{});
 return Object.freeze(api);
}
window.live2dCharacters??=new Map();
for(const frame of document.querySelectorAll('iframe[data-live2d-config]')){
 if(frame.dataset.connected)continue;frame.dataset.connected='true';
 const api=connectCharacter(frame,JSON.parse(frame.dataset.live2dConfig));window.live2dCharacters.set(frame.id,api);
 api.ready.catch(error=>console.warn('站内伙伴：'+error.message));
}

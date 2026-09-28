import {CharacterController,clamp,EXPRESSIONS,ACTION_LABELS} from './controller.mjs';
import {createModelHitTest} from './hit-test.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const host=$('#canvas-host'),stage=$('#stage'),status=$('#status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const embedded=document.documentElement.hasAttribute('data-embedded');
const preferencesKey='homepage-shuyan-live2d-v2-preferences';
let externalVisible=true,presentationOverride=null;
let app,model,controller,values={},zoom=1,lowPower=false,background='mist',press=null,lastUI=0;
const getJSON=async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`读取文件失败 (${response.status})`);return response.json();};
function savePreferences(){if(embedded)return;try{localStorage.setItem(preferencesKey,JSON.stringify({version:1,follow:controller.follow,idle:controller.idle,interactive:controller.interactive,lowPower,zoom,background,dynamics:controller.dynamics.settings}));}catch{}}
function restorePreferences(){
 if(embedded)return;
 try{const p=JSON.parse(localStorage.getItem(preferencesKey));if(!p||p.version!==1)return;
  for(const key of ['follow','idle','interactive'])if(typeof p[key]==='boolean')controller[key]=p[key];
  if(reduced)controller.follow=controller.idle=false;
  lowPower=typeof p.lowPower==='boolean'?p.lowPower:false;
  if(Number.isFinite(p.zoom))zoom=clamp(p.zoom,.78,1.22);
  if(['mist','white','dark','transparent','green'].includes(p.background))background=p.background;
  if(p.dynamics)controller.dynamics.configure(p.dynamics);
 }catch{}
}
function fit(){if(!model)return;const w=host.clientWidth,h=host.clientHeight;if(w<1||h<1)return;app.renderer.resize(w,h);model.scale.set(Math.min(w/model.internalModel.width,h/model.internalModel.height)*.985*zoom);model.position.set(w/2,h/2);}
function setPower(){app.ticker.maxFPS=presentationOverride?.fps??(lowPower?30:60);app.renderer.resolution=Math.min(devicePixelRatio||1,presentationOverride?.resolution??(lowPower?1.25:2));fit();}
function setBackground(name){background=name;stage.dataset.background=name;$$('[data-bg]').forEach(b=>{const selected=b.dataset.bg===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});}
function sync(){
 if(!controller)return;const state=controller.getState();
 $('#controls').disabled=controller.paused;
 $('#pause').textContent=controller.paused?'续':'停';$('#pause').setAttribute('aria-label',controller.paused?'继续':'暂停');$('#pause').setAttribute('aria-pressed',controller.paused);
 for(const key of ['follow','idle','interactive'])$('#'+key).checked=controller[key];
 $('#low-power').checked=lowPower;$('#zoom').value=zoom;
 $$('[data-expression]').forEach(b=>{const selected=b.dataset.expression===state.expression;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
 $$('[data-motion]').forEach(b=>{const selected=b.dataset.motion===state.action;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
 $$('[data-interact]').forEach(b=>{b.disabled=controller.paused||!controller.interactive||(b.dataset.interact==='wake'&&!state.sleeping);});
 for(const input of $$('[data-param]')){
  const id=input.dataset.param;if(document.activeElement!==input)input.value=controller.manual[id]??values[id];
  input.nextElementSibling.value=Number(input.value).toFixed(id.includes('Angle')?1:2);
  input.parentElement.classList.toggle('locked',id in controller.manual);
 }
 for(const input of $$('[data-setting]')){input.value=controller.dynamics.settings[input.dataset.setting];input.nextElementSibling.value=Math.round(input.value*100)+'%';}
 $('#now-playing').textContent=state.label;
 $('#interaction-hint').textContent=state.paused?'已暂停。':!state.interactive?'触碰回应已关闭。':state.sleeping?'点击角色可唤醒。':state.interaction==='wake'?'正在醒来。':'长按头顶，或点击角色。';
 $('#speech').textContent=state.speech;$('#speech').hidden=!state.speech;
 // 提供只读状态，便于接入和检查。
 status.dataset.state=JSON.stringify(state);
}
function reset(){press=null;controller.reset();values=controller.update(0);render(0);sync();savePreferences();}
function render(dt){
 values=controller.update(dt);model.update((controller.paused?0:dt)*1000);
 if(press&&press.zone==='headtop'&&!press.fired&&controller.time-press.start>.55){press.fired=true;controller.interact('pat');}
}
function interact(kind){const result=controller.interact(kind);sync();return result;}
try{
 const settings=await getJSON('model/shuyan_stage2.model3.json');
 const names=['nod','tilt','wink','talk'];
 const pairs=[['idle',settings.FileReferences.Motions.Idle[0].File],...settings.FileReferences.Motions.Action.map((m,i)=>[names[i],m.File])];
 const clips=Object.fromEntries(await Promise.all(pairs.map(async([name,file])=>[name,await getJSON('model/'+file)])));
 controller=new CharacterController(clips,{reducedMotion:reduced});restorePreferences();
 app=new PIXI.Application({width:host.clientWidth,height:host.clientHeight,resolution:Math.min(devicePixelRatio||1,lowPower?1.25:2),autoDensity:true,backgroundAlpha:0,antialias:true,preserveDrawingBuffer:true});
 host.append(app.view);app.view.setAttribute('aria-label','疏燕，可轻触的 Live2D 角色');app.view.setAttribute('role','img');
 // 统一写入参数，网格形变由 Cubism Core 计算。
 const runtime=structuredClone(settings);runtime.url=new URL('model/shuyan_stage2.model3.json',location.href).href;
 runtime.FileReferences.Motions={};runtime.FileReferences.Expressions=[];
 model=await PIXI.live2d.Live2DModel.from(runtime,{autoUpdate:false,autoInteract:false,motionPreload:'NONE',idleMotionGroup:'ManualOnly'});
 model.anchor.set(.5);app.stage.addChild(model);
 model.internalModel.on('beforeModelUpdate',()=>{for(const [id,value] of Object.entries(values))model.internalModel.coreModel.setParameterValueById(id,value);});
 const hitTest=createModelHitTest(model);
 const faceBounds=model.internalModel.getDrawableBounds(model.internalModel.coreModel.getDrawableIndex('face'));
 const lookOrigin={x:faceBounds.x+faceBounds.width/2,y:faceBounds.y+faceBounds.height*.4};
 const canvasPoint=e=>{const r=app.view.getBoundingClientRect();return new PIXI.Point((e.clientX-r.left)*app.screen.width/r.width,(e.clientY-r.top)*app.screen.height/r.height);};
 const cancelPointer=()=>{if(press&&app.view.hasPointerCapture(press.id))app.view.releasePointerCapture(press.id);press=null;controller.pointer={x:0,y:0};};
 let hitTime=0;
 window.addEventListener('pointermove',e=>{
  if(!e.isPrimary||controller.paused)return;
  const p=model.toModelPosition(canvasPoint(e));controller.lookAt((p.x-lookOrigin.x)/(faceBounds.width*1.6),(lookOrigin.y-p.y)/(faceBounds.height*1.8));
 });
 app.view.addEventListener('pointermove',e=>{
  if(!e.isPrimary||controller.paused||!controller.interactive||e.timeStamp-hitTime<55)return;hitTime=e.timeStamp;
  const h=hitTest(canvasPoint(e));app.view.style.cursor=h.zone?(h.zone==='headtop'?'grab':'pointer'):'default';
  if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>45&&press.zone!=='headtop')press.moved=true;
 });
 app.view.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||controller.paused||!controller.interactive)return;
  const h=hitTest(canvasPoint(e));if(!h.zone)return;
  if(controller.sleeping){interact('wake');return;}
  press={id:e.pointerId,zone:h.zone,start:controller.time,x:e.clientX,y:e.clientY,fired:false,moved:false};app.view.setPointerCapture(e.pointerId);e.preventDefault();
 });
 app.view.addEventListener('pointerup',e=>{
  if(!press||e.pointerId!==press.id)return;const p=press;press=null;
  if(app.view.hasPointerCapture(e.pointerId))app.view.releasePointerCapture(e.pointerId);
  if(!p.fired&&!p.moved){const h=hitTest(canvasPoint(e));if(h.zone===p.zone)interact({headtop:'pat',mouth:'body'}[p.zone]??p.zone);}
  if(e.pointerType==='touch')controller.pointer={x:0,y:0};
 });
 app.view.addEventListener('pointercancel',cancelPointer);app.view.addEventListener('lostpointercapture',()=>{press=null;});
 app.view.addEventListener('pointerleave',()=>{if(!press)controller.pointer={x:0,y:0};});
 window.addEventListener('blur',cancelPointer);document.documentElement.addEventListener('pointerleave',cancelPointer);
 function syncVisibility(){cancelPointer();if(document.hidden||!externalVisible)app.stop();else{app.ticker.lastTime=performance.now();app.start();}}
 document.addEventListener('visibilitychange',syncVisibility);
 app.ticker.maxFPS=lowPower?30:60;
 app.ticker.add(()=>{
  const dt=Math.min(app.ticker.deltaMS/1000,.05);render(dt);
  const now=performance.now();if(now-lastUI>180){sync();lastUI=now;}
 });
 new ResizeObserver(fit).observe(host);fit();render(0);setBackground(background);
 $('#loading').hidden=true;for(const id of ['pause','reset','capture'])$('#'+id).disabled=false;
 status.className='status ready';status.textContent='我在';sync();document.documentElement.dataset.ready='true';
 $$('[data-expression]').forEach(b=>b.addEventListener('click',()=>{press=null;controller.setExpression(b.dataset.expression);render(0);sync();}));
 $$('[data-motion]').forEach(b=>b.addEventListener('click',()=>{press=null;controller.play(b.dataset.motion);sync();}));
 $$('[data-interact]').forEach(b=>b.addEventListener('click',()=>{press=null;interact(b.dataset.interact);}));
 $$('[data-param]').forEach(input=>input.addEventListener('input',()=>{press=null;controller.setParameter(input.dataset.param,Number(input.value));render(0);sync();}));
 $$('[data-setting]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.setting,value=Number(input.value);controller.dynamics.configure(key==='head'?{head:value,gaze:Math.min(.78,value*.94)}:{[key]:value});sync();savePreferences();}));
 const releases={pose:['ParamAngleX','ParamAngleY','ParamAngleZ','ParamBodyAngleZ'],face:['ParamEyeLOpen','ParamEyeROpen','ParamMouthOpenY']};
 $$('[data-release]').forEach(b=>b.addEventListener('click',()=>{controller.release(releases[b.dataset.release]);render(0);sync();}));
 for(const key of ['idle','follow'])$('#'+key).addEventListener('change',e=>{controller[key]=e.target.checked;controller.lastInput=controller.time;sync();savePreferences();});
 $('#interactive').addEventListener('change',e=>{press=null;controller.setInteractive(e.target.checked);sync();savePreferences();});
 $('#low-power').addEventListener('change',e=>{lowPower=e.target.checked;setPower();savePreferences();});
 $('#pause').addEventListener('click',()=>{cancelPointer();controller.setPaused(!controller.paused);sync();});
 $('#reset').addEventListener('click',reset);
 $('#zoom').addEventListener('input',e=>{zoom=Number(e.target.value);fit();savePreferences();});
 $('#capture').addEventListener('click',()=>{
  app.renderer.render(app.stage);app.view.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='shuyan-live2d.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);},'image/png');
 });
 window.addEventListener('keydown',e=>{
  if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA','SELECT','BUTTON','SUMMARY'].includes(document.activeElement?.tagName))return;
  if(e.code==='Space'){e.preventDefault();cancelPointer();controller.setPaused(!controller.paused);sync();}
  if(e.key==='Escape')reset();
 });
 window.live2d=Object.freeze({
  setExpression(name){const result=controller.setExpression(name);render(0);sync();return result;},
  play(name){const result=controller.play(name);sync();return result;},
  setParameter(id,value){const result=controller.setParameter(id,value);render(0);sync();return result;},
  releaseParameter(id){controller.release([id]);sync();},
  setIdle(enabled){controller.idle=!!enabled;controller.lastInput=controller.time;sync();savePreferences();},
  setFollow(enabled){controller.follow=!!enabled;sync();savePreferences();},
  setInteractive(enabled){controller.setInteractive(enabled);sync();savePreferences();},
  setDynamics(patch){const result=controller.dynamics.configure(patch);sync();savePreferences();return result;},
  getDynamics(){return {...controller.dynamics.settings};},
  setPresentation(patch){
   const ranges={height:[260,800],zoom:[.5,1.4],fps:[15,60],resolution:[1,2]};
   for(const [key,value] of Object.entries(patch)){const range=ranges[key];if(!range||!Number.isFinite(value)||value<range[0]||value>range[1])throw new RangeError('显示参数越界');}
   presentationOverride={...presentationOverride,...patch};if('zoom' in patch)zoom=patch.zoom;setPower();sync();
  },
  setVisible(visible){externalVisible=!!visible;syncVisibility();return externalVisible;},
  lookAt(x,y){controller.lookAt(x,y);controller.follow=true;sync();},
  interact,pause(paused=true){cancelPointer();controller.setPaused(paused);sync();},reset,
  getState(){return controller.getState();},
  getModelInfo(){return {name:'shuyan_stage2',renderer:'pixi-live2d-display 0.4.0',coreVersion:Live2DCubismCore.Version.csmGetVersion(),parameters:Object.keys(values).length,meshes:model.internalModel.coreModel.getDrawableCount(),textures:model.textures.length};}
 });
 document.dispatchEvent(new CustomEvent('live2d-ready'));
}catch(error){
 console.error('Live2D initialization failed',error);app?.stop();
 status.textContent='加载失败';status.className='status error';$('#loading').hidden=false;$('.loader').hidden=true;
 $('#loading p').textContent='模型未能加载。请用项目启动器打开页面，并确认浏览器支持 WebGL。';$('#retry').hidden=false;
 document.documentElement.dataset.error=error.message;
 document.dispatchEvent(new CustomEvent('live2d-error',{detail:error.message}));
}
$('#retry').addEventListener('click',()=>location.reload());
$('#quiet').addEventListener('click',()=>{const quiet=document.body.classList.toggle('quiet');$('#quiet').setAttribute('aria-pressed',quiet);$('#quiet').innerHTML=quiet?'显示面板 <span>↙</span>':'隐藏面板 <span>↗</span>';});
$$('[data-bg]').forEach(b=>b.addEventListener('click',()=>{setBackground(b.dataset.bg);if(controller)savePreferences();}));

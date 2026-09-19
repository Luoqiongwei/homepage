import {CharacterController,clamp,EXPRESSIONS} from './controller.mjs';
import {createModelHitTest} from './hit-test.mjs';
const $=s=>document.querySelector(s),host=$('#canvas-host');
const json=async p=>{const r=await fetch(p);if(!r.ok)throw Error('资源加载失败');return r.json();};
let model,app,controller,values={},settings,visible=true,disposed=false,frame=0,last=0,drag=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const presentation={height:420,zoom:.96,fps:30,resolution:1.5};
let userPaused=reduced.matches;
function fit(){if(!model)return;app.renderer.resolution=Math.min(devicePixelRatio||1,presentation.resolution);app.renderer.resize(host.clientWidth,host.clientHeight);model.scale.set(Math.min(host.clientWidth/model.internalModel.width,host.clientHeight/model.internalModel.height)*presentation.zoom);model.position.set(host.clientWidth/2,host.clientHeight/2);}
function sync(){ $('#pause').textContent=userPaused?'继续':'暂停';$('#pause').setAttribute('aria-pressed',String(userPaused));document.querySelectorAll('[data-action]').forEach(b=>b.disabled=!controller.behavior.enabled);}
function paint(){values=controller.update(0);model.update(0);app.renderer.render(app.stage);}
function running(){return visible&&!document.hidden&&!userPaused&&!disposed;}
function loop(now){if(!running()){frame=0;return;}frame=requestAnimationFrame(loop);if(now-last<1000/presentation.fps-1)return;const dt=last?Math.min((now-last)/1000,.1):0;last=now;values=controller.update(dt);model.update(dt*1000);app.renderer.render(app.stage);const speech=controller.response?.label||'';if($('#speech').textContent!==speech)$('#speech').textContent=speech;$('#speech').hidden=!speech;}
function schedule(){cancelAnimationFrame(frame);frame=0;last=0;if(running())frame=requestAnimationFrame(loop);}
function pause(value){userPaused=!!value;controller.paused=userPaused;sync();schedule();}
function configure(config){
  if(!config||typeof config!=='object')throw Error('设置格式不正确');
  const p=config.presentation||{};
  for(const [k,v] of Object.entries(p)){const bounds={height:[260,800],zoom:[.5,1.4],fps:[15,60],resolution:[1,2]}[k];if(!bounds||!Number.isFinite(v)||v<bounds[0]||v>bounds[1])throw Error('显示参数越界');}
  if(config.expression&&!EXPRESSIONS.includes(config.expression))throw Error('未知表情');
  for(const [k,v] of Object.entries(config.behavior||{}))if(!['idle','follow','interactive'].includes(k)||typeof v!=='boolean')throw Error('互动参数不正确');
  for(const [id,v] of Object.entries(config.parameters||{})){const p=controller.parameters.get(id);if(!p||!Number.isFinite(v)||v<p.Min||v>p.Max)throw Error('模型参数越界');}
  if(config.dynamics)controller.dynamics.configure(config.dynamics);
  Object.assign(presentation,p);const b=config.behavior||{};
  if('idle' in b)controller.idle=b.idle;if('follow' in b)controller.follow=b.follow;if('interactive' in b)controller.behavior.setEnabled(b.interactive);
  if(config.expression)controller.setExpression(config.expression);
  if(config.parameters){controller.manual={};for(const [id,v] of Object.entries(config.parameters))controller.setParameter(id,v);}
  fit();sync();paint();return state();
}
function state(){return {dynamics:{...controller.dynamics.settings},presentation:{...presentation},behavior:{idle:controller.idle,follow:controller.follow,interactive:controller.behavior.enabled},expression:controller.expression,parameters:{...controller.manual},paused:userPaused};}
function interact(action){if(!['pat','greet','face','hair','ribbon','sleep','wake'].includes(action))throw Error('未知互动');if(!controller.behavior.enabled)return;if(action==='sleep')controller.behavior.nap();else if(action==='wake')controller.behavior.wake();else controller.behavior.trigger(action);paint();}
function clearPointer(){controller.pointer={x:0,y:0};controller.behavior.cancelPointer();drag=null;}
try{
 const [controls,modelSettings]=await Promise.all([json('model/controls.json'),json('model/avatar.model3.json')]);
 settings=controls;const clips=Object.fromEntries(await Promise.all(controls.motions.map(async m=>[m.name,await json('model/'+m.file)])));
 controller=new CharacterController(controls.parameters,clips);controller.follow=true;controller.paused=userPaused;
 app=new PIXI.Application({width:host.clientWidth,height:host.clientHeight,resolution:Math.min(devicePixelRatio||1,presentation.resolution),autoDensity:true,backgroundAlpha:0,antialias:true,autoStart:false,sharedTicker:false});
 host.append(app.view);app.view.setAttribute('role','img');app.view.setAttribute('aria-label','疏燕，可互动的 Live2D 角色');
 modelSettings.url=new URL('model/avatar.model3.json',location.href).href;
 model=await PIXI.live2d.Live2DModel.from(modelSettings,{autoUpdate:false,autoInteract:false,motionPreload:'NONE'});model.anchor.set(.5);app.stage.addChild(model);
 model.internalModel.on('beforeModelUpdate',()=>{for(const [id,v] of Object.entries(values))model.internalModel.coreModel.setParameterValueById(id,v);});
 const hit=createModelHitTest(model),face=model.internalModel.getDrawableBounds(model.internalModel.coreModel.getDrawableIndex('face'));
 const point=e=>{const r=app.view.getBoundingClientRect();return new PIXI.Point((e.clientX-r.left)*app.screen.width/r.width,(e.clientY-r.top)*app.screen.height/r.height);};
 app.view.addEventListener('pointermove',e=>{if(!e.isPrimary||userPaused)return;const p=model.toModelPosition(point(e));controller.pointer={x:clamp((p.x-face.x-face.width/2)/(face.width*1.4),-1,1),y:clamp((face.y+face.height*.35-p.y)/(face.height*1.25),-1,1)};const h=hit(point(e));controller.behavior.move(h.zone,h.x,h.y);});
 app.view.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0||userPaused)return;const h=hit(point(e));if(controller.behavior.down(h.zone,h.x,h.y)){drag=e.pointerId;app.view.setPointerCapture(drag);}});
 app.view.addEventListener('pointerup',e=>{if(e.pointerId===drag){controller.behavior.up();if(app.view.hasPointerCapture(drag))app.view.releasePointerCapture(drag);drag=null;}if(e.pointerType==='touch')clearPointer();});
 app.view.addEventListener('pointerleave',()=>{if(drag===null)clearPointer();});app.view.addEventListener('pointercancel',clearPointer);app.view.addEventListener('lostpointercapture',()=>{drag=null;controller.behavior.press=null;});window.addEventListener('blur',clearPointer);
 document.addEventListener('visibilitychange',()=>{clearPointer();schedule();});window.addEventListener('pagehide',()=>{disposed=true;schedule();});window.addEventListener('pageshow',()=>{disposed=false;schedule();});
 new ResizeObserver(()=>{fit();if(!running())paint();}).observe(host);
 document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>interact(b.dataset.action)));$('#pause').addEventListener('click',()=>pause(!userPaused));
 $('#status').hidden=true;fit();sync();paint();schedule();
 // 仅接受同源父页面；配置不含文件地址或可执行代码。
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==parent||e.data?.channel!=='homepage-live2d')return;
  const {method,args=[],requestId}=e.data;try{let result;
   switch(method){
    case 'configure':result=configure(args[0]);break;
    case 'setDynamics':result=controller.dynamics.configure(args[0]);paint();break;
    case 'setExpression':controller.setExpression(args[0]);paint();break;
    case 'setParameter':controller.setParameter(args[0],args[1]);paint();break;
    case 'releaseParameter':delete controller.manual[args[0]];paint();break;
    case 'lookAt':if(!args.every(Number.isFinite)||args.length!==2)throw Error('视线参数不正确');controller.pointer={x:clamp(args[0],-1,1),y:clamp(args[1],-1,1)};controller.follow=true;break;
    case 'play':controller.play(args[0]);pause(false);break;
    case 'interact':interact(args[0]);break;
    case 'pause':pause(args[0]);break;
    case 'setVisible':visible=!!args[0];clearPointer();schedule();break;
    case 'getState':result=state();break;
    default:throw Error('未知调用');
   }
   if(requestId)parent.postMessage({channel:'homepage-live2d',type:'result',requestId,result},location.origin);
  }catch(error){if(requestId)parent.postMessage({channel:'homepage-live2d',type:'result',requestId,error:error.message},location.origin);}
 });
 parent.postMessage({channel:'homepage-live2d',type:'ready'},location.origin);
}catch(error){console.error(error);$('#status').textContent='暂时无法加载角色，文章仍可正常阅读。';$('#retry').hidden=false;parent.postMessage({channel:'homepage-live2d',type:'error',error:error.message},location.origin);}
$('#retry').addEventListener('click',()=>location.reload());

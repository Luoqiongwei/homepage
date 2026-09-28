import {SecondaryMotion} from './dynamics.mjs';
import {sampleCurve} from './motion.mjs';
export const EXPRESSIONS=['neutral','smile','relaxed','shy','annoyed','surprised','sleepy'];
export const MOOD_LABELS=['平静','微笑','安心','害羞','不悦','惊讶','困倦'];
export const ACTION_LABELS={idle:'待机',nod:'点头',tilt:'侧头',wink:'单眼眨眼',talk:'嘴型'};
export const PARAMETERS={
 ParamAngleX:[-30,30,0],ParamAngleY:[-30,30,0],ParamAngleZ:[-30,30,0],
 ParamBodyAngleZ:[-10,10,0],ParamEyeBallX:[-1,1,0],ParamEyeBallY:[-1,1,0],
 ParamEyeLOpen:[0,1,1],ParamEyeROpen:[0,1,1],ParamMouthOpenY:[0,1,0],
 ParamHairBack:[-1,1,0],ParamBreath:[0,1,0],ParamRibbon:[-1,1,0],ParamExpression:[0,6,0]
};
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const approach=(x,y,dt,tau)=>x+(y-x)*-Math.expm1(-dt/tau);
const REACTIONS={
 pat:{duration:2.7,mood:'relaxed',label:'摸头',speech:'发型要乱了'},
 face:{duration:2.4,mood:'neutral',label:'触碰',speech:'嗯？'},
 hair:{duration:2,mood:'neutral',label:'触碰',speech:''},
 ribbon:{duration:2.1,mood:'neutral',label:'触碰',speech:''},
 body:{duration:1.8,mood:'neutral',label:'回应',speech:''},
 greet:{duration:2.6,mood:'neutral',label:'回应',speech:'嗯。'},
 protest:{duration:2.3,mood:'annoyed',label:'不悦',speech:'唔……'},
 wake:{duration:2,mood:'sleepy',label:'醒来',speech:'醒了。'}
};

// 表情使用整数索引，在闭眼时切换。
export class ExpressionTransition {
 constructor(){this.current='neutral';this.target='neutral';this.aperture=1;this.phase='idle';this.elapsed=0;this.start=1;}
 request(name,immediate=false){
  if(immediate){this.current=this.target=name;this.aperture=1;this.phase='idle';return;}
  if(name===this.target)return;
  this.target=name;
  if(this.phase==='closing')return;
  if(name===this.current&&this.phase==='idle')return;
  this.phase='closing';this.elapsed=0;this.start=this.aperture;
 }
 update(dt){
  this.elapsed+=dt;
  if(this.phase==='closing'){
   const duration=Math.max(.035,.13*this.start);this.aperture=this.start*(1-ease(this.elapsed/duration));
   if(this.elapsed>=duration){this.current=this.target;this.phase='opening';this.elapsed=0;this.aperture=0;}
  }else if(this.phase==='opening'){
   this.aperture=ease(this.elapsed/.19);
   if(this.elapsed>=.19){this.aperture=1;this.phase='idle';}
  }
 }
}

export class CharacterController {
 constructor(clips,{reducedMotion=false,random=Math.random}={}){
  this.clips=clips;this.random=random;this.reducedMotion=reducedMotion;
  this.dynamics=new SecondaryMotion({gaze:.58,head:.62,hair:.55,breath:.48,breathRate:13});
  this.reset();
 }
 reset(){
  this.time=0;this.lastInput=0;this.idle=!this.reducedMotion;this.follow=!this.reducedMotion;
  this.interactive=true;this.paused=false;this.baseExpression='neutral';this.manual={};
  this.action=null;this.reaction=null;this.sleeping=false;this.sleepStart=0;this.cooldown=0;this.touches=[];
  this.pointer={x:0,y:0};this.body=0;this.reactionPose={};this.face=new ExpressionTransition();
  this.dynamics.reset();this.blinkAt=2.6;this.blinkStart=null;this.lastValues=null;this.update(0);
 }
 cancelReaction(){this.reaction=null;this.sleeping=false;this.cooldown=0;this.touches=[];this.lastInput=this.time;}
 setExpression(name){
  if(!EXPRESSIONS.includes(name))throw new RangeError('Unknown expression: '+name);
  if(this.paused)return false;
  this.cancelReaction();this.action=null;this.baseExpression=name;return true;
 }
 setParameter(id,value){
  const range=PARAMETERS[id];if(!range||!Number.isFinite(value))throw new RangeError('Invalid parameter: '+id);
  if(this.paused)return false;
  if(id==='ParamExpression')return this.setExpression(EXPRESSIONS[Math.round(clamp(value,0,6))]);
  this.cancelReaction();this.action=null;this.manual[id]=clamp(value,range[0],range[1]);return true;
 }
 release(ids){for(const id of ids)delete this.manual[id];this.lastInput=this.time;}
 play(name){
  if(name!=='idle'&&!this.clips[name])throw new RangeError('Unknown motion: '+name);
  if(this.paused)return false;
  this.cancelReaction();
  if(name==='idle'){this.action=null;this.idle=true;return true;}
  this.action={name,start:this.time};
  this.release(this.clips[name].Curves.filter(c=>c.Target==='Parameter').map(c=>c.Id));
  return true;
 }
 setInteractive(enabled){this.interactive=!!enabled;if(!this.interactive)this.cancelReaction();}
 setPaused(paused){this.paused=!!paused;this.pointer={x:0,y:0};}
 lookAt(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))throw new RangeError('Invalid gaze');if(!this.paused)this.pointer={x:clamp(x,-1,1),y:clamp(y,-1,1)};}
 interact(kind){
  if(!['sleep','wake',...Object.keys(REACTIONS)].includes(kind))throw new RangeError('Unknown interaction');
  if(!this.interactive||this.paused)return false;
  this.lastInput=this.time;
  if(kind==='sleep'){
   this.action=null;this.reaction=null;this.manual={};this.sleeping=true;this.sleepStart=this.time;this.pointer={x:0,y:0};return true;
  }
  if(this.sleeping||kind==='wake'){
   if(!this.sleeping)return false;
   this.sleeping=false;this.action=null;this.reaction={kind:'wake',start:this.time};this.cooldown=this.time+2.2;this.pointer={x:0,y:0};return true;
  }
  if(this.time<this.cooldown)return false;
  this.touches=this.touches.filter(t=>this.time-t<3.2);this.touches.push(this.time);
  if(this.touches.length>=4){kind='protest';this.touches=[];}
  if(this.reaction?.kind===kind){this.cooldown=this.time+.65;return true;}
  this.action=null;this.reaction={kind,start:this.time};this.cooldown=this.time+(kind==='protest'?2.5:.65);return true;
 }
 update(delta){
  if(this.paused&&this.lastValues)return {...this.lastValues};
  const dt=clamp(Number.isFinite(delta)?delta:0,0,.05);this.time+=dt;
  if(this.action&&this.time-this.action.start>this.clips[this.action.name].Meta.Duration)this.action=null;
  if(this.reaction&&this.time-this.reaction.start>REACTIONS[this.reaction.kind].duration)this.reaction=null;
  if(this.interactive&&this.idle&&!this.sleeping&&!this.action&&!this.reaction&&this.baseExpression==='neutral'&&Object.keys(this.manual).length===0&&this.time-this.lastInput>60)this.interact('sleep');
  const desired=this.sleeping?(this.time-this.sleepStart<2.8?'sleepy':'relaxed'):(this.reaction?REACTIONS[this.reaction.kind].mood:this.baseExpression);
  const eyeLocked='ParamEyeLOpen' in this.manual||'ParamEyeROpen' in this.manual;
  this.face.request(desired,this.reducedMotion||eyeLocked);this.face.update(dt);
  const values=Object.fromEntries(Object.entries(PARAMETERS).map(([id,r])=>[id,r[2]]));
  const apply=(clip,t,weight=1,exclude=[])=>{
   for(const c of clip.Curves){if(c.Target!=='Parameter'||!PARAMETERS[c.Id]||exclude.includes(c.Id))continue;const v=sampleCurve(c,t);values[c.Id]+=(v-values[c.Id])*weight;}
  };
  if(this.idle&&!this.reducedMotion&&this.clips.idle)apply(this.clips.idle,this.time%this.clips.idle.Meta.Duration,.38,['ParamEyeLOpen','ParamEyeROpen','ParamBreath','ParamHairBack','ParamRibbon']);
  if(this.action){const clip=this.clips[this.action.name],t=this.time-this.action.start;apply(clip,t,Math.min(ease(t/.16),ease((clip.Meta.Duration-t)/.18)));}
  const goals={ParamAngleY:0,ParamAngleZ:0,ParamHairBack:0,ParamRibbon:0};
  if(this.sleeping)goals.ParamAngleY=-2;
  if(this.reaction){
   const {kind,start}=this.reaction,t=this.time-start,weight=Math.sin(Math.PI*clamp(t/REACTIONS[kind].duration,0,1));
   if(kind==='pat'){goals.ParamAngleY=-3*weight;goals.ParamAngleZ=3*weight;}
   if(kind==='face')goals.ParamAngleZ=-4*weight;
   if(kind==='greet'||kind==='body')goals.ParamAngleY=-4*Math.sin(Math.PI*clamp(t/1.4,0,1))**2;
   if(kind==='hair')goals.ParamHairBack=.4*Math.sin(t*5)*weight;
   if(kind==='ribbon')goals.ParamRibbon=.55*Math.sin(t*6)*weight;
   if(kind==='wake')goals.ParamAngleY=-2*(1-weight);
  }
  for(const [id,goal] of Object.entries(goals)){this.reactionPose[id]=approach(this.reactionPose[id]??0,goal,dt,.13);values[id]+=this.reactionPose[id];}
  const secondary=this.dynamics.update(dt,{
   target:this.pointer,tracking:this.follow&&!this.reducedMotion&&!this.sleeping,
   sleeping:this.sleeping,eyesAvailable:this.face.current==='neutral',talking:this.action?.name==='talk',
   angleX:this.manual.ParamAngleX??values.ParamAngleX,angleZ:this.manual.ParamAngleZ??values.ParamAngleZ
  });
  values.ParamAngleX+=secondary.head.x;values.ParamAngleY+=secondary.head.y;values.ParamAngleZ+=secondary.head.z;
  this.body=approach(this.body,this.follow&&!this.reducedMotion&&!this.sleeping?this.pointer.x*.8*this.dynamics.settings.head:0,dt,.48);
  values.ParamBodyAngleZ+=this.body;
  if(this.idle&&!this.reducedMotion){values.ParamBreath=secondary.breath;values.ParamHairBack+=secondary.hair.back;values.ParamRibbon+=.1*Math.sin(this.time*1.3);}
  values.ParamEyeBallX=secondary.gaze.x;values.ParamEyeBallY=secondary.gaze.y;
  const blinking=this.idle&&!this.reducedMotion&&!eyeLocked&&!this.sleeping&&!this.action&&this.face.phase==='idle'&&this.face.current!=='relaxed';
  if(blinking&&this.time>=this.blinkAt&&this.blinkStart===null)this.blinkStart=this.time;
  let aperture=this.face.aperture;
  if(this.blinkStart!==null){
   const t=this.time-this.blinkStart;
   if(!blinking||t>.24){this.blinkStart=null;this.blinkAt=this.time+2.7+this.random()*3.2;}
   else aperture*=t<.09?1-ease(t/.09):t<.12?0:ease((t-.12)/.12);
  }
  values.ParamEyeLOpen*=aperture;values.ParamEyeROpen*=aperture;
  Object.assign(values,this.manual);
  values.ParamExpression=EXPRESSIONS.indexOf(this.face.current);
  // 差分眼睛的视线已绘入素材，隐藏的基础眼球保持居中。
  if(values.ParamExpression!==0)values.ParamEyeBallX=values.ParamEyeBallY=0;
  for(const [id,r] of Object.entries(PARAMETERS))values[id]=clamp(values[id],r[0],r[1]);
  this.lastValues=values;return {...values};
 }
 getState(){return {
  expression:this.face.target,renderedExpression:this.face.current,baseExpression:this.baseExpression,
  transitioning:this.face.phase!=='idle',interaction:this.reaction?.kind??null,sleeping:this.sleeping,
  interactive:this.interactive,paused:this.paused,idle:this.idle,follow:this.follow,
  action:this.action?.name??null,manual:{...this.manual},parameters:{...this.lastValues},
  speech:this.reaction&&!this.paused?REACTIONS[this.reaction.kind].speech:'',
  label:this.paused?'已暂停':this.sleeping?'休息中':this.reaction?REACTIONS[this.reaction.kind].label:this.action?ACTION_LABELS[this.action.name]:this.baseExpression!=='neutral'?MOOD_LABELS[EXPRESSIONS.indexOf(this.baseExpression)]:this.idle?'待机':'静止'
 };}
}

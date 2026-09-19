import {PetBehavior} from './behavior.mjs';
import {SecondaryMotion} from './dynamics.mjs';
export const EXPRESSIONS = ['neutral','smile','sad','angry','surprised','closed_eyes','crying'];
export const EXPRESSION_IDS = {smile:'ParamExprSmile',sad:'ParamExprSad',angry:'ParamExprAngry',surprised:'ParamExprSurprised',closed_eyes:'ParamExprClosedeyes',crying:'ParamExprCrying'};
export const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function cubic(a,b,c,d,t){const q=1-t;return q*q*q*a+3*q*q*t*b+3*q*t*t*c+t*t*t*d;}
export function sampleCurve(curve,time){
  const s=curve.Segments;let t0=s[0],v0=s[1],i=2;
  while(i<s.length){const type=s[i++];
    if(type===1){const x1=s[i++],y1=s[i++],x2=s[i++],y2=s[i++],t1=s[i++],v1=s[i++];
      if(time<=t1){let lo=0,hi=1;for(let j=0;j<18;j++){const u=(lo+hi)/2;if(cubic(t0,x1,x2,t1,u)<time)lo=u;else hi=u;}return cubic(v0,y1,y2,v1,(lo+hi)/2);}t0=t1;v0=v1;
    }else if(type===0||type===2||type===3){const t1=s[i++],v1=s[i++];if(time<=t1){if(type===2)return v0;if(type===3)return v1;return v0+(v1-v0)*clamp((time-t0)/(t1-t0),0,1);}t0=t1;v0=v1;
    }else throw new Error(`Unknown motion segment ${type}`);
  }return v0;
}
export class CharacterController {
  constructor(parameters,clips){this.parameters=new Map(parameters.map(p=>[p.Id,p]));this.clips=clips;this.behavior=new PetBehavior();this.dynamics=new SecondaryMotion();this.time=0;this.idle=true;this.paused=false;this.expression='neutral';this.manual={};this.action=null;this.follow=false;this.pointer={x:0,y:0};this.lastValues={};this.response=null;}
  setExpression(name){if(!EXPRESSIONS.includes(name))throw Error('Unknown expression');this.behavior.manual();this.expression=name;}
  setParameter(id,value){const p=this.parameters.get(id);if(!p||!Number.isFinite(value))throw Error('Invalid parameter');this.behavior.manual();this.manual[id]=clamp(value,p.Min,p.Max);}
  play(name){if(name!=='idle'&&!this.clips[name])throw Error('Unknown motion');this.behavior.manual();if(name==='idle'){this.idle=true;this.action=null;this.manual={};return;}this.action={name,start:this.time};if(name==='talk')delete this.manual.ParamMouthOpenY;if(name==='wink'||name==='blink'){delete this.manual.ParamEyeLOpen;delete this.manual.ParamEyeROpen;}if(['tilt','nod'].includes(name)){delete this.manual.ParamAngleX;delete this.manual.ParamAngleY;delete this.manual.ParamAngleZ;}}
  reset(){this.time=0;this.expression='neutral';this.manual={};this.action=null;this.idle=true;this.paused=false;this.follow=false;this.pointer={x:0,y:0};this.behavior.reset();this.dynamics.reset();this.response=null;}
  update(delta){
    const dt=clamp(delta,0,.1);if(!this.paused)this.time+=dt;
    const values=Object.fromEntries([...this.parameters].map(([id,p])=>[id,p.Default]));
    const apply=(clip,t,weight=1)=>{for(const curve of clip.Curves){if(curve.Target!=='Parameter'||!(curve.Id in values))continue;const v=sampleCurve(curve,t);values[curve.Id]+=(v-values[curve.Id])*weight;}};
    if(this.idle&&this.clips.idle)apply(this.clips.idle,this.time%this.clips.idle.Meta.Duration);
    if(this.action){const clip=this.clips[this.action.name],t=this.time-this.action.start;if(t>clip.Meta.Duration)this.action=null;else apply(clip,t,Math.min(ease(t/.12),ease((clip.Meta.Duration-t)/.16)));}
    const animationDt=this.paused?0:dt;
    this.response=this.behavior.update(animationDt,{idle:this.idle&&this.expression==='neutral'&&Object.keys(this.manual).length===0,busy:!!this.action});
    if(this.response){for(const [id,v] of Object.entries(this.response.add||{}))values[id]+=v;Object.assign(values,this.response.set||{});values.ParamMouthOpenY=this.response.mouth??values.ParamMouthOpenY;}
    const expression=this.response?.expression??this.expression;
    const secondary=this.dynamics.update(animationDt,{target:this.pointer,tracking:this.follow,sleeping:this.behavior.sleeping,eyesAvailable:expression==='neutral',talking:this.action?.name==='talk'||['greet','murmur'].includes(this.response?.kind),angleX:this.manual.ParamAngleX??values.ParamAngleX,angleZ:this.manual.ParamAngleZ??values.ParamAngleZ,impulse:this.response?.add?.ParamHairFront??0});
    values.ParamAngleX+=secondary.head.x;values.ParamAngleY+=secondary.head.y;values.ParamAngleZ+=secondary.head.z;
    values.ParamEyeBallX=secondary.gaze.x;values.ParamEyeBallY=secondary.gaze.y;
    values.ParamHairBack=secondary.hair.back;
    values.ParamHairFront=values.ParamHairFront*this.dynamics.settings.hair+secondary.hair.front;
    values.ParamBreath=secondary.breath;
    Object.assign(values,this.manual);
    // Expression switches are absolute and mutually exclusive, avoiding stacked eyes.
    for(const [name,id] of Object.entries(EXPRESSION_IDS))values[id]=name===expression?1:0;
    values.ParamSwEyeBase=expression==='neutral'?1:0;values.ParamSwBrowBase=expression==='neutral'?1:0;values.ParamSwMouthBase=1;
    // These legacy independent hair channels remain zero; all hair shares one transform.
    for(const id of ['ParamHairSide','ParamHairTail','ParamHairStrand'])values[id]=0;
    for(const [id,value] of Object.entries(values)){const p=this.parameters.get(id);values[id]=clamp(value,p.Min,p.Max);}
    this.lastValues=values;return values;
  }
}

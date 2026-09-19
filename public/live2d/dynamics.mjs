// Portable, DOM-free secondary motion driver. All amplitudes remain within the rig's keys.
export const DYNAMICS_DEFAULTS=Object.freeze({gaze:.8,head:.65,hair:.75,breath:.6,breathRate:14});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const approach=(value,target,dt,tau)=>value+(target-value)*(-Math.expm1(-dt/tau));
const smooth=t=>.5-.5*Math.cos(Math.PI*clamp(t,0,1));
export function breathEnvelope(phase){phase=((phase%1)+1)%1;return phase<.38?smooth(phase/.38):1-smooth((phase-.38)/.62);}
export class SecondaryMotion {
  constructor(settings={}){this.settings={...DYNAMICS_DEFAULTS};this.configure(settings);this.reset();}
  configure(patch){
    for(const [key,value] of Object.entries(patch)){if(!(key in DYNAMICS_DEFAULTS)||!Number.isFinite(value)||value< (key==='breathRate'?6:0)||value>(key==='breathRate'?24:1))throw new RangeError('Invalid dynamics setting: '+key);}
    Object.assign(this.settings,patch);return {...this.settings};
  }
  reset(){this.time=0;this.eye={x:0,y:0};this.head={x:0,y:0};this.hair=0;this.velocity=0;this.previousAngle=null;this.phase=0;this.rate=this.settings.breathRate;this.last=this.sample();}
  sample({tracking=true,sleeping=false,eyesAvailable=true,talking=false}={}){
    const s=this.settings,gaze=eyesAvailable&&!sleeping?s.gaze:0;
    return {gaze:{x:this.eye.x*gaze,y:this.eye.y*gaze},head:{x:this.head.x*6*s.head,y:this.head.y*4*s.head,z:-this.head.x*3*s.head},hair:{back:clamp(this.hair,-1,1)*s.hair,front:clamp(this.hair*2,-3,3)*s.hair},breath:clamp(breathEnvelope(this.phase)*s.breath*(sleeping?.85:talking?1.08:1),0,1)};
  }
  update(delta,{target={x:0,y:0},tracking=true,sleeping=false,eyesAvailable=true,talking=false,angleX=0,angleZ=0,impulse=0}={}){
    const dt=clamp(Number.isFinite(delta)?delta:0,0,.1),tx=tracking&&!sleeping?clamp(target.x||0,-1,1):0,ty=tracking&&!sleeping?clamp(target.y||0,-1,1):0;
    this.eye.x=approach(this.eye.x,tx,dt,.085);this.eye.y=approach(this.eye.y,ty,dt,.1);
    this.head.x=approach(this.head.x,tx,dt,.32);this.head.y=approach(this.head.y,ty,dt,.38);
    const drivenAngle=angleZ+this.head.x*6*this.settings.head+angleX*.3;
    const speed=this.previousAngle===null||dt===0?0:clamp((drivenAngle-this.previousAngle)/dt,-100,100);
    if(dt>0)this.previousAngle=drivenAngle;
    const n=Math.max(1,Math.ceil(dt*120)),step=dt/n;
    for(let i=0;i<n;i++){
      this.time+=step;
      this.rate=approach(this.rate,this.settings.breathRate*(sleeping?.72:talking?1.12:1),step,.8);
      this.phase=(this.phase+step*this.rate/60)%1;
      const wind=(Math.sin(this.time*1.3)*.11+Math.sin(this.time*2.17+.7)*.05)*(sleeping?.25:1);
      const goal=clamp(-speed*.012+angleZ*.008+wind+impulse*.06,-1,1),omega=9;
      this.velocity+=(omega*omega*(goal-this.hair)-2*.58*omega*this.velocity)*step;
      this.hair+=this.velocity*step;
    }
    this.last=this.sample({tracking,sleeping,eyesAvailable,talking});return this.last;
  }
}

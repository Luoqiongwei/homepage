// Pet-like responses drive Cubism parameters; they never replace the rendered model.
export class PetBehavior {
  constructor({random=Math.random,sleepAfter=45}={}){this.random=random;this.sleepAfter=sleepAfter;this.enabled=true;this.reset();}
  reset(){this.time=0;this.lastActive=0;this.nextAmbient=8;this.reaction=null;this.sleeping=false;this.hover=null;this.hoverAge=0;this.shyLatched=false;this.press=null;this.clicks=[];this.lockUntil=0;this.label='可以摸摸头，或轻点脸颊';}
  manual(){this.reaction=null;this.sleeping=false;this.press=null;this.clicks=[];this.lockUntil=0;this.hoverAge=0;this.shyLatched=true;this.lastActive=this.time;this.nextAmbient=this.time+12;this.label='手动控制中';}
  setEnabled(enabled){this.enabled=Boolean(enabled);this.manual();this.label=this.enabled?'可以摸摸头，或轻点脸颊':'互动已关闭';}
  react(kind,duration){this.reaction={kind,start:this.time,duration};this.lastActive=this.time;this.nextAmbient=this.time+10+this.random()*10;}
  wake(){if(!this.sleeping)return false;this.sleeping=false;this.react('wake',2.3);this.label='嗯？嗯。';return true;}
  move(zone,x=0,y=0){
    if(!this.enabled)return;
    if(zone!==this.hover){this.hoverAge=0;this.shyLatched=false;}this.hover=zone;
    if(zone){this.lastActive=this.time;this.wake();}
    if(this.press){this.press.distance+=Math.hypot(x-this.press.x,y-this.press.y);this.press.x=x;this.press.y=y;if(zone!=='headtop')this.press.valid=false;}
  }
  down(zone,x=0,y=0){
    if(!this.enabled||!zone)return false;
    this.lastActive=this.time;if(this.wake())return true;if(this.reaction?.kind==='wake'&&this.time-this.reaction.start<.6)return true;if(this.time<this.lockUntil)return false;
    this.clicks=this.clicks.filter(t=>this.time-t<1);this.clicks.push(this.time);
    if(this.clicks.length>=6){this.react('cry',2.4);this.lockUntil=this.time+2.4;this.clicks=[];this.press=null;this.label='慢一点啦……';return true;}
    if(zone==='headtop'){this.press={start:this.time,x,y,distance:0,valid:true,patting:false};return true;}
    this.trigger(zone);return true;
  }
  up(){if(!this.press)return;const p=this.press;this.press=null;if(this.time<this.lockUntil)return;if(p.patting){this.react('pat',2);this.label='呜~';}else if(p.valid)this.trigger('headtop');}
  cancelPointer(){this.press=null;this.hover=null;this.hoverAge=0;}
  trigger(kind){
    if(!this.enabled||this.time<this.lockUntil)return false;
    if(this.wake())return true;
    const options={face:[2.4,'唔……'],mouth:[1.7,'……嗯？'],ribbon:[2.6,'丝带刚刚才系好。'],hair:[1.2,'头发要乱了。'],headtop:[1,'嗯？'],body:[1.5,'我在这里。'],pat:[2.6,'呜~'],greet:[3,'嗯，我在听。']};
    const option=options[kind];if(!option)return false;this.react(kind,option[0]);this.label=option[1];return true;
  }
  nap(){if(!this.enabled||this.time<this.lockUntil)return;this.sleeping=true;this.reaction=null;this.press=null;this.label='稍微眯一会儿……';}
  update(dt,{idle=true,busy=false}={}){
    if(!this.enabled)return null;this.time+=dt;
    if(this.press?.valid&&this.time>=this.lockUntil){const held=this.time-this.press.start;if(held>.3&&(this.press.distance>.008||held>.65)){this.press.patting=true;this.label='呜~';this.lastActive=this.time;}}
    if(this.hover==='face'&&!this.press&&!this.sleeping&&!this.reaction&&!busy){this.hoverAge+=dt;if(this.hoverAge>3&&!this.shyLatched){this.shyLatched=true;this.react('shy',2.8);this.label='……看这么久？';}}
    if(this.reaction&&this.time-this.reaction.start>=this.reaction.duration){this.reaction=null;this.label='可以摸摸头，或轻点脸颊';}
    if(idle&&!busy&&!this.reaction&&!this.press&&!this.sleeping&&this.time-this.lastActive>=this.sleepAfter)this.nap();
    if(idle&&!busy&&!this.sleeping&&!this.reaction&&!this.press&&this.time>=this.nextAmbient){const lastActive=this.lastActive;this.react(this.random()<.5?'murmur':'glance',2.6);this.label='陪你待一会儿。';// Ambient motions must not reset the inactivity countdown.
      this.lastActive=lastActive;
    }
    return this.sample();
  }
  sample(){
    if(this.sleeping)return {expression:'closed_eyes',mouth:0,add:{ParamAngleY:-3,ParamAngleZ:2*Math.sin(this.time*.5)},set:{ParamBreath:(Math.sin(this.time*.9)+1)/2},label:this.label,kind:'sleep'};
    if(this.press?.patting)return {expression:'smile',mouth:0,add:{ParamAngleY:-1.5,ParamAngleZ:3*Math.sin(this.time*3)},label:this.label,kind:'pat'};
    if(!this.reaction)return null;
    const {kind,start,duration}=this.reaction,t=this.time-start,fade=Math.min(1,t/.12,(duration-t)/.2),add={},sway=Math.sin(t*7)*Math.exp(-t*2)*fade;
    let expression='neutral',mouth=0;
    if(kind==='face'){expression=t<.5?'surprised':'sad';add.ParamAngleZ=-5*sway;}
    if(kind==='mouth'){expression=t<.45?'surprised':'closed_eyes';add.ParamAngleY=-2*sway;}
    if(kind==='ribbon'){expression=t<.4?'surprised':'angry';add.ParamRibbon=8*sway;add.ParamBodyAngleZ=2*sway;}
    if(kind==='hair'){expression='closed_eyes';add.ParamHairFront=5*sway;add.ParamAngleZ=4*sway;}
    if(kind==='headtop'||kind==='body'){expression='surprised';add.ParamAngleY=-2*sway;}
    if(kind==='pat'||kind==='shy'){expression='smile';add.ParamAngleZ=4*Math.sin(Math.PI*t/duration);add.ParamAngleY=-1.5*fade;}
    if(kind==='cry'){expression='crying';add.ParamAngleZ=1.5*Math.sin(t*9)*fade;}
    if(kind==='wake'){expression=t<.6?'surprised':'smile';add.ParamAngleY=2*sway;}
    if(kind==='greet'||kind==='murmur'){expression=kind==='greet'?'smile':'neutral';mouth=(Math.sin(t*11)>.2?(Math.sin(t*5)>.4?.8:.35):0)*fade;add.ParamAngleZ=2*Math.sin(t*2)*fade;}
    if(kind==='glance'){add.ParamAngleX=4*Math.sin(t/duration*Math.PI);add.ParamAngleZ=-2*fade;}
    return {expression,mouth,add,label:this.label,kind};
  }
}

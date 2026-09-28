const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
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


/* FAST Driver Motion Engine v1
   Smooths GPS jumps, animates vehicle movement, rotates by heading and follows intelligently. */
(function(){
  const STATE={
    raw:null,
    smooth:null,
    heading:0,
    speed:0,
    accuracy:999,
    lastTs:0,
    follow:true,
    lastCameraTs:0,
    animFrame:null,
    navRoute:null
  };

  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function normHeading(h){h=Number(h||0)%360;return h<0?h+360:h;}
  function headingDelta(a,b){return ((b-a+540)%360)-180;}
  function lerp(a,b,t){return a+(b-a)*t;}
  function lerpHeading(a,b,t){return normHeading(a+headingDelta(a,b)*t);}

  function haversine(a,b){
    const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;
    const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.asin(Math.sqrt(x));
  }

  function bearing(a,b){
    const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;
    const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return normHeading(Math.atan2(y,x)*180/Math.PI);
  }

  function validPoint(p){
    return p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng));
  }

  function rejectJump(prev,next,dtMs){
    if(!prev||!next)return false;
    const m=haversine(prev,next),secs=Math.max(.5,dtMs/1000),kmh=(m/secs)*3.6;
    const acc=Number(next.accuracy_m||999);
    if(acc>120)return true;
    if(m>350&&secs<5)return true;
    if(kmh>190&&Number(next.speed_kmh||0)<150)return true;
    return false;
  }

  function chooseHeading(prev,next){
    const reported=Number(next.heading);
    const speed=Number(next.speed_kmh||0);
    if(Number.isFinite(reported)&&reported>=0&&reported<=360&&speed>4)return reported;
    if(prev&&haversine(prev,next)>4)return bearing(prev,next);
    return STATE.heading;
  }

  function smoothingFactor(speed,accuracy){
    let t=.22;
    if(speed>10)t=.34;
    if(speed>35)t=.48;
    if(speed>70)t=.62;
    if(accuracy>35)t*=.55;
    if(accuracy<12)t*=1.12;
    return clamp(t,.12,.72);
  }

  function animateMarker(from,to,duration=900){
    if(!window.map||!window.driverLiveMarker||!validPoint(to))return;
    if(STATE.animFrame)cancelAnimationFrame(STATE.animFrame);
    const start=performance.now();
    const a=from&&validPoint(from)?from:to;
    const ah=STATE.heading,bh=normHeading(to.heading||STATE.heading);
    const tick=now=>{
      const p=clamp((now-start)/duration,0,1);
      const eased=1-Math.pow(1-p,3);
      const lng=lerp(Number(a.lng),Number(to.lng),eased);
      const lat=lerp(Number(a.lat),Number(to.lat),eased);
      const h=lerpHeading(ah,bh,eased);
      driverLiveMarker.setLngLat([lng,lat]);
      const el=driverLiveMarker.getElement();
      const car=el&&el.querySelector?el.querySelector('.car-body'):null;
      if(car)car.style.transform='rotate('+h+'deg)';
      if(p<1)STATE.animFrame=requestAnimationFrame(tick);
    };
    STATE.animFrame=requestAnimationFrame(tick);
  }

  function cameraFor(speed){
    if(speed<5)return {zoom:17.8,pitch:50};
    if(speed<30)return {zoom:17.3,pitch:58};
    if(speed<70)return {zoom:16.7,pitch:62};
    return {zoom:16.1,pitch:64};
  }

  function followCamera(point){
    if(!window.map||!STATE.follow||!validPoint(point))return;
    const now=Date.now();
    if(now-STATE.lastCameraTs<450)return;
    STATE.lastCameraTs=now;
    const c=cameraFor(STATE.speed);
    map.easeTo({
      center:[point.lng,point.lat],
      zoom:c.zoom,
      pitch:c.pitch,
      bearing:STATE.heading,
      duration:650,
      easing:t=>t*(2-t)
    });
  }

  function ensureFollowButton(){
    const host=document.getElementById('driverGpsMapHost')||document.getElementById('sharedMapWrap');
    if(!host||document.getElementById('driverFollowBtn'))return;
    host.style.position='relative';
    const b=document.createElement('button');
    b.id='driverFollowBtn';b.className='driver-follow-btn active';b.innerHTML='➤';b.title='Suivre mon véhicule';
    b.onclick=()=>{
      STATE.follow=true;b.classList.add('active');
      if(STATE.smooth)followCamera(STATE.smooth);
    };
    host.appendChild(b);
    if(window.map){
      map.on('dragstart',()=>{STATE.follow=false;b.classList.remove('active')});
      map.on('rotatestart',()=>{STATE.follow=false;b.classList.remove('active')});
      map.on('zoomstart',()=>{if(!map._fastProgrammatic){STATE.follow=false;b.classList.remove('active')}});
    }
  }

  function process(dl){
    if(!validPoint(dl))return null;
    const now=Date.now();
    const next={lat:Number(dl.lat),lng:Number(dl.lng),accuracy_m:Number(dl.accuracy_m||999),speed_kmh:Number(dl.speed_kmh||0),heading:Number(dl.heading)};
    const dt=STATE.lastTs?now-STATE.lastTs:1000;
    if(STATE.raw&&rejectJump(STATE.raw,next,dt))return STATE.smooth;
    const h=chooseHeading(STATE.raw,next);
    const speed=Math.max(0,Number(next.speed_kmh||0));
    const accuracy=Math.max(1,Number(next.accuracy_m||999));
    let smooth;
    if(!STATE.smooth){smooth={...next,heading:h};}
    else{
      const t=smoothingFactor(speed,accuracy);
      smooth={
        lat:lerp(STATE.smooth.lat,next.lat,t),
        lng:lerp(STATE.smooth.lng,next.lng,t),
        heading:lerpHeading(STATE.heading,h,clamp(t*1.35,.18,.82)),
        speed_kmh:speed,
        accuracy_m:accuracy
      };
    }
    const previous=STATE.smooth;
    STATE.raw=next;STATE.smooth=smooth;STATE.heading=smooth.heading;STATE.speed=speed;STATE.accuracy=accuracy;STATE.lastTs=now;
    animateMarker(previous,smooth,clamp(dt*.82,500,1200));
    followCamera(smooth);
    return smooth;
  }

  window.FastDriverMotion={process,state:STATE,enableFollow(){STATE.follow=true;if(STATE.smooth)followCamera(STATE.smooth)},disableFollow(){STATE.follow=false}};
  window.addEventListener('load',()=>setTimeout(ensureFollowButton,700));
})();

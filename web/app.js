/* HOOPFORM — on-device basketball shooting coach (web).
 * MediaPipe Pose Landmarker + browser CV ball tracking + one-correction coach.
 * Original code, Apache-2.0. Deps: MediaPipe (Apache-2.0).
 * SPDX-License-Identifier: Apache-2.0
 *
 * v1.1 fixes: rear camera by default, shape/size/temporal-gated ball tracker,
 * auto side-of-body selection (near/visible arm), robust direction-agnostic
 * release angle with a parabola arc-quality gate, visible shot counter.
 */
'use strict';

import { FilesetResolver, PoseLandmarker } from './mediapipe/vision_bundle.mjs';

/* ---------- geometry ---------- */
function angleAt(a, b, c){                  // interior angle ABC, vertex at b, in degrees
  const u=[a[0]-b[0], a[1]-b[1]], v=[c[0]-b[0], c[1]-b[1]];
  const nu=Math.hypot(u[0],u[1]), nv=Math.hypot(v[0],v[1]);
  if(!nu||!nv) return 180;
  return Math.acos(Math.min(1,Math.max(-1,(u[0]*v[0]+u[1]*v[1])/(nu*nv))))*180/Math.PI;
}
const dist=(a,b)=>Math.hypot(a[0]-b[0], a[1]-b[1]);

/* MediaPipe Pose landmark indices, per side. We analyze the side FACING the
 * camera (higher visibility) — for a side-on shooter that's the shooting arm. */
const SIDES={
  L:{head:0, sh:11, el:13, wr:15, hip:23, knee:25, ankle:27},
  R:{head:0, sh:12, el:14, wr:16, hip:24, knee:26, ankle:28},
};
function pickSide(r){
  const vis=(m)=>['sh','el','wr','hip','knee','ankle']
    .reduce((s,k)=>s+((r[m[k]] && r[m[k]].visibility)||0),0);
  return vis(SIDES.R) >= vis(SIDES.L) ? SIDES.R : SIDES.L;
}

let video, canvas, ctx, running=false, paused=false;
let pose, curResults=null;
let ball={x:NaN,y:NaN,on:false};
let flight=[], state='READY';               // READY|HELD|FLIGHT
let heldFrames=0, missFrames=0;
let stats={knee_min:999};                   // last-shot metrics (per-shot accumulators)
let lastBy, releaseAngle=NaN;
let tip='Start shooting!', speakLock=0;
let ruleStreak={}, lastCoaches=[];
let stature=1;                              // px scale (shin length proxy)
let shotCount=0;

const RULES=[                               // priority order; (id, ok, msg)
  ['knees', m=> m.knee_min<=135,          "Bend your knees more."],
  ['elbow', m=> m.elbow_set<=105,         "Tuck your elbow to ninety degrees."],
  ['align', m=> m.align_err<=0.15,        "Line your shoulder over your foot."],
  ['height',m=> m.rel_height>=0,          "Release the ball above your eyes."],
  ['follow',m=> m.follow_through,         "Hold your follow-through."],
];

/* ---------- init mediapipe (self-hosted, offline) ---------- */
async function init(){
  try{
    const wasmBase = (() => {
      const b = new URL('./mediapipe/wasm', document.baseURI).href;
      return b.endsWith('/') ? b : b + '/';
    })();
    const vision = await FilesetResolver.forVisionTasks(wasmBase);
    pose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: './mediapipe/pose_landmarker_full.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5 });
    setStatus('pose ready ✓');
  } catch(e){ setStatus('pose failed: ' + e.message); }
}

/* ---------- camera ---------- */
async function start(){
  video=document.getElementById('cam');
  canvas=document.getElementById('ov');
  ctx=canvas.getContext('2d');
  let stream;
  try{
    // rear camera — you film yourself shooting from the side (the whole point)
    stream=await navigator.mediaDevices.getUserMedia(
      {video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}});
  }catch(e){
    try{ stream=await navigator.mediaDevices.getUserMedia({video:true}); } // laptop fallback
    catch(e2){ setStatus('camera failed: '+e2.message); return; }
  }
  video.srcObject=stream; await video.play();
  running=true; paused=false;
  document.getElementById('startScreen').hidden=true;
  document.getElementById('live').hidden=false;
  requestAnimationFrame(loop);
  if(!pose) init();
}

/* ---------- ball tracking (orange blob, shape/size/temporal gated) ---------- */
function trackBall(scale){
  if(!video.videoWidth) return;
  const w=Math.floor(video.videoWidth*scale), h=Math.floor(video.videoHeight*scale);
  if(canvas.width!==video.videoWidth){ canvas.width=video.videoWidth; canvas.height=video.videoHeight; }
  ctx.drawImage(video,0,0,w,h);
  let img;
  try{ img=ctx.getImageData(0,0,w,h); }catch(e){ return; }
  const d=img.data;
  let sx=0,sy=0,n=0, minx=w,miny=h,maxx=0,maxy=0;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    // basketball orange: R strongly dominant, mid G, low B, well saturated
    if(r>110 && (r-g)>45 && (g-b)>15 && b<110 && g>40 && g<190){
      const px=(i/4)%w, py=Math.floor((i/4)/w);
      sx+=px; sy+=py; n++;
      if(px<minx)minx=px; if(px>maxx)maxx=px; if(py<miny)miny=py; if(py>maxy)maxy=py;
    }
  }
  const cx=sx/n/w*video.videoWidth, cy=sy/n/h*video.videoHeight;
  // shape/size gates: a ball is roughly round (aspect ~1) and not huge
  const bw=(maxx-minx)+1, bh=(maxy-miny)+1;
  const aspect = bw && bh ? Math.max(bw,bh)/Math.min(bw,bh) : 9;
  const fill = (bw*bh) ? n/(bw*bh) : 0;              // orange pixels / bbox area
  const areaFrac = (bw*bh)/(w*h);
  const looksLikeBall = n>=25 && aspect<=1.9 && fill>=0.35 && areaFrac<=0.25;
  if(looksLikeBall){
    // temporal smoothing + jump gate (reject teleports unless we'd lost it)
    if(ball.on && Number.isFinite(ball.x)){
      const jump=Math.hypot(cx-ball.x, cy-ball.y)/(video.videoWidth||1);
      if(jump>0.6){ /* implausible jump: keep prior, decay */ }
      else { ball.x=ball.x*0.5+cx*0.5; ball.y=ball.y*0.5+cy*0.5; }
    } else { ball.x=cx; ball.y=cy; }
    ball.on=true; missFrames=0;
  } else {
    // tolerate brief dropouts before declaring the ball gone
    if(++missFrames>4) ball.on=false;
  }
}

/* ---------- per-frame processing ---------- */
function loop(ts){
  if(!running||paused){ if(running) requestAnimationFrame(loop); return; }
  if(pose && video.readyState>=2){
    const res=pose.detectForVideo(video, performance.now());
    curResults=res.landmarks && res.landmarks[0] || null;
  }
  trackBall(0.5);
  if(curResults) processShot(curResults);
  render();
  if(running) requestAnimationFrame(loop);
}

function P(r,i){ return [r[i].x*video.videoWidth, r[i].y*video.videoHeight]; }

function processShot(r){
  const IDX=pickSide(r);                  // analyze the arm facing the camera
  const hs=P(r,IDX.head), sh=P(r,IDX.sh), el=P(r,IDX.el), wr=P(r,IDX.wr),
        hip=P(r,IDX.hip), kn=P(r,IDX.knee), an=P(r,IDX.ankle);
  stature = Math.max(stature, dist(kn,an));
  const e_elbow=angleAt(sh,el,wr);       // release elbow extension
  const e_knee =angleAt(hip,kn,an);      // knee bend (dip when small)
  const rel_height=(hs[1]-wr[1])/stature;// >0 = wrist above head
  const align_err=Math.abs(sh[0]-an[0])/stature;

  // ---- release FSM (ball-wrist distance + upward motion) ----
  const d=ball.on? dist(ball,wr)/stature : 9;
  const vy=ball.on? (lastBy!==undefined? ball.y-lastBy:0) : 0;
  lastBy=ball.y;

  if(state==='READY'||state==='HELD'){
    if(ball.on && d<0.6){
      if(state==='READY'){ // shot starting: reset per-shot accumulators FIRST
        stats={knee_min:999, elbow_set:undefined, rel_height, align_err,
               release_angle:undefined, follow_through:false};
        flight=[];
      }
      state='HELD'; heldFrames=heldFrames+1;
    }
    else if(state==='HELD' && heldFrames>=6 && ball.on && d>0.7 && vy< -2){
      state='FLIGHT'; releaseAngle=NaN; heldFrames=0;
    } else if(!ball.on){ heldFrames=0; }
  } else if(state==='FLIGHT'){
    if(ball.on) flight.push([ball.x,ball.y]);
    if(flight.length>=8 && stats.release_angle===undefined){
      const xs=flight.map(p=>p[0]), ys=flight.map(p=>p[1]);
      const fit=linFit(xs,ys,2);
      // real arc: parabola fits well AND opens downward in image coords (y grows down)
      const arcOk = !!(fit && fit[3].r2>0.6 && fit[2]>0);
      const k=Math.min(5,flight.length-1);
      const dxTot=flight[k][0]-flight[0][0], dyTot=flight[k][1]-flight[0][1];
      if(Math.hypot(dxTot,dyTot)>10){
        // direction-agnostic launch angle from horizontal (0..90)
        releaseAngle=Math.round(Math.atan2(Math.abs(dyTot), Math.abs(dxTot)||1)*180/Math.PI);
        stats.release_angle=releaseAngle;
        stats.follow_through = e_elbow>=150;
        stats.elbow_release=e_elbow;
        stats.arc_quality=arcOk;
        finalizeShot();
        state='READY'; flight=[]; heldFrames=0;
      } else if(flight.length>40){        // gave up: no real flight, reset
        state='READY'; flight=[]; heldFrames=0;
      }
    }
  }

  // ---- frame metrics into stats (AFTER any reset above) ----
  if(state==='HELD'){
    if(e_knee<stats.knee_min) stats.knee_min=e_knee;
    stats.elbow_set = stats.elbow_set===undefined ? e_elbow : Math.min(stats.elbow_set,e_elbow);
    stats.rel_height=rel_height; stats.align_err=align_err;
  }
}

/* ---------- parabola fit (used for arc-quality gate) ---------- */
function linFit(xs,ys,deg){
  const n=xs.length; if(n<3) return null;
  const mx=xs.reduce((s,v)=>s+v,0)/n;      // normalize x to avoid numerical blowup
  const A=[]; for(let i=0;i<n;i++) A.push([1, xs[i]-mx, (xs[i]-mx)**2]);
  const S=[[0,0,0],[0,0,0],[0,0,0]], b=[0,0,0];
  for(let i=0;i<n;i++){ const r=A[i], y=ys[i];
    for(let k=0;k<3;k++){ S[k][0]+=r[k]*1; S[k][1]+=r[k]*r[1]; S[k][2]+=r[k]*r[2]; b[k]+=r[k]*y; } }
  const M=[[S[0][0],S[0][1],S[0][2],b[0]],[S[1][0],S[1][1],S[1][2],b[1]],[S[2][0],S[2][1],S[2][2],b[2]]];
  for(let c=0;c<3;c++){ let piv=c; for(let r=c+1;r<3;r++) if(Math.abs(M[r][c])>Math.abs(M[piv][c])) piv=r;
    [M[c],M[piv]]=[M[piv],M[c]]; const dd=M[c][c]||1e-9;
    for(let k=0;k<4;k++) M[c][k]/=dd;
    for(let r=0;r<3;r++) if(r!==c){ const f=M[r][c]; for(let k=0;k<4;k++) M[r][k]-=f*M[c][k]; } }
  const a0=M[0][3],a1=M[1][3],a2=M[2][3];
  let ymean=0; ys.forEach(y=>ymean+=y); ymean/=n;
  let sst=0,sse=0; for(let i=0;i<n;i++){ const e=ys[i]-(a0+a1*(xs[i]-mx)+a2*(xs[i]-mx)**2);
    sst+=(ys[i]-ymean)**2; sse+=e*e; } const r2=sst?(1-sse/sst):1;
  return [a0,a1,a2,{r2,b1:a1,b2:a2}];
}

/* ---------- coach engine: ONE change at a time ---------- */
function finalizeShot(){
  const m={knee_min:stats.knee_min||0, elbow_set:stats.elbow_set===undefined?90:stats.elbow_set,
           align_err:stats.align_err||0, rel_height:stats.rel_height||0,
           follow_through:stats.follow_through||false, release_angle:stats.release_angle};
  shotCount++;
  const viol=[];
  for(const [id,ok,msg] of RULES){ if(!ok(m)) viol.push([id,msg]); }
  const now=Date.now();
  if(viol.length){
    const [id,msg]=viol[0];
    ruleStreak[id]=(ruleStreak[id]||0)+1;
    if(ruleStreak[id]>=2 && now-speakLock>9000){
      sayTip(msg); tip=msg; speakLock=now; lastCoaches.push(id);
    } else { tip=msg; }
  } else {
    Object.keys(ruleStreak).forEach(k=>delete ruleStreak[k]);
    if(now-speakLock>9000){ sayTip('Nice shot — that form was clean!'); speakLock=now; }
    tip='Nice — that looks clean! Keep it up.';
  }
  document.getElementById('tip').textContent=tip;
  renderMetrics(m);
}

/* ---------- voice (Web Speech, on-device) ---------- */
function sayTip(t){ try{ const u=new SpeechSynthesisUtterance(t); u.rate=1; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch(e){} }

/* ---------- render overlay ---------- */
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(curResults){
    const r=curResults;
    const lines=[[11,13],[13,15],[11,23],[23,25],[25,27],[11,12],[12,14],[14,16],[12,24],[24,26],[26,28]];
    ctx.strokeStyle='#0ea5a0'; ctx.lineWidth=3;
    ctx.beginPath();
    for(const[a,b]of lines) if(r[a]&&r[b]){ ctx.moveTo(r[a].x*canvas.width,r[a].y*canvas.height);
      ctx.lineTo(r[b].x*canvas.width,r[b].y*canvas.height); }
    ctx.stroke();
    ctx.fillStyle='#fff'; [11,12,13,14,15,16,23,24,25,26,27,28].forEach(i=>{ if(r[i]){ctx.beginPath();
      ctx.arc(r[i].x*canvas.width,r[i].y*canvas.height,5,0,7); ctx.fill();}});
  }
  if(ball.on){ ctx.fillStyle='#ff7043'; ctx.beginPath();
    ctx.arc(ball.x,ball.y,14,0,7); ctx.fill(); }
  if(flight.length){ ctx.strokeStyle='#ffd54f'; ctx.lineWidth=4; ctx.beginPath();
    flight.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.stroke(); }
}

/* ---------- UI ---------- */
const setStatus=t=>document.getElementById('status').textContent=t;
function renderMetrics(m){
  const col=(ok)=>ok?'ok':'warn';
  const set=(id,v,ok)=> { const el=document.getElementById(id); if(!el) return; el.textContent=v; el.className='mv '+col(ok); };
  set('m-ang', m.release_angle?Math.round(m.release_angle)+'°':'—', m.release_angle>=45&&m.release_angle<=55);
  set('m-elbow', m.elbow_set?Math.round(m.elbow_set)+'°':'—', m.elbow_set<=105&&m.elbow_set>=80);
  set('m-knee', m.knee_min?Math.round(m.knee_min)+'°':'—', m.knee_min<=135);
  set('m-hgt', m.rel_height?((m.rel_height*100).toFixed(0)+'%'):'—', m.rel_height>=0);
  set('m-aln', m.align_err?m.align_err.toFixed(2):'—', m.align_err<=0.15);
  set('m-fol', m.follow_through?'✓':'—', m.follow_through);
  setStatus('shot #'+shotCount+' · form analyzed');
}

/* ---------- wire up ---------- */
document.getElementById('startBtn').onclick=start;
document.getElementById('toggleBtn').onclick=function(){ paused=!paused; this.textContent=paused?'▶ Resume':'⏸ Pause'; };
document.getElementById('resetBtn').onclick=function(){ ruleStreak={}; shotCount=0; tip='Streaks reset. Keep shooting!'; document.getElementById('tip').textContent=tip; };

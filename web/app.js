/* HOOPFORM — on-device basketball shooting coach (web).
 * MediaPipe Pose Landmarker + browser CV ball tracking + one-correction coach.
 * Original code, Apache-2.0. Deps: MediaPipe (Apache-2.0).
 * SPDX-License-Identifier: Apache-2.0
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

/* side view, right-handed shooter (mirror-aware). Landmark indices:
 * 8 top of head, 11 R shoulder, 13 R elbow, 15 R wrist, 23 R hip, 25 R knee, 27 R ankle */
const IDX={head:8, sh:11, el:13, wr:15, hip:23, knee:25, ankle:27};

let video, canvas, ctx, running=false, paused=false;
let pose, curResults=null;
let ball={x:NaN,y:NaN,on:false};
let flight=[], state='READY';               // READY|HELD|FLIGHT
let heldFrames=0;
let stats={knee_min:999};                  // last-shot metrics (per-shot accumulators)
let lastBy, releaseAngle=NaN;
let tip='Start shooting!', speakLock=0;
let ruleStreak={}, lastCoaches=[];
let stature=1;                             // px, knee..head approx

const RULES=[                              // priority order; (id, ok, msg)
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
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:480}});
  video.srcObject=stream; await video.play();
  running=true; paused=false;
  document.getElementById('startScreen').hidden=true;
  document.getElementById('live').hidden=false;
  requestAnimationFrame(loop);
  if(!pose) init();
}

/* ---------- ball tracking (orange centroid, browser CV) ---------- */
function trackBall(scale){
  if(!video.videoWidth) return;
  const w=Math.floor(video.videoWidth*scale), h=Math.floor(video.videoHeight*scale);
  if(canvas.width!==video.videoWidth){ canvas.width=video.videoWidth; canvas.height=video.videoHeight; }
  ctx.drawImage(video,0,0,w,h);
  let img;
  try{ img=ctx.getImageData(0,0,w,h); }catch(e){ return; }
  const d=img.data; let sx=0,sy=0,n=0;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    // orange-ish: R high, G mid, B low, saturated
    if(r>110 && g>40 && g<180 && b<90 && (r-g)>40 && (g-b)>10){
      sx+= (i/4)%w; sy+=Math.floor((i/4)/w); n++;
    }
  }
  if(n>60){ ball.x=sx/n/w*video.videoWidth; ball.y=sy/n/h*video.videoHeight; ball.on=true; }
  else if(n>0 && !ball.on){} // keep last a moment
  else if(n<=10){ ball.on=false; }
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
  const hs=P(r,IDX.head), sh=P(r,IDX.sh), el=P(r,IDX.el), wr=P(r,IDX.wr),
        hip=P(r,IDX.hip), kn=P(r,IDX.knee), an=P(r,IDX.ankle);
  stature = Math.max(stature, dist(kn,an));
  const e_elbow=angleAt(sh,el,wr);       // release elbow extension
  const e_knee =angleAt(hip,kn,an);      // knee bend (dip when small)
  const rel_height=(hs[1]-wr[1])/stature;// >0 = wrist above head
  const align_err=Math.abs(sh[0]-an[0])/stature;

  // ---- frame metrics into stats ----
  if(!stats.knee_min || e_knee<stats.knee_min) stats.knee_min=e_knee;
  stats.elbow_set = stats.elbow_set===undefined ? e_elbow : Math.min(stats.elbow_set,e_elbow);
  stats.rel_height=rel_height; stats.align_err=align_err;
  // ---- release FSM (ball-wrist distance + upward motion) ----
  const d=ball.on? dist(ball,wr)/stature : 9;
  const vy=ball.on? (lastBy!==undefined? ball.y-lastBy:0) : 0;
  lastBy=ball.y;
  if(state==='READY'||state==='HELD'){
    if(ball.on && d<0.6){
      if(state==='READY'){ // shot starting: reset per-shot accumulators
        stats={knee_min:999, elbow_set:undefined, rel_height, align_err,
               release_angle:undefined, follow_through:false};
        flight=[];
      }
      state='HELD'; heldFrames=(heldFrames==null?0:heldFrames)+1;
      // require a held window (>=6 frames) before we'll accept a release
    }
    else if(state==='HELD' && heldFrames>=6 && ball.on && d>0.7 && vy< -2){
      state='FLIGHT'; releaseAngle=NaN; heldFrames=0;
    } else if(!ball.on){ heldFrames=0; }
  } else if(state==='FLIGHT'){
    flight.push([ball.x,ball.y]);
    // require a minimum trajectory length in the intended direction
    if(flight.length>=10 && Math.abs(flight[flight.length-1][1]-flight[0][1])>12 &&
       stats.release_angle===undefined){
      // estimate launch angle from first two flight frames (px, up negative)
      const p0=flight[0], p1=flight[1];
      const dx=p1[0]-p0[0], dy=p1[1]-p0[1];
      if(Math.hypot(dx,dy)>1){
        releaseAngle=Math.round(Math.atan2(-dy, dx)*180/Math.PI);
        stats.release_angle=releaseAngle;
        stats.follow_through = e_elbow>=150;
        stats.elbow_release=e_elbow;
        finalizeShot();
        state='READY'; flight=[]; heldFrames=0;
      }
    }
  }
}

/* ---------- parabola helpers ---------- */
function b2eval(a0,a1,a2,x){ return 2*a2*x+a1; }
function linFit(xs,ys,deg){
  // least-squares polynomial fit, returns coeffs + r2
  const n=xs.length; if(n<3) return null;
  // normalize x to avoid numerical blowup
  const mx=xs.reduce((s,v)=>s+v,0)/n;
  const A=[]; for(let i=0;i<n;i++) A.push([1, xs[i]-mx, (xs[i]-mx)**2]);
  // normal equations (small)
  const S=[[0,0,0],[0,0,0],[0,0,0]], b=[0,0,0];
  for(let i=0;i<n;i++){ const r=A[i], y=ys[i];
    for(let k=0;k<3;k++){ S[k][0]+=r[k]*1; S[k][1]+=r[k]*r[1]; S[k][2]+=r[k]*r[2]; b[k]+=r[k]*y; } }
  // gauss solve
  const M=[[S[0][0],S[0][1],S[0][2],b[0]],[S[1][0],S[1][1],S[1][2],b[1]],[S[2][0],S[2][1],S[2][2],b[2]]];
  for(let c=0;c<3;c++){ let piv=c; for(let r=c+1;r<3;r++) if(Math.abs(M[r][c])>Math.abs(M[piv][c])) piv=r;
    [M[c],M[piv]]=[M[piv],M[c]]; const d=M[c][c]||1e-9;
    for(let k=0;k<4;k++) M[c][k]/=d;
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
  // rank violating rules by priority
  const viol=[];
  for(const [id,ok,msg] of RULES){ if(!ok(m)) viol.push([id,msg]); }
  // pick highest-priority violation that's been seen 2x in a row
  const now=Date.now();
  if(viol.length){
    const [id,msg]=viol[0];
    ruleStreak[id]=(ruleStreak[id]||0)+1;
    if(ruleStreak[id]>=2 && now-speakLock>9000){
      sayTip(msg); tip=msg; speakLock=now; lastCoaches.push(id);
    } else if(now-speakLock<=9000){ tip=msg; }
  } else {
    Object.keys(ruleStreak).forEach(k=>delete ruleStreak[k]);
    tip=Math.random()<0.4? "Nice — that looks clean! Keep it up.":tip;
  }
  // success reinforcement
  if(!viol.length && now-speakLock>9000){ sayTip('Nice shot — that form was clean!'); speakLock=now; }
  renderMetrics(m);
}

/* ---------- voice (Web Speech, on-device-ish) ---------- */
function sayTip(t){ try{ const u=new SpeechSynthesisUtterance(t); u.rate=1; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch(e){} }

/* ---------- render overlay ---------- */
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(curResults){
    const r=curResults;
    // skeleton lines
    const lines=[[11,13],[13,15],[11,23],[23,25],[25,27],[11,12],[12,14],[14,16]];
    ctx.strokeStyle='#0ea5a0'; ctx.lineWidth=3;
    ctx.beginPath();
    for(const[a,b]of lines) if(r[a]&&r[b]){ ctx.moveTo(r[a].x*canvas.width,r[a].y*canvas.height);
      ctx.lineTo(r[b].x*canvas.width,r[b].y*canvas.height); }
    ctx.stroke();
    // joints
    ctx.fillStyle='#fff'; [11,13,15,23,25,27].forEach(i=>{ if(r[i]){ctx.beginPath();
      ctx.arc(r[i].x*canvas.width,r[i].y*canvas.height,6,0,7); ctx.fill();}});
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
  const set=(id,v,ok)=> { const el=document.getElementById(id); el.textContent=v; el.className='mv '+col(ok); };
  set('m-ang', m.release_angle?Math.round(m.release_angle)+'°':'—', m.release_angle>=48&&m.release_angle<=55);
  set('m-elbow', m.elbow_set?Math.round(m.elbow_set)+'°':'—', m.elbow_set<=105&&m.elbow_set>=80);
  set('m-knee', m.knee_min?Math.round(m.knee_min)+'°':'—', m.knee_min<=135);
  set('m-hgt', m.rel_height?((m.rel_height*100).toFixed(0)+'%'):'—', m.rel_height>=0);
  set('m-aln', m.align_err?m.align_err.toFixed(2):'—', m.align_err<=0.15);
  set('m-fol', m.follow_through?'✓':'—', m.follow_through);
  setStatus('form analyzed · shot count ↑');
}

/* ---------- wire up ---------- */
document.getElementById('startBtn').onclick=start;
document.getElementById('toggleBtn').onclick=function(){ paused=!paused; this.textContent=paused?'▶ Resume':'⏸ Pause'; };
document.getElementById('resetBtn').onclick=function(){ ruleStreak={}; tip='Streaks reset. Keep shooting!'; document.getElementById('tip').textContent=tip; };

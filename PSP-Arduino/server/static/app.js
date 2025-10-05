(function(){
function clamp(x,min,max){return Math.max(min,Math.min(max,x));}
const FSR_COUNT = 8;
const POS_KEY = 'fsr_positions_v2_8chs';

let dumpingNow = false;
let autoRowsLastTriggered = 0;

function getRowsThreshold(){
  const v = parseInt(document.getElementById('dump-interval').value || '10', 10);
  return Math.max(1, v);
}

async function fetchLatest(){
  try{
    const r = await fetch('/api/latest?t='+Date.now());
    const d = await r.json();
    if(!d.ready){
      document.getElementById('status').textContent='Waiting for data…';
      return;
    }
    document.getElementById('timestamp').textContent=new Date(d.ts||d.ts).toLocaleString();
    const a = Array.isArray(d.fsr_pct)&&d.fsr_pct.length===FSR_COUNT?d.fsr_pct:Array(FSR_COUNT).fill(0);
    for(let i=0;i<FSR_COUNT;i++){
      const el = document.getElementById('fsr'+i);
      if(!el) continue;
      const v = clamp(Math.round(a[i]), 0, 100);
      const valEl = el.querySelector('.fsr-value') || el;
      valEl.textContent = String(v);
      setFSRVisual(el, v);
    }
    let vol=Number(d.volume);
    if(!Number.isFinite(vol)) vol=0;
    vol=clamp(Math.round(vol),0,100);
    document.getElementById('volume-bar').style.width=vol+'%';
    document.getElementById('volume-label').textContent=String(vol);
    document.getElementById('t1').textContent=(typeof d.t1_c==='number')?d.t1_c:'--';
    document.getElementById('t2').textContent=(typeof d.t2_c==='number')?d.t2_c:'--';
  }catch(e){
    document.getElementById('status').textContent='Disconnected…';
  }
}

function setFSRVisual(el, value){
  const v = clamp(Number(value)||0, 0, 100);
  const f = v / 100;
  const hue = 210;
  const sat = Math.round(50 + 40*f);
  const light = Math.round(22 + 38*f);
  el.style.backgroundColor = `hsl(${hue} ${sat}% ${light}%)`;
  el.style.borderColor = `hsl(${hue} ${sat}% ${Math.max(18, light-14)}%)`;
  el.style.boxShadow = f > 0
    ? `0 0 ${Math.round(10+10*f)}px rgba(91,155,243,${0.25+0.35*f})`
    : 'none';
}

function renderTempChart(items){
  const svg=document.getElementById('temp-chart'); if(!svg) return;
  svg.innerHTML='';
  if(!items||!Array.isArray(items)||items.length===0) return;

  const W=800,H=220,PAD=28,YMIN=0,YMAX=50;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);

  const data=items.slice(0,3600).reverse();
  const hasTS=data.some(it=>typeof it.ts==='number');
  const t0 = hasTS ? (data.find(it=>typeof it.ts==='number')||{}).ts : 0;
  const tNow = hasTS ? Date.now() : Math.max(1,data.length-1);

  const span = Math.max(1,(hasTS?tNow - t0:(data.length-1)));
  const xFor = (it,i)=> {
    const xval = hasTS ? (it.ts - t0) : i;
    return PAD + (xval/span)*(W-2*PAD);
  };
  const yFor = (v)=> {
    const vv = Math.max(YMIN,Math.min(YMAX,Number(v)));
    const h = H-2*PAD;
    return H-PAD - ((vv-YMIN)/(YMAX-YMIN))*h;
  };

  const gAxes=document.createElementNS('http://www.w3.org/2000/svg','g');
  const gData=document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(gAxes); svg.appendChild(gData);

  function line(x1,y1,x2,y2,stroke='#2a2f45',w=1){
    const el=document.createElementNS('http://www.w3.org/2000/svg','line');
    el.setAttribute('x1',x1); el.setAttribute('y1',y1);
    el.setAttribute('x2',x2); el.setAttribute('y2',y2);
    el.setAttribute('stroke',stroke); el.setAttribute('stroke-width',w);
    gAxes.appendChild(el);
  }
  function text(x,y,s,anchor='middle'){
    const t=document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x',x); t.setAttribute('y',y);
    t.setAttribute('fill','#aab3c5'); t.setAttribute('font-size','11');
    t.setAttribute('text-anchor',anchor); t.textContent=s;
    gAxes.appendChild(t);
  }
  function path(d,stroke){
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d); p.setAttribute('fill','none');
    p.setAttribute('stroke',stroke); p.setAttribute('stroke-width','2');
    gData.appendChild(p);
  }

  line(PAD,PAD,W-PAD,PAD);
  line(PAD,H-PAD,W-PAD,H-PAD);
  line(PAD,PAD,PAD,H-PAD);
  line(W-PAD,PAD,W-PAD,H-PAD);

  for(let v=YMIN; v<=YMAX; v+=10){
    const y=yFor(v);
    line(PAD,y,W-PAD,y);
    text(PAD-8,y+4,String(v),'end');
  }

  const tMid = hasTS ? t0 + (tNow - t0)/2 : (data.length-1)/2;
  const ticks = hasTS
    ? [{t:t0,label:'start'},{t:tMid,label:'mid'},{t:tNow,label:'now'}]
    : [{i:0,label:'start'},{i:tMid,label:'mid'},{i:data.length-1,label:'now'}];

  for(let i=0;i<ticks.length;i++){
    const tk=ticks[i];
    const x = hasTS ? (PAD + ((tk.t - t0)/span)*(W-2*PAD)) : (PAD + (tk.i/span)*(W-2*PAD));
    line(x,PAD,x,H-PAD);
    text(x,H-PAD+16,tk.label,'middle');
  }

  text(PAD-20,PAD-8,'°C','end');
  text(W/2,H-4,'time (start → now)','middle');

  const buildPath=(key,color)=>{
    let d='';
    for(let i=0;i<data.length;i++){
      const it=data[i]; const val=it[key];
      if(typeof val!=='number') continue;
      const X=xFor(it,i), Y=yFor(val);
      d += (d?`L${X},${Y}`:`M${X},${Y}`);
    }
    if(d) path(d,color);
  };

  buildPath('t1_c','#5b9bf3');
  buildPath('t2_c','#4caf50');
}

async function fetchHistoryAndRender(){
  try{
    const r=await fetch('/api/history?limit=3600&t='+Date.now());
    const d=await r.json();
    if(d&&Array.isArray(d.items)) renderTempChart(d.items);
  }catch(e){}
}

async function fetchStats(){
  try{
    const r=await fetch('/api/stats?t='+Date.now());
    const d=await r.json();
    const total=(typeof d.total==='number')?d.total:0;
    const last=d.last_ts?new Date(d.last_ts).toLocaleString():'n/a';
    document.getElementById('status').textContent=`Receiving data — rows: ${total} (last: ${last})`;
    const enabled = !!document.getElementById('dump-enabled').checked;
    if(enabled) maybeTriggerThresholdDump(total);
  }catch(e){
    document.getElementById('status').textContent='Disconnected…';
  }
}

async function clearDataUI(){
  const svg=document.getElementById('temp-chart'); if(svg) svg.innerHTML='';
  for(let i=0;i<FSR_COUNT;i++){
    const el = document.getElementById('fsr'+i);
    if(!el) continue;
    const valEl = el.querySelector('.fsr-value') || el;
    valEl.textContent = '0';
    setFSRVisual(el, 0);
  }
  document.getElementById('t1').textContent='--';
  document.getElementById('t2').textContent='--';
  document.getElementById('volume-bar').style.width='0%';
  document.getElementById('volume-label').textContent='0';
  try{ localStorage.clear(); }catch(e){}
}

async function clearData(){
  if(!confirm('This will delete ALL stored rows and local UI data. Continue?')) return;
  const res = await fetch('/api/clear',{method:'POST'});
  const data = await res.json();
  if(data.ok){
    await clearDataUI();
    alert(`Database cleared. Deleted ${data.deleted} rows.`);
    await fetchLatest(); await fetchHistoryAndRender(); await fetchStats(); await loadDumpStatus();
  }else{
    alert('Failed to clear data');
  }
}

function loadPositions(){
  try{ return JSON.parse(localStorage.getItem(POS_KEY))||{}; }catch(e){ return {}; }
}
function savePositions(p){ localStorage.setItem(POS_KEY, JSON.stringify(p)); }
function defaultPositions(area){
  const w=area.clientWidth,h=area.clientHeight,bw=90,bh=90;
  const positions={}; let idx=0;
  for(let r=0;r<2;r++){
    for(let c=0;c<4;c++){
      const id='fsr'+idx;
      positions[id]={x:((c+0.5)*(w/4)-bw/2)/w, y:((r+0.5)*(h/2)-bh/2)/h};
      idx++;
    }
  }
  return positions;
}
function applyPositions(){
  const area=document.getElementById('fsr-area'); if(!area) return;
  const boxes=area.querySelectorAll('.fsr-draggable');
  const w=area.clientWidth,h=area.clientHeight;
  const pos=Object.assign(defaultPositions(area), loadPositions());
  boxes.forEach(box=>{
    const id=box.id; const bw=box.offsetWidth,bh=box.offsetHeight;
    const p=pos[id]||{x:0.1,y:0.1};
    let left=Math.max(0,Math.min(p.x*w,w-bw));
    let top =Math.max(0,Math.min(p.y*h,h-bh));
    box.style.left=left+'px';
    box.style.top =top +'px';
  });
}
function initDraggables(){
  const area=document.getElementById('fsr-area'); if(!area) return;
  const pos=Object.assign(defaultPositions(area), loadPositions());
  let active=null,sx=0,sy=0,sl=0,st=0;
  function down(e){
    const t=e.target.closest('.fsr-draggable'); if(!t) return;
    active=t;
    const r=active.getBoundingClientRect(), ar=area.getBoundingClientRect();
    sx=e.clientX; sy=e.clientY; sl=r.left-ar.left; st=r.top-ar.top;
    active.setPointerCapture&&active.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e){
    if(!active) return;
    const ar=area.getBoundingClientRect(); const bw=active.offsetWidth,bh=active.offsetHeight;
    let left=sl+(e.clientX-sx); let top=st+(e.clientY-sy);
    left=Math.max(0,Math.min(left,ar.width -bw));
    top =Math.max(0,Math.min(top ,ar.height-bh));
    active.style.left=left+'px';
    active.style.top =top +'px';
  }
  function up(e){
    if(!active) return;
    const ar=area.getBoundingClientRect();
    const left=parseFloat(active.style.left)||0;
    const top =parseFloat(active.style.top )||0;
    const x=ar.width ? left/ar.width : 0;
    const y=ar.height? top /ar.height: 0;
    pos[active.id]={x,y}; savePositions(pos);
    active.releasePointerCapture&&active.releasePointerCapture(e.pointerId);
    active=null;
  }
  area.addEventListener('pointerdown',down);
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',up);
  window.addEventListener('resize',applyPositions);
  applyPositions();
}

async function loadDumpConfig(){
  try{
    const res=await fetch('/api/dump-config');
    const data=await res.json();
    document.getElementById('dump-enabled').checked=!!data.enabled;
    document.getElementById('dump-interval').value = data.interval_seconds || 10;
    document.getElementById('dump-path').value = data.path || 'PSP-Arduino/Data';
    document.getElementById('dump-info').textContent =
      `Repo: ${data.repo} | Branch: ${data.branch} | Token set: ${data.has_token ? 'yes' : 'no'}`;
  }catch(e){
    document.getElementById('dump-info').textContent='Unable to load dump config.';
  }
}

async function loadDumpStatus(){
  try{
    const res=await fetch('/api/dump-status?t='+Date.now());
    const data=await res.json();
    const last=data.last||{};
    const when=last.when?new Date(last.when).toLocaleString():'never';
    const ok=last.ok===true?'success':(last.ok===false?'failed':'n/a');
    const hint=last.message?` — ${last.message}`:'';
    const file=last.filename?` — ${last.filename}`:'';
    document.getElementById('dump-last').textContent=
      `Last attempt: ${when} (${last.type||'n/a'} → ${ok})${file}${hint}`;
  }catch(e){
    document.getElementById('dump-last').textContent='No dump status available.';
  }
}

async function saveDumpConfig(){
  const enabled=document.getElementById('dump-enabled').checked;
  const interval_seconds=Math.max(1,parseInt(document.getElementById('dump-interval').value||'10',10));
  const path=document.getElementById('dump-path').value.trim();
  await fetch('/api/dump-config',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({enabled,interval_seconds,path})
  });
  await loadDumpConfig();
}

async function dumpNow(opts={}){
  const silent = !!opts.silent;
  const btn=document.getElementById('dump-now');

  if(dumpingNow){
    if(!silent) alert('A dump is already in progress.');
    return;
  }
  dumpingNow = true;

  try{
    if(!silent && btn){ btn.disabled=true; btn.textContent='Dumping…'; }
    const res=await fetch('/api/dump-now',{method:'POST'});
    const data=await res.json().catch(()=>null);
    if(!res.ok){
      const msg=(data&&data.message)?data.message:`Server error (${res.status})`;
      if(!silent) alert('Dump failed: '+msg);
      console.warn('[clientDump] dump failed:', msg);
      return;
    }
    if(!silent){ await clearDataUI(); }
    await fetchLatest(); await fetchHistoryAndRender(); await fetchStats(); await loadDumpStatus();
    if(!silent){
      alert((data&&data.message)?data.message:'Dump completed.');
    }else{
      console.log('[clientDump] dump success:', (data&&data.message)?data.message:'ok');
    }
  }catch(err){
    if(!silent) alert('Dump failed: '+(err&&err.message?err.message:String(err)));
    console.warn('[clientDump] dump error:', err);
  }finally{
    if(!silent && btn){ btn.disabled=false; btn.textContent='Dump Now'; }
    dumpingNow = false;
  }
}

async function dumpDeleteAll(){
  console.log('[ui] dump-delete clicked');
  if(!confirm('Delete ALL JSON files in the configured GitHub path? This cannot be undone.')) return;
  const btn=document.getElementById('dump-delete');
  try{
    if(btn){ btn.disabled=true; btn.textContent='Deleting…'; }
    const res=await fetch('/api/dump-delete-all',{method:'POST'});
    const data=await res.json().catch(()=>null);
    if(!res.ok){
      const errs = (data && data.errors) ? '\n' + data.errors.map(e=>`- ${e.path}: ${e.error}`).join('\n') : '';
      const msg=(data&&data.message)?data.message:`Server error (${res.status})`;
      alert('Delete failed: '+msg+errs);
      return;
    }
    alert((data&&data.message)?data.message:'Delete completed.');
    await loadDumpStatus();
  }catch(err){
    alert('Delete failed: '+(err&&err.message?err.message:String(err)));
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='Delete Repo Data'; }
  }
}

function maybeTriggerThresholdDump(totalRows){
  const enabled = !!document.getElementById('dump-enabled').checked;
  if(!enabled) return;
  const threshold = getRowsThreshold();
  const now = Date.now();
  const cooldownOk = (now - autoRowsLastTriggered) > 5000;
  if(!dumpingNow && totalRows >= threshold && cooldownOk){
    autoRowsLastTriggered = now;
    const btn = document.getElementById('dump-now');
    if(btn){
      console.log(`[clientDump] threshold ${threshold} reached (rows=${totalRows}) → clicking Dump Now`);
      btn.dataset.autoclick = '1';
      btn.click();
    }else{
      dumpNow({silent:true});
    }
  }
}

function init(){
  const clearBtn = document.getElementById('clear-data');
  if (clearBtn) clearBtn.addEventListener('click', clearData);

  const dumpNowBtn = document.getElementById('dump-now');
  if (dumpNowBtn) dumpNowBtn.addEventListener('click', (e)=>{
    const silent = e.currentTarget.dataset.autoclick === '1';
    e.currentTarget.dataset.autoclick = '';
    dumpNow({silent});
  });

  const dumpSaveBtn = document.getElementById('dump-save');
  if (dumpSaveBtn) dumpSaveBtn.addEventListener('click', saveDumpConfig);

  const dumpDelBtn = document.getElementById('dump-delete');
  if (dumpDelBtn) dumpDelBtn.addEventListener('click', dumpDeleteAll);

  initDraggables();
  fetchLatest(); fetchHistoryAndRender(); fetchStats(); loadDumpConfig(); loadDumpStatus();

  setInterval(fetchLatest, 1000);
  setInterval(fetchHistoryAndRender, 5000);
  setInterval(fetchStats, 1000);
  setInterval(loadDumpStatus, 5000);
}

document.addEventListener('DOMContentLoaded', init);
})();

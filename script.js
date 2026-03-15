document.addEventListener('DOMContentLoaded', () => {

// ══════════════════════════════════════════
//   STATO
// ══════════════════════════════════════════
let token   = localStorage.getItem('ecotoken');
let curAct  = null;
let curS    = 1;
let isAdmin = false;
let myProfile = {};

const RATES = {
  Remoto:    { t:'h', co2:.5,  pts:10  },
  Treno:     { t:'k', co2:.04, pts:2   },
  Bici:      { t:'k', co2:0,   pts:5   },
  Bus:       { t:'k', co2:.08, pts:1.5 },
  Carpooling:{ t:'k', co2:.06, pts:3   },
  Videocall: { t:'h', co2:.1,  pts:8   }
};
const ICONS = { Remoto:'🏠', Treno:'🚂', Bici:'🚴', Bus:'🚌', Carpooling:'🚗', Videocall:'💻' };
const TABS  = {
  dashboard:   ['Dashboard',         'Il tuo impatto questa settimana'],
  log:         ['Log Attività',      'Registra le tue attività green'],
  challenges:  ['Sfide',             'Partecipa e crea sfide per il team'],
  leaderboard: ['Classifica',        'Come te la cavi nel team?'],
  social:      ['Social',            'Followers, gruppi e notifiche'],
  profile:     ['Il tuo Profilo',    'Personalizza il tuo Mii e il profilo'],
  yearly:      ['Riepilogo Annuale', 'Il tuo andamento nel 2026'],
  admin:       ['Admin Panel',       'Gestisci utenti e attività del team']
};

// ══════════════════════════════════════════
//   MII AVATAR
// ══════════════════════════════════════════
function drawMii(canvas, opts = {}) {
  const {
    color = '#16a34a', skin = '#fde68a',
    eyes = 'normal', mouth = 'smile', hair = 'none',
    size = canvas.width
  } = opts;
  const ctx = canvas.getContext('2d');
  const s   = size / 160;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // BG
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Collo
  ctx.fillStyle = skin;
  ctx.fillRect(68*s, 118*s, 24*s, 20*s);

  // Testa
  ctx.beginPath();
  ctx.ellipse(80*s, 86*s, 40*s, 44*s, 0, 0, Math.PI*2);
  ctx.fillStyle = skin;
  ctx.fill();

  // Orecchie
  ctx.beginPath(); ctx.ellipse(42*s, 88*s, 8*s, 10*s, 0, 0, Math.PI*2);
  ctx.fillStyle = skin; ctx.fill();
  ctx.beginPath(); ctx.ellipse(118*s, 88*s, 8*s, 10*s, 0, 0, Math.PI*2);
  ctx.fillStyle = skin; ctx.fill();

  // Capelli
  if (hair === 'short') {
    ctx.beginPath();
    ctx.ellipse(80*s, 60*s, 42*s, 26*s, 0, Math.PI, Math.PI*2);
    ctx.fillStyle = '#78350f'; ctx.fill();
    ctx.fillRect(38*s, 60*s, 84*s, 16*s);
    ctx.fillStyle = '#78350f';
  } else if (hair === 'long') {
    ctx.beginPath();
    ctx.ellipse(80*s, 58*s, 42*s, 26*s, 0, Math.PI, Math.PI*2);
    ctx.fillStyle = '#78350f'; ctx.fill();
    ctx.fillRect(38*s, 60*s, 12*s, 50*s);
    ctx.fillRect(110*s, 60*s, 12*s, 50*s);
    ctx.fillStyle = '#78350f';
  } else if (hair === 'curly') {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc((48 + i*12)*s, 52*s, 9*s, 0, Math.PI*2);
      ctx.fillStyle = '#78350f'; ctx.fill();
    }
    ctx.fillRect(38*s, 52*s, 84*s, 14*s);
    ctx.fillStyle = '#78350f';
  }

  // Sopracciglia
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3*s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(56*s,72*s); ctx.lineTo(70*s,70*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(90*s,70*s); ctx.lineTo(104*s,72*s); ctx.stroke();

  // Occhi
  if (eyes === 'cool') {
    // Occhiali
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(53*s, 76*s, 22*s, 12*s);
    ctx.fillRect(85*s, 76*s, 22*s, 12*s);
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2*s;
    ctx.beginPath(); ctx.moveTo(75*s,82*s); ctx.lineTo(85*s,82*s); ctx.stroke();
    // Pupille
    ctx.fillStyle = 'white';
    ctx.fillRect(55*s, 78*s, 18*s, 8*s);
    ctx.fillRect(87*s, 78*s, 18*s, 8*s);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(60*s, 79*s, 6*s, 6*s);
    ctx.fillRect(92*s, 79*s, 6*s, 6*s);
  } else if (eyes === 'happy') {
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3*s;
    ctx.beginPath(); ctx.arc(64*s, 82*s, 7*s, Math.PI, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(96*s, 82*s, 7*s, Math.PI, Math.PI*2); ctx.stroke();
  } else if (eyes === 'wink') {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(64*s, 82*s, 7*s, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(66*s, 80*s, 2.5*s, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3*s;
    ctx.beginPath(); ctx.moveTo(90*s,82*s); ctx.lineTo(102*s,80*s); ctx.stroke();
  } else {
    // Normal
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(64*s, 82*s, 7*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(96*s, 82*s, 7*s, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(66*s, 80*s, 2.5*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(98*s, 80*s, 2.5*s, 0, Math.PI*2); ctx.fill();
  }

  // Naso
  ctx.fillStyle = skin === '#fde68a' ? '#f59e0b' : '#b45309';
  ctx.beginPath(); ctx.arc(80*s, 94*s, 4*s, 0, Math.PI*2); ctx.fill();

  // Bocca
  ctx.strokeStyle = '#991b1b'; ctx.lineWidth = 3*s; ctx.lineCap = 'round';
  if (mouth === 'big') {
    ctx.beginPath(); ctx.arc(80*s, 104*s, 12*s, 0, Math.PI);
    ctx.fillStyle = '#991b1b'; ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath(); ctx.arc(80*s, 104*s, 8*s, 0.1, Math.PI-0.1); ctx.fill();
  } else if (mouth === 'serious') {
    ctx.beginPath(); ctx.moveTo(68*s,106*s); ctx.lineTo(92*s,106*s); ctx.stroke();
  } else if (mouth === 'tongue') {
    ctx.beginPath(); ctx.arc(80*s, 104*s, 10*s, 0, Math.PI);
    ctx.fillStyle = '#991b1b'; ctx.fill();
    ctx.fillStyle = '#f87171';
    ctx.beginPath(); ctx.ellipse(80*s, 112*s, 6*s, 5*s, 0, 0, Math.PI*2); ctx.fill();
  } else {
    // smile
    ctx.beginPath(); ctx.arc(80*s, 100*s, 10*s, 0.2, Math.PI-0.2); ctx.stroke();
  }
}

function drawMiniMii(canvas, opts = {}) {
  drawMii(canvas, { ...opts, size: canvas.width });
}

function setAv(key, val) {
  myProfile[key] = val;
  // Aggiorna active state swatches/btns
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.mii-opt-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`[onclick*="${val}"]`).forEach(el => el.classList.add('active'));
  renderMii();
}

function renderMii() {
  const c = document.getElementById('miiCanvas');
  if (!c) return;
  drawMii(c, {
    color: myProfile.avatar_color || '#16a34a',
    skin:  myProfile.avatar_skin  || '#fde68a',
    eyes:  myProfile.avatar_eyes  || 'normal',
    mouth: myProfile.avatar_mouth || 'smile',
    hair:  myProfile.avatar_hair  || 'none'
  });
  // Update sidebar canvas
  const sbC = document.getElementById('sbAvCanvas');
  if (sbC) drawMiniMii(sbC, {
    color: myProfile.avatar_color || '#16a34a',
    skin:  myProfile.avatar_skin  || '#fde68a',
    eyes:  myProfile.avatar_eyes  || 'normal',
    mouth: myProfile.avatar_mouth || 'smile',
    hair:  myProfile.avatar_hair  || 'none'
  });
}

function miiCanvasHTML(opts, size = 40) {
  const id = 'mii_' + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const c = document.getElementById(id);
    if (c) drawMiniMii(c, opts);
  }, 0);
  return `<canvas id="${id}" width="${size}" height="${size}" style="border-radius:${size/4}px;border:2px solid var(--green-mid)"></canvas>`;
}

window.setAv = setAv;

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
function openTut() { document.getElementById('tut').style.display = 'flex'; goS(1); }
function skipTut() { document.getElementById('tut').style.display = 'none'; localStorage.setItem('tutDone','1'); }
function goS(n) {
  curS = n;
  document.querySelectorAll('.tut-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`[data-s="${n}"]`).classList.add('active');
  document.querySelectorAll('.tut-dot').forEach((d,i) => d.classList.toggle('active', i===n-1));
  const prev = document.getElementById('tPrev');
  const next = document.getElementById('tNext');
  prev.style.opacity = n===1 ? '0':'1';
  prev.style.pointerEvents = n===1 ? 'none':'auto';
  next.textContent = n===4 ? '🚀 Inizia!' : 'Avanti →';
}
function nextS() { if (curS===4) { skipTut(); return; } goS(curS+1); }
function prevS() { if (curS>1) goS(curS-1); }
window.openTut=openTut; window.skipTut=skipTut; window.goS=goS; window.nextS=nextS; window.prevS=prevS;

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
function switchAuth(t) {
  document.getElementById('fLogin').style.display = t==='login'    ? 'flex':'none';
  document.getElementById('fReg').style.display   = t==='register' ? 'flex':'none';
  document.getElementById('tLogin').classList.toggle('active', t==='login');
  document.getElementById('tReg').classList.toggle('active',   t==='register');
}
function toggleEye(id) { const e=document.getElementById(id); e.type=e.type==='password'?'text':'password'; }
function chkPw() {
  const v = document.getElementById('rPw').value;
  const s = (id,ok) => document.getElementById(id).classList.toggle('ok',ok);
  s('h1',v.length>=8); s('h2',/[A-Z]/.test(v)); s('h3',/\d/.test(v)); s('h4',/[!@#$%^&*]/.test(v));
}
async function doLogin() {
  const eEl=document.getElementById('lEmail'), pEl=document.getElementById('lPw');
  if (!eEl||!pEl) return;
  const e=eEl.value.trim(), p=pEl.value;
  if (!e||!p) return setErr('lErr','Compila tutti i campi');
  const btn=document.querySelector('#fLogin .btn-auth');
  setLoading(btn,true,'Login');
  const d=await post('/api/login',{email:e,password:p});
  setLoading(btn,false,'Login');
  if (d.error) return setErr('lErr',d.error);
  token=d.token; localStorage.setItem('ecotoken',token);
  enterApp(d.user);
}
async function doReg() {
  const n=document.getElementById('rName').value.trim();
  const u=document.getElementById('rUsername').value.trim();
  const e=document.getElementById('rEmail').value.trim();
  const p=document.getElementById('rPw').value;
  if (!n||!u||!e||!p) return setErr('rErr','Compila tutti i campi');
  const btn=document.querySelector('#fReg .btn-auth');
  setLoading(btn,true,'Register');
  const d=await post('/api/register',{name:n,username:u,email:e,password:p});
  setLoading(btn,false,'Register');
  if (d.error) return setErr('rErr',d.error);
  token=d.token; localStorage.setItem('ecotoken',token);
  enterApp(d.user);
}
function setErr(id,msg) {
  const e=document.getElementById(id); if (!e) return;
  e.textContent=msg; e.style.animation='none';
  requestAnimationFrame(()=>{ e.style.animation='shake .4s ease'; });
  setTimeout(()=>e.textContent='',4000);
}
function setLoading(btn,loading,label) {
  if (!btn) return;
  btn.disabled=loading; btn.style.opacity=loading?'.7':'1';
  const span=btn.querySelector('span');
  if (span) span.textContent=loading?'Caricamento...':label;
}
function logout() { localStorage.removeItem('ecotoken'); location.reload(); }
function enterApp(u) {
  document.getElementById('authWrap').style.display='none';
  document.getElementById('app').style.display='flex';
  if (window.innerWidth<=768) document.getElementById('mobNav').style.display='flex';
  document.getElementById('sbEmail').textContent=u.email||'';
  initAdmin(u);
  loadAll();
  loadProfile();
  loadNotifCount();
  if (!localStorage.getItem('tutDone')) openTut();
}
window.switchAuth=switchAuth; window.toggleEye=toggleEye; window.chkPw=chkPw;
window.doLogin=doLogin; window.doReg=doReg; window.logout=logout;

// ══════════════════════════════════════════
//   ADMIN INIT
// ══════════════════════════════════════════
function initAdmin(u) {
  isAdmin=!!u.is_admin;
  const nameEl=document.getElementById('sbName');
  nameEl.innerHTML=(u.name||u.username||u.email)+(isAdmin?' <span class="admin-badge">👑</span>':'');
  document.getElementById('adminSbBtn').style.display =isAdmin?'flex':'none';
  document.getElementById('adminMobBtn').style.display=isAdmin?'flex':'none';
}

// ══════════════════════════════════════════
//   API
// ══════════════════════════════════════════
async function api(url,method='GET',body=null) {
  try {
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:body?JSON.stringify(body):null});
    return res.json();
  } catch(err) { showN('❌ Errore di rete','error'); return {error:err.message}; }
}
async function post(url,body) {
  try {
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return res.json();
  } catch(err) { showN('❌ Errore di rete','error'); return {error:err.message}; }
}

// ══════════════════════════════════════════
//   LOAD ALL
// ══════════════════════════════════════════
function loadAll() { loadStats(); loadActs(); loadBadges(); loadLb(); loadYearly(); loadCh(); }

// ══════════════════════════════════════════
//   PROFILO
// ══════════════════════════════════════════
async function loadProfile() {
  const d=await api('/api/profile'); if (!d||d.error) return;
  myProfile=d;
  document.getElementById('pName').value    =d.name||'';
  document.getElementById('pUsername').value=d.username||'';
  document.getElementById('pBio').value     =d.bio||'';
  document.getElementById('pFollowers').textContent=d.followers||0;
  document.getElementById('pFollowing').textContent=d.following||0;
  document.getElementById('pPoints2').textContent  =d.points||0;
  renderMii();
  // Aggiorna active state
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll(`[onclick*="${d.avatar_color}"]`).forEach(el=>el.classList.add('active'));
}

async function saveProfile() {
  const d=await api('/api/profile','PATCH',{
    name:         document.getElementById('pName').value,
    username:     document.getElementById('pUsername').value,
    bio:          document.getElementById('pBio').value,
    avatar_color: myProfile.avatar_color||'#16a34a',
    avatar_eyes:  myProfile.avatar_eyes ||'normal',
    avatar_mouth: myProfile.avatar_mouth||'smile',
    avatar_hair:  myProfile.avatar_hair ||'none',
    avatar_skin:  myProfile.avatar_skin ||'#fde68a'
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Profilo salvato!','success');
  const nameEl=document.getElementById('sbName');
  nameEl.innerHTML=(d.user.name||d.user.username)+(isAdmin?' <span class="admin-badge">👑</span>':'');
  renderMii();
}

window.saveProfile=saveProfile;

// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
async function loadStats() {
  const d=await api('/api/stats'); if (!d||d.error) return;
  anim('sCO2', parseFloat(d.co2_week||0),      1);
  anim('sPts', parseInt(d.points||0),           0);
  anim('sActs',parseInt(d.total_activities||0), 0);
}
function anim(id,target,dec) {
  const el=document.getElementById(id); if (!el) return;
  const dur=900, t0=performance.now();
  const upd=now=>{ const p=Math.min((now-t0)/dur,1),e=1-Math.pow(1-p,4); el.textContent=(e*target).toFixed(dec); if(p<1) requestAnimationFrame(upd); };
  requestAnimationFrame(upd);
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
function selAct(type,btn) {
  curAct=type;
  document.querySelectorAll('.at-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  const r=RATES[type], form=document.getElementById('logForm');
  form.style.display='block';
  document.getElementById('logTitle').textContent=`${ICONS[type]} Stai registrando: ${type}`;
  document.getElementById('kmRow').style.display=r.t==='k'?'block':'none';
  document.getElementById('hrRow').style.display=r.t==='h'?'block':'none';
  document.getElementById('cpRow').style.display=type==='Carpooling'?'block':'none';
  ['iKm','iHr','iNote','iCp'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  updPreview();
  form.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function updPreview() {
  if (!curAct) return;
  const r=RATES[curAct];
  const km=parseFloat(document.getElementById('iKm').value)||0;
  const hr=parseFloat(document.getElementById('iHr').value)||0;
  const val=r.t==='k'?km:hr;
  document.getElementById('pCO2').textContent=(val*r.co2).toFixed(2);
  document.getElementById('pPts').textContent=Math.round(val*r.pts);
}
function cancelAct() {
  const form=document.getElementById('logForm');
  form.style.opacity='0'; form.style.transform='translateY(-8px)';
  setTimeout(()=>{ form.style.display='none'; form.style.opacity=''; form.style.transform=''; },200);
  document.querySelectorAll('.at-btn').forEach(b=>b.classList.remove('sel'));
  curAct=null;
}
async function saveAct() {
  const km=parseFloat(document.getElementById('iKm').value)||0;
  const hr=parseFloat(document.getElementById('iHr').value)||0;
  const note=document.getElementById('iNote').value;
  const cpEl=document.getElementById('iCp');
  const cp=cpEl?cpEl.value:'';
  const r=RATES[curAct];
  if (r.t==='k'&&km===0) return showN('⚠️ Inserisci i km!','error');
  if (r.t==='h'&&hr===0) return showN('⚠️ Inserisci le ore!','error');
  const btn=document.querySelector('#logForm .btn-save');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>Salvataggio...'; }
  const d=await api('/api/activity','POST',{type:curAct,km,hours:hr,note,carsharing_with:cp});
  if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i>Salva'; }
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ +${d.points} punti! 🌱 ${d.co2_saved}kg CO₂ salvata`,'success');
  cancelAct(); loadAll();
}
function actHTML(acts) {
  if (!acts||!acts.length) return `<div class="empty"><div class="ei">🌱</div><p>Nessuna attività ancora.<br>Inizia a tracciare il tuo impatto!</p></div>`;
  return acts.map((a,i)=>`
    <div class="act-item" style="animation:fadeSlide .3s ease ${i*.05}s both">
      <div class="act-icon-wrap">${ICONS[a.type]||'📌'}</div>
      <div class="act-detail">
        <div class="act-name">${a.type}</div>
        <div class="act-sub">${[a.km>0?a.km+' km':'',a.hours>0?a.hours+' ore':'',a.note||''].filter(Boolean).join(' · ')}</div>
        <div class="act-sub">${new Date(a.date).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})}</div>
      </div>
      <div class="act-tags">
        <span class="tag tag-g">-${a.co2_saved} kg</span>
        <span class="tag tag-y">+${a.points} pt</span>
      </div>
    </div>`).join('');
}
async function loadActs() {
  const acts=await api('/api/activities');
  const html=actHTML(!acts||acts.error?[]:acts);
  document.getElementById('recentActs').innerHTML=html;
  document.getElementById('allActs').innerHTML=html;
}
window.selAct=selAct; window.updPreview=updPreview; window.cancelAct=cancelAct; window.saveAct=saveAct;

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
async function loadBadges() {
  const bs=await api('/api/badges'); if (!bs||bs.error) return;
  document.getElementById('sBadges').textContent=bs.filter(b=>b.unlocked).length;
  document.getElementById('badgeList').innerHTML=bs.map((b,i)=>`
    <div class="badge-item ${b.unlocked?'on':'off'}" style="animation:fadeSlide .3s ease ${i*.07}s both">
      <div class="badge-icon">${b.icon}</div>
      <div><div class="badge-name">${b.name}</div><div class="badge-desc">${b.desc}</div></div>
    </div>`).join('');
}

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
function togCh() {
  const f=document.getElementById('chForm'), visible=f.style.display!=='none';
  if (visible) { f.style.opacity='0'; f.style.transform='translateY(-6px)'; setTimeout(()=>{ f.style.display='none'; f.style.opacity=''; f.style.transform=''; },200); }
  else f.style.display='block';
}
async function createCh() {
  const title=document.getElementById('cTitle').value.trim();
  const target=parseFloat(document.getElementById('cTarget').value);
  const points=parseInt(document.getElementById('cPoints').value);
  const date=document.getElementById('cDate').value;
  if (!title||!target||!points||!date) return showN('⚠️ Compila tutti i campi!','error');
  const d=await api('/api/challenges','POST',{title,description:document.getElementById('cDesc').value,co2_target:target,points_reward:points,end_date:date,is_public:document.getElementById('cPub').checked});
  if (d.error) return showN('❌ '+d.error,'error');
  showN('🚀 Sfida creata!','success'); togCh(); loadCh();
}
async function loadCh() {
  const list=await api('/api/challenges');
  document.getElementById('chList').innerHTML=!list||list.error||list.length===0
    ?`<div class="empty"><div class="ei">🔥</div><p>Nessuna sfida ancora.</p></div>`
    :list.map((c,i)=>`
      <div class="ch-item" style="animation:fadeSlide .3s ease ${i*.06}s both">
        <div class="ch-ico">🚀</div>
        <div class="ch-info">
          <h4>${c.title} ${c.is_public?'🌍':'🔒'}</h4>
          <p>${c.description||''}</p>
          <div class="ch-tags">
            <span class="ch-tag">🎯 ${c.co2_target} kg</span>
            <span class="ch-tag">🏆 ${c.points_reward} pt</span>
            <span class="ch-tag">📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>
          </div>
        </div>
      </div>`).join('');
}
window.togCh=togCh; window.createCh=createCh;

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLb() {
  const b=await api('/api/leaderboard'); if (!b||b.error) return;
  document.getElementById('lbList').innerHTML=b.map((u,i)=>`
    <div class="lb-row ${i===0?'r1':i===1?'r2':i===2?'r3':''}" style="animation:fadeSlide .3s ease ${i*.06}s both">
      <span class="lb-rank">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</span>
      <div class="lb-av">${miiCanvasHTML({color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a'},40)}</div>
      <div class="lb-name">
        <div class="lb-uname">${u.name||u.email}</div>
        ${u.username?`<div class="lb-username">@${u.username}</div>`:''}
      </div>
      <span class="lb-co2">${parseFloat(u.co2_saved||0).toFixed(1)} kg</span>
      <span class="lb-pts">${u.points||0} pt</span>
    </div>`).join('');
}

// ══════════════════════════════════════════
//   YEARLY
// ══════════════════════════════════════════
async function loadYearly() {
  const data=await api('/api/yearly'); if (!data||data.error) return;
  const max=Math.max(...data.map(d=>parseFloat(d.co2)||0),1);
  document.getElementById('yrList').innerHTML=data.length===0
    ?`<div class="empty"><div class="ei">📅</div><p>Nessun dato per quest'anno ancora.</p></div>`
    :data.map((m,i)=>`
      <div class="yr-row" style="animation:fadeSlide .3s ease ${i*.05}s both">
        <span class="yr-month">${m.month}</span>
        <div class="yr-bar"><div class="yr-fill" style="width:${Math.round(parseFloat(m.co2)/max*100)}%"></div></div>
        <span class="yr-co2">${parseFloat(m.co2).toFixed(1)} kg</span>
        <span class="yr-pts">${m.points} pt</span>
      </div>`).join('');
}

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
async function loadSocial() {
  loadNotifications();
  loadFollowers();
  loadFollowing();
  loadGroups();
}

// Notifiche
async function loadNotifications() {
  const notifs=await api('/api/notifications');
  document.getElementById('notifList').innerHTML=!notifs||notifs.error||notifs.length===0
    ?`<div class="empty"><div class="ei">🔔</div><p>Nessuna notifica ancora.</p></div>`
    :notifs.map((n,i)=>`
      <div class="notif-item ${n.is_read?'':'unread'}" style="animation:fadeSlide .25s ease ${i*.04}s both">
        <div class="notif-item-icon ni-${n.type}">
          ${{follow:'👤',warn:'⚠️',ban:'⛔',unban:'✅',carsharing:'🚗'}[n.type]||'📢'}
        </div>
        <div class="notif-item-body">
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>`).join('');
}

async function markAllRead() {
  await api('/api/notifications/read','PATCH');
  loadNotifications(); loadNotifCount();
}

async function loadNotifCount() {
  const notifs=await api('/api/notifications');
  if (!notifs||notifs.error) return;
  const unread=notifs.filter(n=>!n.is_read).length;
  const dot=document.getElementById('notifDot');
  const count=document.getElementById('notifCount');
  if (dot) dot.style.display=unread>0?'block':'none';
  if (count) { count.style.display=unread>0?'flex':'none'; count.textContent=unread; }
}

function timeAgo(date) {
  const s=Math.floor((Date.now()-new Date(date))/1000);
  if (s<60) return 'Adesso';
  if (s<3600) return Math.floor(s/60)+' min fa';
  if (s<86400) return Math.floor(s/3600)+' ore fa';
  return Math.floor(s/86400)+' giorni fa';
}

// Cerca utenti
let searchTimer;
function searchUsers() {
  clearTimeout(searchTimer);
  const q=document.getElementById('searchUser').value.trim();
  if (!q) { document.getElementById('searchResults').innerHTML=''; return; }
  searchTimer=setTimeout(async()=>{
    const r=await api(`/api/user/${q}`);
    document.getElementById('searchResults').innerHTML=r.error
      ?`<div class="empty" style="padding:20px"><div class="ei" style="font-size:32px">🔍</div><p>Utente non trovato.</p></div>`
      :userCardHTML(r);
  },400);
}

function userCardHTML(u) {
  return `
    <div class="user-card" id="uc-${u.id}">
      <div class="uc-av">${miiCanvasHTML({color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a'},44)}</div>
      <div class="uc-info">
        <div class="uc-name">${u.name||u.username}</div>
        <div class="uc-username">@${u.username||'—'}</div>
        <div class="uc-pts">⭐ ${u.points||0} pt</div>
      </div>
      <button class="btn-follow ${u.isFollowing?'following':''}" id="fbtn-${u.id}"
        onclick="toggleFollow(${u.id}, ${u.isFollowing})">
        ${u.isFollowing?'✓ Seguito':'+ Segui'}
      </button>
    </div>`;
}

async function toggleFollow(userId, isFollowing) {
  if (isFollowing) {
    await api(`/api/follow/${userId}`,'DELETE');
  } else {
    await api(`/api/follow/${userId}`,'POST');
  }
  const btn=document.getElementById(`fbtn-${userId}`);
  if (btn) {
    const now=!isFollowing;
    btn.textContent=now?'✓ Seguito':'+ Segui';
    btn.classList.toggle('following',now);
    btn.onclick=()=>toggleFollow(userId,now);
  }
  loadFollowers(); loadFollowing();
}

async function loadFollowers() {
  const list=await api('/api/followers');
  document.getElementById('followersList').innerHTML=!list||list.error||list.length===0
    ?`<div class="empty"><div class="ei">👤</div><p>Nessun follower ancora.</p></div>`
    :list.map(u=>`
      <div class="user-card">
        <div class="uc-av">${miiCanvasHTML({color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a'},44)}</div>
        <div class="uc-info">
          <div class="uc-name">${u.name||u.username}</div>
          <div class="uc-username">@${u.username||'—'}</div>
        </div>
      </div>`).join('');
}

async function loadFollowing() {
  const list=await api('/api/following');
  document.getElementById('followingList').innerHTML=!list||list.error||list.length===0
    ?`<div class="empty"><div class="ei">👥</div><p>Non segui ancora nessuno.</p></div>`
    :list.map(u=>`
      <div class="user-card">
        <div class="uc-av">${miiCanvasHTML({color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a'},44)}</div>
        <div class="uc-info">
          <div class="uc-name">${u.name||u.username}</div>
          <div class="uc-username">@${u.username||'—'}</div>
        </div>
        <button class="btn-follow following" onclick="toggleFollow(${u.id},true)">✓ Seguito</button>
      </div>`).join('');
}

// Gruppi
function togGroupForm() {
  const f=document.getElementById('groupForm'), visible=f.style.display!=='none';
  if (visible) { f.style.opacity='0'; setTimeout(()=>{ f.style.display='none'; f.style.opacity='1'; },200); }
  else f.style.display='block';
}
async function createGroup() {
  const name=document.getElementById('gName').value.trim();
  if (!name) return showN('⚠️ Nome obbligatorio!','error');
  const d=await api('/api/groups','POST',{name,description:document.getElementById('gDesc').value,is_public:document.getElementById('gPublic').checked});
  if (d.error) return showN('❌ '+d.error,'error');
  showN('👥 Gruppo creato!','success'); togGroupForm(); loadGroups();
}
async function loadGroups() {
  const list=await api('/api/groups');
  document.getElementById('groupsList').innerHTML=!list||list.error||list.length===0
    ?`<div class="empty"><div class="ei">👥</div><p>Nessun gruppo ancora.</p></div>`
    :list.map((g,i)=>`
      <div class="group-card" style="animation:fadeSlide .3s ease ${i*.05}s both">
        <div class="group-icon">👥</div>
        <div class="group-info">
          <div class="group-name">${g.name} ${g.is_public?'🌍':'🔒'}</div>
          <div class="group-desc">${g.description||''}</div>
          <div class="group-meta">👤 ${g.member_count} membri · creato da ${g.owner_name}</div>
        </div>
        <button class="btn-join ${g.is_member?'leave':''}" id="gbtn-${g.id}"
          onclick="toggleGroup(${g.id},${g.is_member})">
          ${g.is_member?'Esci':'Unisciti'}
        </button>
      </div>`).join('');
}
async function toggleGroup(groupId, isMember) {
  if (isMember) await api(`/api/groups/${groupId}/leave`,'DELETE');
  else          await api(`/api/groups/${groupId}/join`,'POST');
  loadGroups();
}

window.searchUsers=searchUsers; window.toggleFollow=toggleFollow;
window.togGroupForm=togGroupForm; window.createGroup=createGroup; window.toggleGroup=toggleGroup;
window.markAllRead=markAllRead;

// ══════════════════════════════════════════
//   TABS
// ══════════════════════════════════════════
function goTab(tab,btn) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.sb-btn,.mn-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const [t,s]=TABS[tab]||['',''];
  document.getElementById('pageTitle').textContent=t;
  document.getElementById('pageSub').textContent=s;
  if (tab==='admin')   loadAdminUsers();
  if (tab==='social')  loadSocial();
  if (tab==='profile') loadProfile();
  window.scrollTo({top:0,behavior:'smooth'});
}
window.goTab=goTab;

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdminUsers() {
  const users=await api('/api/admin/users');
  if (!users||users.error) return showN('❌ '+(users?.error||'Errore'),'error');
  const totalCo2=users.reduce((s,u)=>s+parseFloat(u.co2_saved||0),0);
  const totalActs=users.reduce((s,u)=>s+parseInt(u.activity_count||0),0);
  const admins=users.filter(u=>u.is_admin).length;
  const banned=users.filter(u=>u.is_banned).length;

  document.getElementById('adminStats').innerHTML=`
    <div class="stat-card sc-blue" style="margin:0">
      <div class="stat-top"><div class="stat-icon"><i class="fas fa-users"></i></div><span class="stat-badge">totale</span></div>
      <div class="stat-val">${users.length}</div>
      <div class="stat-lbl">${admins} admin · ${banned} bannati</div>
      <div class="stat-glow g-blue"></div>
    </div>
    <div class="stat-card sc-green" style="margin:0">
      <div class="stat-top"><div class="stat-icon"><i class="fas fa-cloud"></i></div><span class="stat-badge">team</span></div>
      <div class="stat-val">${totalCo2.toFixed(1)}</div>
      <div class="stat-lbl">kg CO₂ totali</div>
      <div class="stat-glow g-green"></div>
    </div>
    <div class="stat-card sc-yellow" style="margin:0">
      <div class="stat-top"><div class="stat-icon"><i class="fas fa-tasks"></i></div><span class="stat-badge">totali</span></div>
      <div class="stat-val">${totalActs}</div>
      <div class="stat-lbl">Attività team</div>
      <div class="stat-glow g-yellow"></div>
    </div>`;

  document.getElementById('adminTbody').innerHTML=users.length===0
    ?`<tr><td colspan="6"><div class="empty"><div class="ei">👥</div><p>Nessun utente.</p></div></td></tr>`
    :users.map((u,i)=>`
      <tr style="animation:fadeSlide .25s ease ${i*.04}s both">
        <td>
          <div class="u-info">
            <div class="u-av">${miiCanvasHTML({color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a'},36)}</div>
            <div>
              <div class="u-name">${u.name||'—'}</div>
              <div class="u-email">${u.username?'@'+u.username+' · ':''} ${u.email}</div>
            </div>
          </div>
        </td>
        <td style="font-weight:700">${u.activity_count}</td>
        <td><span class="pill pill-yellow">⭐ ${u.points}</span></td>
        <td><span class="pill pill-green">🌱 ${parseFloat(u.co2_saved||0).toFixed(1)} kg</span></td>
        <td>
          ${u.is_admin?'<span class="pill pill-yellow">👑 Admin</span>':
            u.is_banned?`<span class="pill pill-red">⛔ Bannato</span>`
                       :'<span class="pill pill-gray">👤 User</span>'}
        </td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <button class="btn-icon" title="Vedi attività" onclick="openActsModal(${u.id},'${esc(u.name||u.email)}')"><i class="fas fa-list"></i></button>
            <button class="btn-icon warn" title="Invia avviso" onclick="openWarnModal(${u.id})"><i class="fas fa-exclamation-triangle"></i></button>
            ${u.is_banned
              ?`<button class="btn-icon" title="Rimuovi ban" onclick="unbanUser(${u.id},'${esc(u.name||u.email)}')"><i class="fas fa-unlock"></i></button>`
              :`<button class="btn-icon ban" title="Banna utente" onclick="openBanModal(${u.id})"><i class="fas fa-ban"></i></button>`}
            <button class="btn-icon reset" title="Azzera punti" onclick="resetPoints(${u.id},'${esc(u.name||u.email)}')"><i class="fas fa-undo"></i></button>
            <button class="btn-icon crown" title="${u.is_admin?'Rimuovi admin':'Promuovi admin'}" onclick="toggleAdmin(${u.id},${!u.is_admin},'${esc(u.name||u.email)}')"><i class="fas fa-crown"></i></button>
            <button class="btn-icon del" title="Elimina utente" onclick="deleteUser(${u.id},'${esc(u.name||u.email)}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
}

function esc(str) { return (str||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

// BAN
let banTargetId=null;
function openBanModal(userId) {
  banTargetId=userId;
  document.getElementById('banDays').value='';
  document.getElementById('banReason').value='';
  document.getElementById('banModal').style.display='flex';
  document.getElementById('banConfirmBtn').onclick=async()=>{
    const days=parseInt(document.getElementById('banDays').value)||null;
    const reason=document.getElementById('banReason').value;
    const d=await api(`/api/admin/user/${banTargetId}/ban`,'POST',{days,reason});
    document.getElementById('banModal').style.display='none';
        if (d.error) return showN('❌ '+d.error,'error');
    showN('⛔ Utente bannato!','success');
    loadAdminUsers();
  };
}

// WARN
let warnTargetId=null;
function openWarnModal(userId) {
  warnTargetId=userId;
  document.getElementById('warnMsg').value='';
  document.getElementById('warnModal').style.display='flex';
  document.getElementById('warnConfirmBtn').onclick=async()=>{
    const message=document.getElementById('warnMsg').value.trim();
    if (!message) return showN('⚠️ Inserisci un messaggio!','error');
    const d=await api(`/api/admin/user/${warnTargetId}/warn`,'POST',{message});
    document.getElementById('warnModal').style.display='none';
    if (d.error) return showN('❌ '+d.error,'error');
    showN('⚠️ Avviso inviato!','info');
    loadAdminUsers();
  };
}

// UNBAN
function unbanUser(userId, name) {
  showConfirm('✅','Rimuovi ban','Vuoi rimuovere il ban a '+name+'?', async()=>{
    const d=await api(`/api/admin/user/${userId}/unban`,'POST');
    if (d.error) return showN('❌ '+d.error,'error');
    showN('✅ Ban rimosso!','success');
    loadAdminUsers();
  }, 'linear-gradient(135deg,var(--green),var(--green2))');
}

// RESET PUNTI
function resetPoints(userId, name) {
  showConfirm('🔄','Azzera punti','Vuoi azzerare i punti di '+name+'?', async()=>{
    const d=await api(`/api/admin/user/${userId}/reset-points`,'POST');
    if (d.error) return showN('❌ '+d.error,'error');
    showN('🔄 Punti azzerati!','info');
    loadAdminUsers();
  }, 'linear-gradient(135deg,var(--blue),var(--blue2))');
}

// TOGGLE ADMIN
function toggleAdmin(userId, makeAdmin, name) {
  showConfirm(
    makeAdmin?'👑':'👤',
    makeAdmin?'Promuovi ad Admin':'Rimuovi Admin',
    makeAdmin?`Vuoi promuovere ${name} ad Admin?`:`Vuoi rimuovere i privilegi admin a ${name}?`,
    async()=>{
      const d=await api(`/api/admin/user/${userId}/role`,'PATCH',{is_admin:makeAdmin});
      if (d.error) return showN('❌ '+d.error,'error');
      showN(makeAdmin?'👑 Admin aggiunto!':'👤 Admin rimosso!','success');
      loadAdminUsers();
    },
    makeAdmin?'linear-gradient(135deg,var(--yellow),var(--yellow2))':'linear-gradient(135deg,var(--muted),var(--muted2))'
  );
}

// DELETE USER
function deleteUser(userId, name) {
  showConfirm('🗑️','Elimina Utente',`Sei sicuro di voler eliminare ${name}? L'azione è irreversibile!`, async()=>{
    const d=await api(`/api/admin/user/${userId}`,'DELETE');
    if (d.error) return showN('❌ '+d.error,'error');
    showN('🗑️ Utente eliminato!','success');
    loadAdminUsers();
  });
}

// ATTIVITÀ MODAL
async function openActsModal(userId, name) {
  document.getElementById('actsModalTitle').textContent='Attività di '+name;
  document.getElementById('actsModal').style.display='flex';
  const acts=await api(`/api/admin/activities/${userId}`);
  document.getElementById('actsModalBody').innerHTML=!acts||acts.error||acts.length===0
    ?`<div class="empty"><div class="ei">📋</div><p>Nessuna attività.</p></div>`
    :acts.map(a=>`
      <div class="adm-act-item">
        <div style="font-size:22px">${ICONS[a.type]||'📌'}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${a.type}</div>
          <div style="font-size:12px;color:var(--muted)">${a.km>0?a.km+' km':''}${a.hours>0?a.hours+' ore':''} · ${a.co2_saved} kg · ${a.points} pt</div>
          <div style="font-size:11px;color:var(--muted2)">${new Date(a.date).toLocaleDateString('it-IT')}</div>
        </div>
        <button class="adm-act-del" onclick="delActAdmin(${a.id})" title="Elimina"><i class="fas fa-trash"></i></button>
      </div>`).join('');
}

async function delActAdmin(actId) {
  const d=await api(`/api/admin/activity/${actId}`,'DELETE');
  if (d.error) return showN('❌ '+d.error,'error');
  showN('🗑️ Attività eliminata!','success');
  // Ricarica modal con stesso userId
  loadAdminUsers();
  // Ricarica body modal
  const body=document.getElementById('actsModalBody');
  const del=body.querySelector(`[onclick="delActAdmin(${actId})"]`);
  if (del) del.closest('.adm-act-item').remove();
}

function closeActsModal(e) {
  if (e.target.id==='actsModal') document.getElementById('actsModal').style.display='none';
}

window.openBanModal=openBanModal; window.openWarnModal=openWarnModal;
window.unbanUser=unbanUser; window.resetPoints=resetPoints;
window.toggleAdmin=toggleAdmin; window.deleteUser=deleteUser;
window.openActsModal=openActsModal; window.delActAdmin=delActAdmin;
window.closeActsModal=closeActsModal; window.loadAdminUsers=loadAdminUsers;

// ══════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════
let confirmCb=null;
function showConfirm(icon, title, msg, cb, btnStyle=null) {
  document.getElementById('confirmIcon').textContent=icon;
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').textContent=msg;
  const yes=document.getElementById('confirmYes');
  if (btnStyle) yes.style.background=btnStyle;
  else yes.style.background='linear-gradient(135deg,var(--red),#dc2626)';
  confirmCb=cb;
  document.getElementById('confirmModal').style.display='flex';
}
function closeConfirm() { document.getElementById('confirmModal').style.display='none'; confirmCb=null; }
document.getElementById('confirmYes').onclick=async()=>{ closeConfirm(); if(confirmCb) await confirmCb(); };
window.closeConfirm=closeConfirm;

// ══════════════════════════════════════════
//   TOAST
// ══════════════════════════════════════════
let notifTimer;
function showN(msg, type='success') {
  const el=document.getElementById('notif');
  el.textContent=msg; el.className=`notif ${type}`;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer=setTimeout(()=>el.classList.remove('show'),3500);
}

// ══════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════
if (token) {
  api('/api/profile').then(d=>{
    if (d&&!d.error) {
      document.getElementById('authWrap').style.display='none';
      document.getElementById('app').style.display='flex';
      if (window.innerWidth<=768) document.getElementById('mobNav').style.display='flex';
      document.getElementById('sbEmail').textContent=d.email||'';
      initAdmin(d);
      loadAll();
      loadProfile();
      loadNotifCount();
    } else {
      localStorage.removeItem('ecotoken');
      token=null;
    }
  });
}

// Aggiorna notifiche ogni 30 sec
setInterval(loadNotifCount, 30000);

}); // END DOMContentLoaded
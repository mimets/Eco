'use strict';
document.addEventListener('DOMContentLoaded', () => {

// ══════════════════════════════════════════
//   CONFIG & STATE
// ══════════════════════════════════════════
const API = '';
let token      = localStorage.getItem('ecotoken') || null;
let myProfile  = null;
let curAct     = null;
let calcedKm   = 0;
let map        = null;
let markerFrom = null;
let markerTo   = null;
let routeLine  = null;
let mapInited  = false;
let mapSat     = false;
let tileLayer  = null;
let geocodeTimer  = null;
let searchTimer   = null;
let shopData   = { items:[], owned:[], points:0 };
let tutStep    = 0;
let following  = [];   // cache follower per inviti

const RATES = {
  Remoto:     { t:'h', co2:.5,  pts:10  },
  Treno:      { t:'k', co2:.04, pts:2   },
  Bici:       { t:'k', co2:0,   pts:5   },
  Bus:        { t:'k', co2:.08, pts:1.5 },
  Carpooling: { t:'k', co2:.06, pts:3   },
  Videocall:  { t:'h', co2:.1,  pts:8   }
};

const ICONS = {
  Remoto:'🏠', Treno:'🚂', Bici:'🚴',
  Bus:'🚌', Carpooling:'🚗', Videocall:'💻'
};

const OSRM_PROFILE = {
  Bici:'bike', Treno:'driving',
  Bus:'driving', Carpooling:'driving'
};

const CO2_MILESTONES = [10,50,100,250,500,1000];

// ══════════════════════════════════════════
//   API HELPER
// ══════════════════════════════════════════
async function api(url, method='GET', body=null) {
  try {
    const opts = {
      method,
      headers:{
        'Content-Type':'application/json',
        ...(token ? { Authorization:`Bearer ${token}` } : {})
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const r   = await fetch(API+url, opts);
    const txt = await r.text();
    if (!txt) return {};
    try { return JSON.parse(txt); }
    catch { return { error:txt }; }
  } catch(e) {
    console.error('API error:', url, e);
    return { error:e.message };
  }
}

// ══════════════════════════════════════════
//   TOAST
// ══════════════════════════════════════════
let toastTimer = null;
function showN(msg, type='success') {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg;
  el.className   = `notif ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ══════════════════════════════════════════
//   CO2 EXPLOSION
// ══════════════════════════════════════════
function showCo2Explosion(co2, pts) {
  const el = document.getElementById('co2Explosion');
  if (!el) return;
  document.getElementById('co2ExpKg').textContent  = `+${co2} kg`;
  document.getElementById('co2ExpPts').textContent = `+${pts} punti ⭐`;
  el.style.display = 'flex';
  setTimeout(() => { el.style.display='none'; }, 2800);
}

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display    = tab==='login'    ? 'flex':'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'flex':'none';
  document.getElementById('lErr').textContent='';
  document.getElementById('rErr').textContent='';
}
window.switchTab=switchTab;

function togglePwd(id,btn) {
  const el=document.getElementById(id);
  if (!el) return;
  const show=el.type==='password';
  el.type=show?'text':'password';
  btn.innerHTML=`<i class="fas fa-eye${show?'-slash':''}"></i>`;
}
window.togglePwd=togglePwd;

function checkPwd(val) {
  [
    { id:'ph1', ok:val.length>=8 },
    { id:'ph2', ok:/[A-Z]/.test(val) },
    { id:'ph3', ok:/[0-9]/.test(val) },
    { id:'ph4', ok:/[^A-Za-z0-9]/.test(val) }
  ].forEach(r=>document.getElementById(r.id)?.classList.toggle('ok',r.ok));
}
window.checkPwd=checkPwd;

// ✅ LOGIN con username O email
async function doLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('lIdentifier').value.trim();
  const pwd        = document.getElementById('lPwd').value;
  const err        = document.getElementById('lErr');
  const btn        = e.target.querySelector('.btn-auth');
  if (!identifier||!pwd) { err.textContent='Compila tutti i campi'; return; }
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i><span>Accesso...</span>';
  btn.disabled=true;
  const d=await api('/api/login','POST',{ identifier, password:pwd });
  btn.innerHTML='<i class="fas fa-sign-in-alt"></i><span>Accedi</span>';
  btn.disabled=false;
  if (d.error) {
    err.innerHTML=d.needsVerify
      ? `${d.error} <button class="resend-btn" onclick="resendVerify()">Reinvia email</button>`
      : d.error;
    document.getElementById('lPwd').classList.add('shake');
    setTimeout(()=>document.getElementById('lPwd').classList.remove('shake'),600);
    return;
  }
  token=d.token;
  localStorage.setItem('ecotoken',token);
  bootApp(d.user);
}
window.doLogin=doLogin;

// ✅ REGISTRAZIONE con feedback email
async function doRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('rName').value.trim();
  const username = document.getElementById('rUsername').value.trim();
  const email    = document.getElementById('rEmail').value.trim();
  const pwd      = document.getElementById('rPwd').value;
  const err      = document.getElementById('rErr');
  const btn      = e.target.querySelector('.btn-auth');
  if (!name||!username||!email||!pwd) { err.textContent='Compila tutti i campi'; return; }
  if (pwd.length<8) { err.textContent='Password troppo corta'; return; }
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i><span>Registrazione...</span>';
  btn.disabled=true;
  const d=await api('/api/register','POST',{ name,username,email,password:pwd });
  btn.innerHTML='<i class="fas fa-user-plus"></i><span>Registrati</span>';
  btn.disabled=false;
  if (d.error) { err.textContent=d.error; return; }

  // ✅ Se serve verifica email
  if (d.needsVerify) {
    showVerifyScreen(email);
    return;
  }

  token=d.token;
  localStorage.setItem('ecotoken',token);
  bootApp(d.user);
  setTimeout(()=>showTutorial(),500);
}
window.doRegister=doRegister;

// ✅ Schermata "controlla email"
function showVerifyScreen(email) {
  const authWrap=document.getElementById('authWrap');
  if (!authWrap) return;
  authWrap.innerHTML=`
    <div class="auth-card verify-card">
      <div class="verify-icon">📧</div>
      <h2 class="verify-title">Controlla la tua email!</h2>
      <p class="verify-sub">
        Abbiamo inviato un link di conferma a<br>
        <strong>${email}</strong>
      </p>
      <p class="verify-hint">
        Clicca il link nell'email per attivare il tuo account.<br>
        Poi torna qui e accedi normalmente.
      </p>
      <div class="verify-actions">
        <button class="btn-auth" onclick="resendVerifyTo('${email}')">
          <i class="fas fa-redo"></i><span>Reinvia email</span>
        </button>
        <button class="btn-auth btn-secondary" onclick="location.reload()">
          <i class="fas fa-sign-in-alt"></i><span>Vai al login</span>
        </button>
      </div>
      <p class="verify-spam">
        Non trovi l'email? Controlla la cartella spam 📂
      </p>
    </div>`;
}
window.showVerifyScreen=showVerifyScreen;

// ✅ Reinvia email verifica
async function resendVerify() {
  const identifier=document.getElementById('lIdentifier')?.value?.trim();
  if (!identifier) return showN('❌ Inserisci la tua email','error');
  const emailGuess=identifier.includes('@')?identifier:'';
  if (!emailGuess) return showN('❌ Inserisci la tua email per il reinvio','error');
  await resendVerifyTo(emailGuess);
}
window.resendVerify=resendVerify;

async function resendVerifyTo(email) {
  const d=await api('/api/resend-verify','POST',{ email });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('📧 Email inviata! Controlla la casella.','success');
}
window.resendVerifyTo=resendVerifyTo;

function doLogout(e) {
  e?.stopPropagation();
  token=null;
  localStorage.removeItem('ecotoken');
  myProfile=null; mapInited=false; map=null;
  document.getElementById('authWrap').style.display='flex';
  document.getElementById('app').style.display='none';
  showN('👋 Arrivederci!','info');
}
window.doLogout=doLogout;

// ══════════════════════════════════════════
//   BOOT
// ══════════════════════════════════════════
function bootApp(user) {
  document.getElementById('authWrap').style.display='none';
  document.getElementById('app').style.display='flex';
  myProfile=user;
  if (window.innerWidth<=768)
    document.getElementById('mobNav').style.display='flex';
  if (user.is_admin) {
    document.getElementById('adminNavBtn').style.display='block';
    document.getElementById('sbAdminBadge').style.display='inline-flex';
  }
  document.getElementById('sbEmail').textContent=user.email||'';
  showTab('dashboard',null);
  loadAll();
}

async function loadAll() {
  await Promise.all([
    loadProfile(), loadStats(), loadActivities(),
    loadBadges(), loadYearly(), loadNotifications()
  ]);
}

// ══════════════════════════════════════════
//   TABS
// ══════════════════════════════════════════
const TAB_TITLES = {
  dashboard:   ['Dashboard',   'Bentornato! 🌱'],
  log:         ['Log Attività','Registra le tue azioni eco 🌍'],
  shop:        ['Shop Avatar', 'Sblocca pezzi con i tuoi punti 🛍️'],
  challenges:  ['Sfide',       'Completa obiettivi e vinci punti 🏆'],
  leaderboard: ['Classifica',  'Chi salva più CO₂? 🌍'],
  social:      ['Community',   'Segui amici e crea gruppi 👥'],
  notifiche:   ['Notifiche',   'I tuoi aggiornamenti 🔔'],
  profile:     ['Profilo',     'Il tuo account e avatar 👤'],
  admin:       ['Admin Panel', 'Gestione piattaforma 👑'],
};

function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.querySelectorAll('.sb-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.mn-btn').forEach(b=>b.classList.remove('active'));
  if (btn?.classList.contains('mn-btn')) btn.classList.add('active');
  const [title,sub]=TAB_TITLES[name]||[name,''];
  document.getElementById('topTitle').textContent=title;
  document.getElementById('topSub').textContent=sub;
  if (name==='leaderboard') loadLeaderboard();
  if (name==='challenges')  loadChallenges();
  if (name==='social')      { loadFollowers(); loadFollowing(); loadGroups(); }
  if (name==='notifiche')   loadNotificationsPage();
  if (name==='admin')       loadAdminUsers();
  if (name==='shop')        loadShop();
  if (name==='log') {
    setTimeout(()=>{
      if (!mapInited&&curAct&&['Treno','Bici','Bus','Carpooling'].includes(curAct)) initMap();
    },100);
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
window.showTab = showTab;

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
function showTutorial() { tutStep=0; document.getElementById('tutOverlay').style.display='flex'; updateTutStep(); }
function closeTut()     { document.getElementById('tutOverlay').style.display='none'; }
function tutNav(dir) {
  const max=4;
  tutStep=Math.max(0,Math.min(max+1,tutStep+dir));
  if (tutStep>max){closeTut();return;}
  updateTutStep();
  const nb=document.querySelector('.tut-next');
  const pb=document.querySelector('.tut-prev');
  if (nb) nb.textContent=tutStep===max?'Inizia! 🚀':'Avanti →';
  if (pb) { pb.style.opacity=tutStep===0?'0':'1'; pb.style.pointerEvents=tutStep===0?'none':'auto'; }
}
function goTut(n) { tutStep=n; updateTutStep(); }
function updateTutStep() {
  document.querySelectorAll('.tut-step').forEach((s,i)=>s.classList.toggle('active',i===tutStep));
  document.querySelectorAll('.tut-dot').forEach((d,i)=>d.classList.toggle('active',i===tutStep));
}
window.showTutorial=showTutorial; window.closeTut=closeTut;
window.tutNav=tutNav; window.goTut=goTut;

// ══════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════
async function loadProfile() {
  const d = await api('/api/profile');
  if (d.error) return;
  myProfile = d;
  document.getElementById('pName').value     = d.name||'';
  document.getElementById('pUsername').value = d.username||'';
  document.getElementById('pBio').value      = d.bio||'';
  const sbName = document.getElementById('sbName');
  if (sbName) sbName.childNodes[0].textContent=(d.name||d.email)+' ';
  document.getElementById('sbEmail').textContent='@'+(d.username||d.email);
  document.getElementById('topCo2').textContent=parseFloat(d.co2_saved||0).toFixed(1);
  document.getElementById('topPts').textContent=Math.round(d.points||0);
  updateSidebarCo2(d.co2_saved||0);
  const ps=document.getElementById('profileStats');
  if (ps) ps.innerHTML=`
    <div class="ps-item"><div class="ps-val">${Math.round(d.points||0)}</div><div class="ps-lbl">Punti</div></div>
    <div class="ps-item"><div class="ps-val">${parseFloat(d.co2_saved||0).toFixed(1)}</div><div class="ps-lbl">kg CO₂</div></div>
    <div class="ps-item"><div class="ps-val">${d.followers||0}</div><div class="ps-lbl">Follower</div></div>`;
  miiState={
    color:d.avatar_color||'#16a34a', skin:d.avatar_skin||'#fde68a',
    eyes:d.avatar_eyes||'normal',    mouth:d.avatar_mouth||'smile',
    hair:d.avatar_hair||'none',      ownedItems:d.owned_items||[]
  };
  renderMiiBuilder();
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
}

function updateSidebarCo2(co2) {
  const val=parseFloat(co2)||0;
  const next=CO2_MILESTONES.find(m=>m>val)||CO2_MILESTONES[CO2_MILESTONES.length-1];
  const prev=CO2_MILESTONES.filter(m=>m<=val).pop()||0;
  const pct=Math.min(100,((val-prev)/(next-prev))*100);
  document.getElementById('sbCo2Fill')?.style.setProperty('width',pct+'%');
  const lbl=document.getElementById('sbCo2Val');
  if (lbl) lbl.textContent=val.toFixed(1)+' kg';
  const nxt=document.getElementById('sbCo2Next');
  if (nxt) nxt.textContent=val<CO2_MILESTONES[CO2_MILESTONES.length-1]
    ?`Prossimo badge: ${next} kg`:'🏆 Tutti i badge sbloccati!';
}

async function saveProfile() {
  // ✅ Leggi stato avatar aggiornato
  const payload = {
    name:         document.getElementById('pName').value.trim(),
    username:     document.getElementById('pUsername').value.trim(),
    bio:          document.getElementById('pBio').value.trim(),
    avatar_color: miiState.color  || '#16a34a',
    avatar_eyes:  miiState.eyes   || 'normal',
    avatar_mouth: miiState.mouth  || 'smile',
    avatar_hair:  miiState.hair   || 'none',
    avatar_skin:  miiState.skin   || '#fde68a'
  };

  if (!payload.name)     return showN('❌ Il nome è obbligatorio','error');
  if (!payload.username) return showN('❌ Lo username è obbligatorio','error');

  const btn=document.getElementById('saveProfileBtn');
  if (btn){ btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvataggio...'; }

  const d=await api('/api/profile','PATCH',payload);

  if (btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Salva Profilo'; }

  if (d.error) return showN('❌ '+d.error,'error');

  // ✅ Aggiorna miiState con i dati salvati
  miiState.color = d.avatar_color || miiState.color;
  miiState.eyes  = d.avatar_eyes  || miiState.eyes;
  miiState.mouth = d.avatar_mouth || miiState.mouth;
  miiState.hair  = d.avatar_hair  || miiState.hair;
  miiState.skin  = d.avatar_skin  || miiState.skin;

  // ✅ Ridisegna avatar ovunque
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();

  showN('✅ Profilo e avatar salvati!');
  await loadProfile();
}
window.saveProfile=saveProfile;


// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
async function loadStats() {
  const d=await api('/api/stats');
  if (d.error) return;
  const co2Total=parseFloat(d.co2_total||0);
  const co2Week=parseFloat(d.co2_week||0);
  const co2Month=parseFloat(d.co2_month||0);
  const heroVal=document.getElementById('heroCo2');
  if (heroVal) heroVal.textContent=co2Total.toFixed(1);
  const trees=Math.round(co2Total/21);
  const heroSub=document.getElementById('heroCo2Sub');
  if (heroSub) heroSub.textContent=co2Total>0
    ?`Equivale a ${trees} alber${trees===1?'o':'i'} piantati 🌳`
    :'Inizia a tracciare le tue azioni eco!';
  const next=CO2_MILESTONES.find(m=>m>co2Total)||CO2_MILESTONES[CO2_MILESTONES.length-1];
  const prev=CO2_MILESTONES.filter(m=>m<=co2Total).pop()||0;
  const pct=Math.min(100,((co2Total-prev)/(next-prev))*100);
  const fill=document.getElementById('heroCo2Fill');
  if (fill) setTimeout(()=>fill.style.width=pct+'%',100);
  const tgt=document.getElementById('heroCo2Target');
  if (tgt) tgt.textContent=`/ ${next} kg`;
  if (document.getElementById('heroCo2Week'))  document.getElementById('heroCo2Week').textContent=co2Week.toFixed(2);
  if (document.getElementById('heroCo2Month')) document.getElementById('heroCo2Month').textContent=co2Month.toFixed(2);
  const planet=document.getElementById('co2Planet');
  if (planet) {
    if      (co2Total>=500) planet.textContent='🌳';
    else if (co2Total>=100) planet.textContent='🌎';
    else if (co2Total>=50)  planet.textContent='🌍';
    else if (co2Total>=10)  planet.textContent='🌱';
    else                    planet.textContent='🌍';
  }
  if (document.getElementById('sPts'))  document.getElementById('sPts').textContent=Math.round(d.points||0);
  if (document.getElementById('sWeek')) document.getElementById('sWeek').textContent=co2Week.toFixed(2);
  if (document.getElementById('sActs')) document.getElementById('sActs').textContent=d.total_activities||0;
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
async function loadActivities() {
  const list=await api('/api/activities');
  if (!Array.isArray(list)) return;
  const ra=document.getElementById('recentActs');
  if (ra) ra.innerHTML=list.length
    ?list.slice(0,5).map(a=>actHTML(a)).join('')
    :`<div class="empty"><div class="ei">🌱</div><p>Nessuna attività ancora.</p></div>`;
  const aa=document.getElementById('allActs');
  if (aa) aa.innerHTML=list.length
    ?list.map(a=>actHTML(a)).join('')
    :`<div class="empty"><div class="ei">📋</div><p>Nessuna attività registrata.</p></div>`;
}

function actHTML(a) {
  const d=new Date(a.date);
  const dStr=d.toLocaleDateString('it-IT',{day:'2-digit',month:'short'})+' '+
             d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  const sub=a.km>0
    ?`${a.from_addr||''} ${a.to_addr?'→ '+a.to_addr:''} · ${a.km} km`.trim()
    :a.hours>0?`${a.hours}h`:'';
  return `
    <div class="act-item">
      <div class="act-icon-wrap">${ICONS[a.type]||'📌'}</div>
      <div class="act-detail">
        <div class="act-name">${a.type}</div>
        <div class="act-sub">${sub}${a.note?' · '+a.note:''} · ${dStr}</div>
      </div>
      <div class="act-tags">
        <span class="tag tag-g">🌍 ${parseFloat(a.co2_saved).toFixed(2)} kg</span>
        <span class="tag tag-y">⭐ ${a.points}</span>
      </div>
    </div>`;
}

// ══════════════════════════════════════════
//   BADGES / YEARLY / LEADERBOARD
// ══════════════════════════════════════════
async function loadBadges() {
  const list=await api('/api/badges');
  if (!Array.isArray(list)) return;
  const el=document.getElementById('badgeList');
  if (!el) return;
  el.innerHTML=list.map(b=>`
    <div class="badge-item ${b.unlocked?'on':'off'}">
      <div class="badge-icon">${b.icon}</div>
      <div><div class="badge-name">${b.name}</div><div class="badge-desc">${b.desc}</div></div>
    </div>`).join('');
}

async function loadYearly() {
  const list=await api('/api/yearly');
  const el=document.getElementById('yearlyChart');
  if (!el||!Array.isArray(list)) return;
  if (!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">📊</div><p>Nessun dato annuale.</p></div>`;
    return;
  }
  const max=Math.max(...list.map(r=>parseFloat(r.co2)));
  el.innerHTML=list.map(r=>{
    const co2=parseFloat(r.co2);
    const pct=max>0?(co2/max)*100:0;
    return `
      <div class="yr-row">
        <div class="yr-month">${r.month}</div>
        <div class="yr-bar"><div class="yr-fill" style="width:0" data-w="${pct}"></div></div>
        <div class="yr-co2">${co2.toFixed(1)} kg</div>
        <div class="yr-pts">⭐ ${Math.round(r.points)}</div>
      </div>`;
  }).join('');
  setTimeout(()=>el.querySelectorAll('.yr-fill').forEach(f=>f.style.width=f.dataset.w+'%'),80);
}

async function loadLeaderboard() {
  const list=await api('/api/leaderboard');
  const el=document.getElementById('lbList');
  if (!el||!Array.isArray(list)) return;
  if (!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">🏆</div><p>Nessun dato.</p></div>`;
    return;
  }
  const medals=['🥇','🥈','🥉'];
  el.innerHTML=list.map((u,i)=>`
    <div class="lb-row ${i<3?'r'+(i+1):''}">
      <div class="lb-rank">${medals[i]||'#'+(i+1)}</div>
      <div class="lb-av"><canvas width="40" height="40" id="lbAv${u.id}"></canvas></div>
      <div class="lb-name">
        <div class="lb-uname">${u.name||'Utente'}</div>
        <div class="lb-username">@${u.username||'—'}</div>
      </div>
      <div class="lb-co2">🌍 ${parseFloat(u.co2_saved).toFixed(1)} kg CO₂</div>
      <div class="lb-pts">⭐ ${Math.round(u.points)} pt</div>
    </div>`).join('');
  setTimeout(()=>list.forEach(u=>drawMii(u,`lbAv${u.id}`,40)),60);
}

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
async function loadChallenges() {
  const list=await api('/api/challenges');
  const el=document.getElementById('chList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">🏆</div><p>Nessuna sfida. Creane una!</p></div>`;
    return;
  }
  el.innerHTML=list.map(c=>`
    <div class="ch-item">
      <div class="ch-ico">🏆</div>
      <div class="ch-info">
        <h4>${c.title}</h4>
        <p>${c.description||'Nessuna descrizione.'}</p>
        <div class="ch-tags">
          ${c.co2_target>0    ?`<span class="ch-tag">🌍 ${c.co2_target} kg CO₂</span>`:''}
          ${c.points_reward>0 ?`<span class="ch-tag">⭐ ${c.points_reward} pt</span>`:''}
          ${c.end_date        ?`<span class="ch-tag">📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>`:''}
          ${c.is_public       ?`<span class="ch-tag">🌐 Pubblica</span>`:''}
          ${c.creator_name    ?`<span class="ch-tag">👤 ${c.creator_name}</span>`:''}
        </div>
      </div>
    </div>`).join('');
}

function toggleChForm() {
  const f=document.getElementById('chForm');
  f.style.display=f.style.display==='none'?'block':'none';
}
window.toggleChForm=toggleChForm;

async function saveChallenge() {
  const title=document.getElementById('chTitle').value.trim();
  if (!title) return showN('❌ Inserisci un titolo','error');
  const d=await api('/api/challenges','POST',{
    title,
    description:document.getElementById('chDesc').value,
    co2_target:parseFloat(document.getElementById('chCo2').value)||0,
    points_reward:parseInt(document.getElementById('chPts').value)||0,
    end_date:document.getElementById('chDate').value||null,
    is_public:document.getElementById('chPublic').checked
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Sfida creata!');
  document.getElementById('chForm').style.display='none';
  ['chTitle','chDesc','chCo2','chPts','chDate'].forEach(id=>{
    const el=document.getElementById(id); if (el) el.value='';
  });
  loadChallenges();
}
window.saveChallenge=saveChallenge;

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
async function loadNotifications() {
  const list=await api('/api/notifications');
  if (!Array.isArray(list)) return;
  const unread=list.filter(n=>!n.is_read).length;
  const dot=document.getElementById('sbNotifDot');
  const count=document.getElementById('notifCount');
  if (dot)   dot.style.display=unread>0?'block':'none';
  if (count) { count.style.display=unread>0?'flex':'none'; count.textContent=unread>9?'9+':unread; }
}

async function loadNotificationsPage() {
  const list=await api('/api/notifications');
  const el=document.getElementById('notifList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">🔔</div><p>Nessuna notifica.</p></div>`;
    return;
  }
  const typeIcon={ follow:'👥',warn:'⚠️',ban:'⛔',unban:'✅',shop:'🛍️',badge:'🏅',group_invite:'📨' };
  el.innerHTML=list.map(n=>{
    const isInvite = n.type==='group_invite';
    const code     = isInvite ? n.message.match(/Codice: ([A-Z0-9]+)/)?.[1] : null;
    return `
      <div class="notif-item ${n.is_read?'':'unread'}">
        <div class="notif-item-icon ni-${n.type}">${typeIcon[n.type]||'🔔'}</div>
        <div style="flex:1">
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${new Date(n.created_at).toLocaleString('it-IT')}</div>
          ${isInvite&&code ? `
            <button class="btn-join" style="margin-top:8px;font-size:12px"
              onclick="joinByCode('${code}')">
              <i class="fas fa-users"></i> Unisciti al gruppo
            </button>` : ''}
        </div>
      </div>`;
  }).join('');
  await api('/api/notifications/read','PATCH');
  loadNotifications();
}

async function joinByCode(code) {
  const d=await api(`/api/groups/join/${code}`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ Sei entrato nel gruppo "${d.group?.name}"!`);
  loadGroups();
  showTab('social',null);
}
window.joinByCode=joinByCode;

async function markAllRead() {
  await api('/api/notifications/read','PATCH');
  loadNotificationsPage();
  loadNotifications();
  showN('✅ Tutte lette','info');
}
window.markAllRead=markAllRead;
// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
async function loadShop() {
  const d = await api('/api/shop');
  if (d.error) return showN('❌ '+d.error,'error');
  shopData = d;
  renderShop('all');
  const pts = document.getElementById('shopPts');
  if (pts) pts.textContent = Math.round(d.points||0)+' pt';
}

function filterShop(cat, btn) {
  document.querySelectorAll('.shop-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderShop(cat);
}
window.filterShop = filterShop;

function renderShop(cat) {
  const el = document.getElementById('shopGrid');
  if (!el) return;
  const items = cat==='all'
    ? shopData.items
    : shopData.items.filter(i=>i.category===cat);
  if (!items.length) {
    el.innerHTML=`<div class="empty"><div class="ei">🛍️</div><p>Nessun item in questa categoria.</p></div>`;
    return;
  }
  const catLabel = { hair:'Capelli', eyes:'Occhi', mouth:'Bocca', color:'Colore', skin:'Pelle' };
  const grouped  = {};
  items.forEach(i=>{ if (!grouped[i.category]) grouped[i.category]=[]; grouped[i.category].push(i); });
  el.innerHTML = Object.entries(grouped).map(([c,list])=>`
    <div class="shop-section">
      <h3 class="shop-section-title">${catLabel[c]||c}</h3>
      <div class="shop-items-grid">
        ${list.map(item=>{
          const owned   = shopData.owned.includes(item.id);
          const canBuy  = shopData.points>=item.cost && !owned;
          const pctNeed = owned?100:Math.min(100,Math.round((shopData.points/item.cost)*100));
          return `
            <div class="shop-item ${owned?'owned':''} ${item.is_rare?'rare':''}">
              ${item.is_rare?'<div class="rare-badge">⭐ RARO</div>':''}
              <div class="shop-item-preview" onclick="previewItem('${item.category}','${item.value}')">
                <span style="font-size:32px">${item.emoji}</span>
              </div>
              <div class="shop-item-name">${item.name}</div>
              <div class="shop-item-desc">${item.description}</div>
              <div class="shop-progress">
                <div class="shop-progress-fill" style="width:${pctNeed}%"></div>
              </div>
              <div class="shop-item-cost">
                ${owned
                  ? `<span class="owned-badge">✅ Posseduto</span>`
                  : `<span class="cost-badge ${canBuy?'can':'cant'}">⭐ ${item.cost}</span>`}
              </div>
              ${!owned ? `
                <button class="shop-buy-btn ${canBuy?'':'disabled'}"
                  onclick="buyItem(${item.id})" ${canBuy?'':'disabled'}>
                  ${canBuy
                    ? '<i class="fas fa-shopping-cart"></i> Acquista'
                    : `<i class="fas fa-lock"></i> Servono ${item.cost - Math.round(shopData.points||0)} pt`}
                </button>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function previewItem(cat, val) {
  if (!myProfile) return;
  const preview = { ...miiState };
  if      (cat==='hair')  preview.hair  = val;
  else if (cat==='eyes')  preview.eyes  = val;
  else if (cat==='mouth') preview.mouth = val;
  else if (cat==='color') preview.color = val;
  else if (cat==='skin')  preview.skin  = val;
  drawMii(preview,'shopPreviewCanvas',80);
  const el = document.getElementById('shopPreview');
  if (el) el.style.display='flex';
}
window.previewItem = previewItem;

function closeShopPreview() {
  const el=document.getElementById('shopPreview');
  if (el) el.style.display='none';
}
window.closeShopPreview = closeShopPreview;

async function buyItem(itemId) {
  const item = shopData.items.find(i=>i.id===itemId);
  if (!item) return;
  openConfirm('🛍️','Acquista item',
    `Vuoi acquistare "${item.name}" per ⭐ ${item.cost} punti?`,
    async () => {
      const d = await api(`/api/shop/buy/${itemId}`,'POST');
      if (d.error) return showN('❌ '+d.error,'error');
      showN(`✅ "${item.name}" acquistato!`);
      await loadShop();
      await loadProfile();
    }
  );
}
window.buyItem = buyItem;

// ══════════════════════════════════════════
//   MII AVATAR BUILDER
// ══════════════════════════════════════════
let miiState = {
  color:'#16a34a', skin:'#fde68a',
  eyes:'normal',   mouth:'smile',
  hair:'none',     ownedItems:[]
};

function renderMiiBuilder() {
  const cats=[
    { id:'miiHair',  cat:'hair',  label:'Capelli', options:['none','short','long','curly','bun','mohawk','wavy','cap','rainbow','gold','galaxy','flame'] },
    { id:'miiEyes',  cat:'eyes',  label:'Occhi',   options:['normal','happy','sleepy','surprised','wink','cool','star','heart','laser'] },
    { id:'miiMouth', cat:'mouth', label:'Bocca',   options:['smile','grin','open','smirk','tongue','sad','rainbow','fire'] },
  ];
  cats.forEach(c=>{
    const el=document.getElementById(c.id);
    if (!el) return;
    el.innerHTML=c.options.map(o=>`
      <div class="mii-opt ${miiState[c.cat]===o?'sel':''} ${
        o==='none'||isItemOwned(c.cat,o)?'':'locked'}"
        onclick="setMii('${c.cat}','${o}',this)"
        title="${o}">
        <canvas width="36" height="36"
          id="miiPrev_${c.cat}_${o}"></canvas>
      </div>`).join('');
    c.options.forEach(o=>drawMii({...miiState,[c.cat]:o},`miiPrev_${c.cat}_${o}`,36));
  });
}

function isItemOwned(cat, val) {
  if (!shopData.items.length) return true;
  const item = shopData.items.find(i=>i.category===cat&&i.value===val);
  if (!item) return true;
  return shopData.owned.includes(item.id);
}

function setMii(prop, val, btn) {
  if (!isItemOwned(prop, val) && val!=='none') {
    showN('🔒 Acquista questo item nello shop!','warn');
    return;
  }
  miiState[prop]=val;
  document.querySelectorAll(`#mii${prop.charAt(0).toUpperCase()+prop.slice(1)} .mii-opt`)
    .forEach(b=>b.classList.remove('sel'));
  btn?.classList.add('sel');
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
}
window.setMii = setMii;

function pickColor(val) {
  miiState.color=val;
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('sel'));
  document.querySelector(`.color-swatch[data-val="${val}"]`)?.classList.add('sel');
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
}
window.pickColor = pickColor;

function pickSkin(val) {
  miiState.skin=val;
  document.querySelectorAll('.skin-swatch').forEach(s=>s.classList.remove('sel'));
  document.querySelector(`.skin-swatch[data-val="${val}"]`)?.classList.add('sel');
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();
}
window.pickSkin = pickSkin;

// ══════════════════════════════════════════
//   MII CANVAS RENDERER
// ══════════════════════════════════════════
function drawMii(u, canvasId, size=44) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = size; canvas.height = size;
  const s  = size/44;
  const cx = size/2;

  // BG
  ctx.fillStyle = u.avatar_color||u.color||'#16a34a';
  ctx.beginPath();
  ctx.arc(cx, cx, cx-1, 0, Math.PI*2);
  ctx.fill();

  // HEAD
  ctx.fillStyle = u.avatar_skin||u.skin||'#fde68a';
  ctx.beginPath();
  ctx.ellipse(cx, cx+2*s, 12*s, 13*s, 0, 0, Math.PI*2);
  ctx.fill();
  // Ears
  [-1,1].forEach(d=>{
    ctx.beginPath();
    ctx.arc(cx+d*12*s, cx+3*s, 3.5*s, 0, Math.PI*2);
    ctx.fill();
  });

  const eye = u.avatar_eyes||u.eyes||'normal';
  const ey  = cx-1*s;

  // EYES
  if (eye==='laser') {
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.fillStyle='#ef4444';
      ctx.beginPath();
      ctx.arc(ex,ey,2.5*s,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle='rgba(239,68,68,0.5)';
      ctx.lineWidth=1*s;
      ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex,ey+14*s); ctx.stroke();
    });
  } else if (eye==='heart') {
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.fillStyle='#ef4444'; ctx.font=`${9*s}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('♥',ex,ey);
    });
  } else if (eye==='star') {
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.fillStyle='#fbbf24'; ctx.font=`${9*s}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('★',ex,ey);
    });
  } else if (eye==='cool') {
    ctx.fillStyle='rgba(0,0,0,0.85)';
    ctx.beginPath(); ctx.roundRect(cx-9*s,ey-2.5*s,18*s,5*s,2*s); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx-5*s,ey,1.5*s,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+5*s,ey,1.5*s,0,Math.PI*2); ctx.fill();
  } else if (eye==='wink') {
    ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.arc(cx-5*s,ey,2.5*s,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#1e293b'; ctx.lineWidth=1.5*s;
    ctx.beginPath(); ctx.moveTo(cx+3*s,ey); ctx.quadraticCurveTo(cx+5*s,ey+2*s,cx+7*s,ey); ctx.stroke();
  } else if (eye==='sleepy') {
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.strokeStyle='#1e293b'; ctx.lineWidth=1.5*s;
      ctx.beginPath(); ctx.arc(ex,ey+1*s,2.5*s,Math.PI,0); ctx.stroke();
    });
  } else if (eye==='surprised') {
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.strokeStyle='#1e293b'; ctx.lineWidth=1.5*s;
      ctx.beginPath(); ctx.arc(ex,ey,3*s,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.arc(ex,ey,1.5*s,0,Math.PI*2); ctx.fill();
    });
  } else if (eye==='happy') {
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.strokeStyle='#1e293b'; ctx.lineWidth=1.5*s;
      ctx.beginPath(); ctx.arc(ex,ey+1*s,2.5*s,Math.PI,0,true); ctx.stroke();
    });
  } else {
    ctx.fillStyle='#1e293b';
    [cx-5*s,cx+5*s].forEach(ex=>{
      ctx.beginPath(); ctx.arc(ex,ey,2.5*s,0,Math.PI*2); ctx.fill();
    });
    ctx.fillStyle='rgba(255,255,255,0.7)';
    [cx-4*s,cx+6*s].forEach(ex=>{
      ctx.beginPath(); ctx.arc(ex,ey-1*s,0.8*s,0,Math.PI*2); ctx.fill();
    });
  }

  // MOUTH
  const mouth = u.avatar_mouth||u.mouth||'smile';
  const my    = cx+7*s;
  ctx.strokeStyle='#1e293b'; ctx.lineWidth=1.5*s; ctx.lineCap='round';

  if (mouth==='rainbow') {
    const grad=ctx.createLinearGradient(cx-6*s,my,cx+6*s,my);
    grad.addColorStop(0,'#ef4444'); grad.addColorStop(.5,'#10b981'); grad.addColorStop(1,'#3b82f6');
    ctx.strokeStyle=grad;
    ctx.beginPath(); ctx.arc(cx,my-2*s,5*s,0.2,Math.PI-0.2); ctx.stroke();
  } else if (mouth==='fire') {
    ctx.strokeStyle='#f97316';
    ctx.beginPath(); ctx.arc(cx,my-2*s,5*s,0.2,Math.PI-0.2); ctx.stroke();
    ctx.font=`${7*s}px serif`; ctx.textAlign='center'; ctx.fillStyle='#ef4444';
    ctx.fillText('🔥',cx,my+3*s);
  } else if (mouth==='grin') {
    ctx.strokeStyle='#1e293b';
    ctx.beginPath(); ctx.arc(cx,my-2*s,6*s,0.15,Math.PI-0.15); ctx.stroke();
    ctx.fillStyle='white'; ctx.fillRect(cx-4.5*s,my-3*s,9*s,3*s);
    ctx.strokeStyle='#d1d5db'; ctx.lineWidth=.5*s;
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(cx+i*2*s,my-3*s);ctx.lineTo(cx+i*2*s,my);ctx.stroke();}
  } else if (mouth==='open') {
    ctx.fillStyle='#1e293b';
    ctx.beginPath(); ctx.ellipse(cx,my,4*s,3*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='white'; ctx.font=`${5*s}px serif`; ctx.textAlign='center';
    ctx.fillText('o',cx,my+1.5*s);
  } else if (mouth==='smirk') {
    ctx.beginPath(); ctx.moveTo(cx-4*s,my); ctx.quadraticCurveTo(cx,my-1*s,cx+5*s,my-3*s); ctx.stroke();
  } else if (mouth==='tongue') {
    ctx.beginPath(); ctx.arc(cx,my-2*s,5*s,0.2,Math.PI-0.2); ctx.stroke();
    ctx.fillStyle='#f87171'; ctx.beginPath(); ctx.ellipse(cx,my+1*s,2.5*s,2*s,0,0,Math.PI); ctx.fill();
  } else if (mouth==='sad') {
    ctx.beginPath(); ctx.arc(cx,my+3*s,5*s,Math.PI+0.3,-0.3); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx,my-2*s,5*s,0.2,Math.PI-0.2); ctx.stroke();
  }

  // HAIR
  const hair = u.avatar_hair||u.hair||'none';
  const hairColor = u.avatar_color||u.color||'#16a34a';
  const skinColor = u.avatar_skin||u.skin||'#fde68a';

  if (hair==='short') {
    ctx.fillStyle=hairColor;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,12*s,7*s,0,Math.PI,0); ctx.fill();
  } else if (hair==='long') {
    ctx.fillStyle=hairColor;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,12*s,7*s,0,Math.PI,0); ctx.fill();
    [-1,1].forEach(d=>{
      ctx.beginPath(); ctx.ellipse(cx+d*11*s,cx+8*s,3.5*s,10*s,d*0.2,0,Math.PI*2); ctx.fill();
    });
  } else if (hair==='curly') {
    ctx.fillStyle=hairColor;
    ctx.beginPath(); ctx.arc(cx,cx-10*s,12*s,Math.PI,0); ctx.fill();
    for(let i=0;i<6;i++){
      ctx.beginPath(); ctx.arc(cx-10*s+i*4*s,cx-10*s,2.5*s,0,Math.PI*2); ctx.fill();
    }
  } else if (hair==='bun') {
    ctx.fillStyle=hairColor;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,12*s,7*s,0,Math.PI,0); ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cx-18*s,5*s,0,Math.PI*2); ctx.fill();
  } else if (hair==='mohawk') {
    ctx.fillStyle=hairColor;
    ctx.beginPath();
    ctx.moveTo(cx-3*s,cx-10*s); ctx.lineTo(cx-1*s,cx-22*s);
    ctx.lineTo(cx+1*s,cx-22*s); ctx.lineTo(cx+3*s,cx-10*s);
    ctx.closePath(); ctx.fill();
  } else if (hair==='wavy') {
    ctx.fillStyle=hairColor;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,12*s,7*s,0,Math.PI,0); ctx.fill();
    ctx.beginPath();
    for(let i=0;i<5;i++){
      const x=cx-10*s+i*5*s;
      ctx.arc(x+2.5*s,cx-4*s,2.5*s,Math.PI,0,i%2===0);
    }
    ctx.fill();
  } else if (hair==='cap') {
    ctx.fillStyle=hairColor;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,14*s,8*s,0,Math.PI,0); ctx.fill();
    ctx.fillRect(cx-14*s,cx-11*s,28*s,5*s);
    ctx.fillRect(cx+10*s,cx-10*s,6*s,3*s);
  } else if (hair==='rainbow') {
    const g=ctx.createLinearGradient(cx-12*s,0,cx+12*s,0);
    g.addColorStop(0,'#ef4444'); g.addColorStop(.33,'#fbbf24');
    g.addColorStop(.66,'#10b981'); g.addColorStop(1,'#3b82f6');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,13*s,8*s,0,Math.PI,0); ctx.fill();
  } else if (hair==='gold') {
    const g=ctx.createLinearGradient(0,cx-18*s,0,cx-10*s);
    g.addColorStop(0,'#fbbf24'); g.addColorStop(1,'#d97706');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,13*s,8*s,0,Math.PI,0); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(cx-3*s,cx-15*s,2*s,4*s,-0.3,0,Math.PI*2); ctx.fill();
  } else if (hair==='galaxy') {
    const g=ctx.createLinearGradient(cx-12*s,0,cx+12*s,cx);
    g.addColorStop(0,'#4338ca'); g.addColorStop(.5,'#7c3aed'); g.addColorStop(1,'#db2777');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cx-10*s,13*s,8*s,0,Math.PI,0); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.8)';
    [[cx-5*s,cx-14*s,1*s],[cx+3*s,cx-16*s,.8*s],[cx+7*s,cx-12*s,.6*s],
     [cx-8*s,cx-11*s,.7*s],[cx,cx-18*s,1.2*s]].forEach(([x,y,r])=>{
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    });
  } else if (hair==='flame') {
    [
      { x:cx,    h:20, c:'#ef4444' },
      { x:cx-5*s,h:14, c:'#f97316' },
      { x:cx+5*s,h:14, c:'#f97316' },
      { x:cx-2*s,h:17, c:'#fbbf24' },
      { x:cx+2*s,h:17, c:'#fbbf24' },
    ].forEach(f=>{
      ctx.fillStyle=f.c;
      ctx.beginPath();
      ctx.moveTo(f.x-3*s,cx-10*s);
      ctx.quadraticCurveTo(f.x,cx-f.h*s,f.x+3*s,cx-10*s);
      ctx.fill();
    });
  }
}
window.drawMii = drawMii;

// ══════════════════════════════════════════
//   SOCIAL — FOLLOWERS / FOLLOWING
// ══════════════════════════════════════════
async function loadFollowers() {
  const list=await api('/api/followers');
  const el=document.getElementById('followersList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">👥</div><p>Nessun follower ancora.</p></div>`;
    return;
  }
  el.innerHTML=list.map(u=>userCardHTML(u,false)).join('');
  setTimeout(()=>list.forEach(u=>drawMii(u,`ucAv${u.id}`,44)),60);
}

async function loadFollowing() {
  const list=await api('/api/following');
  const el=document.getElementById('followingList');
  if (!el) return;
  following = Array.isArray(list) ? list : [];
  if (!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">👣</div><p>Non segui nessuno ancora.</p></div>`;
    return;
  }
  el.innerHTML=list.map(u=>userCardHTML(u,true)).join('');
  setTimeout(()=>list.forEach(u=>drawMii(u,`ucAv${u.id}`,44)),60);
}

function userCardHTML(u, isFollowing) {
  return `
    <div class="user-card">
      <div class="uc-av">
        <canvas width="44" height="44" id="ucAv${u.id}"></canvas>
      </div>
      <div class="uc-info">
        <div class="uc-name">${u.name||'Utente'}</div>
        <div class="uc-username">@${u.username||'—'}</div>
        <div class="uc-pts">⭐ ${Math.round(u.points||0)} pt</div>
      </div>
      <button class="btn-follow ${isFollowing?'following':''}"
        onclick="toggleFollow(${u.id},${isFollowing},this)">
        ${isFollowing
          ? '<i class="fas fa-user-minus"></i> Smetti'
          : '<i class="fas fa-user-plus"></i> Segui'}
      </button>
    </div>`;
}

async function toggleFollow(userId, isFollowing, btn) {
  btn.disabled=true;
  const d = isFollowing
    ? await api(`/api/follow/${userId}`,'DELETE')
    : await api(`/api/follow/${userId}`,'POST');
  btn.disabled=false;
  if (d.error) return showN('❌ '+d.error,'error');
  showN(isFollowing?'✅ Non segui più':'✅ Stai seguendo!');
  loadFollowing(); loadFollowers();
}
window.toggleFollow=toggleFollow;

// ══════════════════════════════════════════
//   GROUPS ✅ v5 + LEADERBOARD + INVITI
// ══════════════════════════════════════════
async function loadGroups() {
  const list = await api('/api/groups');
  const el   = document.getElementById('groupsList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML=`<div class="empty"><div class="ei">👥</div><p>Nessun gruppo. Creane uno!</p></div>`;
    return;
  }
  el.innerHTML = list.map(g=>`
    <div class="group-card" id="gc${g.id}">
      <div class="gc-head">
        <div class="gc-icon">👥</div>
        <div class="gc-info">
          <div class="gc-name">${g.name}</div>
          <div class="gc-desc">${g.description||'Nessuna descrizione.'}</div>
          <div class="gc-meta">
            <span>👤 ${g.member_count} membri</span>
            <span class="invite-code-pill">🔑 ${g.invite_code||'—'}</span>
            ${g.is_public?'<span class="pub-badge">🌐 Pubblico</span>':'<span class="priv-badge">🔒 Privato</span>'}
          </div>
        </div>
        <div class="gc-actions">
          ${g.is_member
            ? `<button class="btn-leave" onclick="leaveGroup(${g.id},this)">
                 <i class="fas fa-sign-out-alt"></i> Esci
               </button>`
            : `<button class="btn-join" onclick="joinGroup(${g.id},this)">
                 <i class="fas fa-sign-in-alt"></i> Unisciti
               </button>`}
          ${g.is_member
            ? `<button class="btn-invite-followers" onclick="openInviteModal(${g.id},'${g.name.replace(/'/g,"\\'")}')">
                 <i class="fas fa-paper-plane"></i> Invita
               </button>`
            : ''}
        </div>
      </div>
      <!-- ✅ CLASSIFICA GRUPPO -->
      <div class="gc-lb-toggle" onclick="toggleGroupLb(${g.id})">
        <i class="fas fa-trophy"></i> Classifica gruppo
        <i class="fas fa-chevron-down" id="gcLbArrow${g.id}" style="margin-left:auto;transition:.3s"></i>
      </div>
      <div class="gc-lb" id="gcLb${g.id}" style="display:none"></div>
    </div>`).join('');
}

async function toggleGroupLb(gid) {
  const el    = document.getElementById(`gcLb${gid}`);
  const arrow = document.getElementById(`gcLbArrow${gid}`);
  if (!el) return;
  if (el.style.display==='block') {
    el.style.display='none';
    if (arrow) arrow.style.transform='rotate(0)';
    return;
  }
  el.innerHTML=`<div style="text-align:center;padding:12px">
    <i class="fas fa-spinner fa-spin" style="color:var(--green)"></i>
  </div>`;
  el.style.display='block';
  if (arrow) arrow.style.transform='rotate(180deg)';
  const list=await api(`/api/groups/${gid}/leaderboard`);
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML=`<div class="empty" style="padding:12px"><div class="ei">🏆</div><p>Nessun membro.</p></div>`;
    return;
  }
  const medals=['🥇','🥈','🥉'];
  el.innerHTML=`
    <div class="gc-lb-list">
      ${list.map((u,i)=>`
        <div class="gc-lb-row">
          <div class="gc-lb-rank">${medals[i]||'#'+(i+1)}</div>
          <div class="gc-lb-av"><canvas width="32" height="32" id="gcAv${gid}_${u.id}"></canvas></div>
          <div class="gc-lb-name">
            <span class="gc-lb-uname">${u.name||'Utente'}</span>
            <span class="gc-lb-username">@${u.username}</span>
          </div>
          <div class="gc-lb-co2">🌍 ${parseFloat(u.co2_saved).toFixed(1)} kg</div>
          <div class="gc-lb-pts">⭐ ${Math.round(u.points)}</div>
        </div>`).join('')}
    </div>`;
  setTimeout(()=>list.forEach(u=>drawMii(u,`gcAv${gid}_${u.id}`,32)),60);
}
window.toggleGroupLb=toggleGroupLb;

async function joinGroup(gid, btn) {
  btn.disabled=true;
  const d=await api(`/api/groups/${gid}/join`,'POST');
  btn.disabled=false;
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Gruppo unito!');
  loadGroups();
}
window.joinGroup=joinGroup;

async function leaveGroup(gid, btn) {
  openConfirm('🚪','Lascia gruppo','Vuoi lasciare questo gruppo?', async ()=>{
    btn.disabled=true;
    const d=await api(`/api/groups/${gid}/leave`,'DELETE');
    btn.disabled=false;
    if (d.error) return showN('❌ '+d.error,'error');
    showN('✅ Hai lasciato il gruppo','info');
    loadGroups();
  });
}
window.leaveGroup=leaveGroup;

function toggleGroupForm() {
  const f=document.getElementById('groupForm');
  f.style.display=f.style.display==='none'?'block':'none';
}
window.toggleGroupForm=toggleGroupForm;

async function saveGroup() {
  const name=document.getElementById('gName').value.trim();
  if (!name) return showN('❌ Nome obbligatorio','error');
  const d=await api('/api/groups','POST',{
    name,
    description:document.getElementById('gDesc').value,
    is_public:document.getElementById('gPublic').checked
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ Gruppo "${d.name}" creato! Codice: ${d.invite_code}`);
  document.getElementById('groupForm').style.display='none';
  document.getElementById('gName').value='';
  document.getElementById('gDesc').value='';
  loadGroups();
}
window.saveGroup=saveGroup;

// ══════════════════════════════════════════
//   MODALE INVITI GRUPPO ✅ v5
// ══════════════════════════════════════════
let inviteGroupId   = null;
let inviteGroupName = '';

async function openInviteModal(gid, gname) {
  inviteGroupId   = gid;
  inviteGroupName = gname;
  const modal  = document.getElementById('inviteModal');
  const title  = document.getElementById('inviteModalTitle');
  const list   = document.getElementById('inviteFollowerList');
  if (!modal) return;
  title.textContent=`Invita nel gruppo "${gname}"`;
  list.innerHTML=`<div style="text-align:center;padding:20px">
    <i class="fas fa-spinner fa-spin" style="color:var(--green)"></i>
  </div>`;
  modal.style.display='flex';

  // Carica following freschi
  const fol = await api('/api/following');
  following  = Array.isArray(fol) ? fol : [];

  if (!following.length) {
    list.innerHTML=`<div class="empty"><div class="ei">👥</div>
      <p>Non segui nessuno. Segui utenti per invitarli!</p></div>`;
    return;
  }
  list.innerHTML=following.map(u=>`
    <label class="invite-follower-row">
      <input type="checkbox" class="invite-cb" value="${u.id}">
      <div class="if-av"><canvas width="36" height="36" id="ifAv${u.id}"></canvas></div>
      <div class="if-info">
        <div class="if-name">${u.name||'Utente'}</div>
        <div class="if-user">@${u.username}</div>
      </div>
    </label>`).join('');
  setTimeout(()=>following.forEach(u=>drawMii(u,`ifAv${u.id}`,36)),60);
}
window.openInviteModal=openInviteModal;

function closeInviteModal() {
  const modal=document.getElementById('inviteModal');
  if (modal) modal.style.display='none';
  inviteGroupId=null;
}
window.closeInviteModal=closeInviteModal;

function selectAllInvite(checked) {
  document.querySelectorAll('.invite-cb').forEach(cb=>cb.checked=checked);
}
window.selectAllInvite=selectAllInvite;

async function sendGroupInvites() {
  const ids=[...document.querySelectorAll('.invite-cb:checked')].map(cb=>parseInt(cb.value));
  if (!ids.length) return showN('❌ Seleziona almeno un follower','error');
  const btn=document.getElementById('sendInviteBtn');
  btn.disabled=true;
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Invio...';
  const d=await api(`/api/groups/${inviteGroupId}/invite`,'POST',{ follower_ids:ids });
  btn.disabled=false;
  btn.innerHTML='<i class="fas fa-paper-plane"></i> Invia inviti';
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ Inviti inviati a ${d.sent} utent${d.sent===1?'e':'i'}! Codice: ${d.invite_code}`);
  closeInviteModal();
}
window.sendGroupInvites=sendGroupInvites;

// ══════════════════════════════════════════
//   JOIN DA CODICE MANUALE
// ══════════════════════════════════════════
async function joinGroupByCode() {
  const code=document.getElementById('joinCodeInput')?.value?.trim().toUpperCase();
  if (!code||code.length<4) return showN('❌ Inserisci un codice valido','error');
  const d=await api(`/api/groups/join/${code}`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ Sei entrato nel gruppo "${d.group?.name}"!`);
  document.getElementById('joinCodeInput').value='';
  loadGroups();
}
window.joinGroupByCode=joinGroupByCode;
// ══════════════════════════════════════════
//   LOG ACTIVITY
// ══════════════════════════════════════════
function selectAct(type, btn) {
  curAct = type;
  document.querySelectorAll('.at-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  const form = document.getElementById('logForm');
  form.style.display='block';
  document.getElementById('formTitle').textContent=`${ICONS[type]} ${type}`;
  const r    = RATES[type];
  const isKm = r.t==='k';
  document.getElementById('kmField').style.display    = isKm  ? 'block':'none';
  document.getElementById('hoursField').style.display = !isKm ? 'block':'none';
  document.getElementById('mapSection').style.display = isKm  ? 'block':'none';
  const kmInp=document.getElementById('kmInput');
  const hrInp=document.getElementById('hoursInput');
  if (kmInp) kmInp.value='';
  if (hrInp) hrInp.value='';
  calcedKm=0;
  updateCo2Estimate();
  if (isKm) {
    setTimeout(()=>{ if (!mapInited) initMap(); else map?.invalidateSize(); },200);
  }
}
window.selectAct=selectAct;

function cancelLog() {
  document.getElementById('logForm').style.display='none';
  curAct=null; calcedKm=0;
  document.querySelectorAll('.at-btn').forEach(b=>b.classList.remove('sel'));
  const co2El=document.getElementById('co2Estimate');
  if (co2El) co2El.style.display='none';
  resetMap();
}
window.cancelLog=cancelLog;

function updateCo2Estimate() {
  if (!curAct) return;
  const r    = RATES[curAct];
  const isKm = r.t==='k';
  let val;
  if (isKm) {
    val = calcedKm>0
      ? calcedKm
      : parseFloat(document.getElementById('kmInput')?.value)||0;
  } else {
    val = parseFloat(document.getElementById('hoursInput')?.value)||0;
  }
  const co2  = (val*r.co2).toFixed(2);
  const pts  = Math.round(val*r.pts);
  const unit = isKm?'km':'ore';
  const el   = document.getElementById('co2Estimate');
  const eco  = document.getElementById('co2EstCo2');
  const epo  = document.getElementById('co2EstPts');
  const eun  = document.getElementById('co2EstUnit');
  if (el)  el.style.display='flex';
  if (eco) eco.textContent=`${co2} kg`;
  if (epo) epo.textContent=`+${pts}`;
  if (eun) eun.textContent=`${val} ${unit}`;
}
window.updateCo2Estimate=updateCo2Estimate;

async function saveActivity() {
  if (!curAct) return showN('❌ Seleziona un tipo di attività','error');
  const r    = RATES[curAct];
  const isKm = r.t==='k';
  let km=0,hours=0,fromA='',toA='';
  if (isKm) {
    if (calcedKm>0) {
      km=calcedKm;
      fromA=document.getElementById('fromAddr')?.value||'';
      toA  =document.getElementById('toAddr')?.value||'';
    } else {
      km=parseFloat(document.getElementById('kmInput')?.value)||0;
    }
    if (km<=0) return showN('❌ Inserisci i km o calcola il percorso','error');
  } else {
    hours=parseFloat(document.getElementById('hoursInput')?.value)||0;
    if (hours<=0) return showN('❌ Inserisci le ore','error');
  }
  const note=document.getElementById('noteInput')?.value?.trim()||'';
  const btn=document.getElementById('saveBtnLog');
  if (btn){ btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvataggio...'; }
  const co2=parseFloat(((isKm?km:hours)*r.co2).toFixed(2));
  const pts=Math.round((isKm?km:hours)*r.pts);
  const d=await api('/api/activities','POST',{ type:curAct,km,hours,note,from_addr:fromA,to_addr:toA });
  if (btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-leaf"></i> Salva Attività'; }
  if (d.error) return showN('❌ '+d.error,'error');
  showCo2Explosion(co2,pts);
  showN(`✅ Attività salvata! +${co2} kg CO₂ · +${pts} pt`);
  cancelLog();
  await Promise.all([loadStats(),loadActivities(),loadBadges(),loadYearly(),loadProfile()]);
}
window.saveActivity=saveActivity;

// ══════════════════════════════════════════
//   MAPPA LEAFLET ✅ v5 MIGLIORATA
// ══════════════════════════════════════════
const TILE_STREET = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_SAT    = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_SAT_ATT= 'Tiles © Esri';

function initMap() {
  if (mapInited) return;
  const container=document.getElementById('leafletMap');
  if (!container) return;
  try {
    map=L.map('leafletMap',{ center:[45.464,9.190], zoom:12, zoomControl:true });
    tileLayer=L.tileLayer(TILE_STREET,{
      attribution:'© OpenStreetMap', maxZoom:19
    }).addTo(map);

    // ✅ Pulsante satellite
    const satBtn=L.control({ position:'topright' });
    satBtn.onAdd=()=>{
      const d=L.DomUtil.create('button','map-sat-btn');
      d.innerHTML='🛰️ Satellite';
      d.title='Cambia vista';
      d.onclick=(e)=>{ L.DomEvent.stopPropagation(e); toggleSatellite(d); };
      return d;
    };
    satBtn.addTo(map);

    // ✅ Pulsante geolocalizzazione
    const geoBtn=L.control({ position:'topright' });
    geoBtn.onAdd=()=>{
      const d=L.DomUtil.create('button','map-geo-btn');
      d.innerHTML='📍 La mia posizione';
      d.title='Usa posizione attuale';
      d.onclick=(e)=>{ L.DomEvent.stopPropagation(e); useMyLocation(d); };
      return d;
    };
    geoBtn.addTo(map);

    // ✅ Pulsante reset
    const resetBtn=L.control({ position:'topright' });
    resetBtn.onAdd=()=>{
      const d=L.DomUtil.create('button','map-reset-btn');
      d.innerHTML='🗑️ Reset mappa';
      d.onclick=(e)=>{ L.DomEvent.stopPropagation(e); resetMap(); };
      return d;
    };
    resetBtn.addTo(map);

    map.on('click', handleMapClick);
    mapInited=true;
    setTimeout(()=>map.invalidateSize(),150);
    showN('🗺️ Clicca sulla mappa per impostare partenza e arrivo','info');
  } catch(e) {
    console.error('Leaflet init error:',e);
    showN('❌ Errore caricamento mappa','error');
  }
}

function toggleSatellite(btn) {
  if (!map||!tileLayer) return;
  mapSat=!mapSat;
  map.removeLayer(tileLayer);
  tileLayer=L.tileLayer(mapSat?TILE_SAT:TILE_STREET,{
    attribution: mapSat?TILE_SAT_ATT:'© OpenStreetMap',
    maxZoom:19
  }).addTo(map);
  btn.innerHTML=mapSat?'🗺️ Mappa':'🛰️ Satellite';
  btn.classList.toggle('active',mapSat);
}

function useMyLocation(btn) {
  if (!navigator.geolocation) return showN('❌ Geolocalizzazione non supportata','error');
  btn.innerHTML='⏳ Localizzazione...';
  btn.disabled=true;
  navigator.geolocation.getCurrentPosition(
    pos=>{
      btn.innerHTML='📍 La mia posizione';
      btn.disabled=false;
      const { latitude:lat, longitude:lng } = pos.coords;
      map.setView([lat,lng],15);
      if (!markerFrom) {
        setMarker('from',lat,lng);
        reverseGeocode(lat,lng,'fromAddr');
        showN('✅ Posizione attuale impostata come partenza','success');
      } else if (!markerTo) {
        setMarker('to',lat,lng);
        reverseGeocode(lat,lng,'toAddr');
        setTimeout(calcRoute,400);
      }
    },
    err=>{
      btn.innerHTML='📍 La mia posizione';
      btn.disabled=false;
      showN('❌ Impossibile ottenere la posizione: '+err.message,'error');
    },
    { enableHighAccuracy:true, timeout:8000 }
  );
}

function handleMapClick(e) {
  const { lat,lng }=e.latlng;
  if (!markerFrom) {
    setMarker('from',lat,lng);
    reverseGeocode(lat,lng,'fromAddr');
  } else if (!markerTo) {
    setMarker('to',lat,lng);
    reverseGeocode(lat,lng,'toAddr');
    setTimeout(calcRoute,400);
  }
}

function setMarker(type,lat,lng) {
  const cfg={
    from:{ color:'#16a34a', label:'🟢 Partenza', anchor:[52,14] },
    to:  { color:'#ef4444', label:'🔴 Arrivo',   anchor:[40,14] }
  }[type];
  const icon=L.divIcon({
    html:`<div style="
      background:${cfg.color};color:white;
      padding:5px 10px;border-radius:20px;
      font-size:11px;font-weight:700;
      box-shadow:0 3px 10px rgba(0,0,0,.35);
      white-space:nowrap;border:2px solid white;">
      ${cfg.label}
    </div>`,
    className:'',
    iconAnchor:cfg.anchor
  });
  if (type==='from') {
    if (markerFrom) map.removeLayer(markerFrom);
    markerFrom=L.marker([lat,lng],{ icon,draggable:true }).addTo(map)
      .on('dragend',e=>{ const p=e.target.getLatLng(); reverseGeocode(p.lat,p.lng,'fromAddr'); if(markerTo) calcRoute(); });
  } else {
    if (markerTo) map.removeLayer(markerTo);
    markerTo=L.marker([lat,lng],{ icon,draggable:true }).addTo(map)
      .on('dragend',e=>{ const p=e.target.getLatLng(); reverseGeocode(p.lat,p.lng,'toAddr'); calcRoute(); });
  }
}

function resetMap() {
  if (!map) return;
  if (markerFrom){ map.removeLayer(markerFrom); markerFrom=null; }
  if (markerTo)  { map.removeLayer(markerTo);   markerTo=null;   }
  if (routeLine) { map.removeLayer(routeLine);  routeLine=null;  }
  const ri=document.getElementById('routeInfo');
  if (ri) ri.style.display='none';
  const fa=document.getElementById('fromAddr');
  const ta=document.getElementById('toAddr');
  if (fa) fa.value='';
  if (ta) ta.value='';
  calcedKm=0;
  updateCo2Estimate();
  showN('🗑️ Mappa resettata','info');
}
window.resetMap=resetMap;

async function geocodeAddress(addr) {
  if (!addr||addr.length<3) return null;
  try {
    const r=await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=5`,
      { headers:{ 'Accept-Language':'it' } }
    );
    return await r.json();
  } catch { return null; }
}

async function reverseGeocode(lat,lng,inputId) {
  try {
    const r=await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers:{ 'Accept-Language':'it' } }
    );
    const d=await r.json();
    const el=document.getElementById(inputId);
    if (el&&d.display_name)
      el.value=d.display_name.split(',').slice(0,3).join(',').trim();
  } catch(e){ console.warn('Reverse geocode:',e); }
}

function onAddrInput(inputId,suggId,type) {
  clearTimeout(geocodeTimer);
  const val=document.getElementById(inputId)?.value;
  if (!val||val.length<3) {
    const s=document.getElementById(suggId);
    if (s) s.innerHTML='';
    return;
  }
  geocodeTimer=setTimeout(async()=>{
    const results=await geocodeAddress(val);
    if (!results?.length) return;
    const sugg=document.getElementById(suggId);
    if (!sugg) return;
    sugg.innerHTML=results.map(res=>`
      <div class="addr-sugg-item"
        onclick="selectAddr('${inputId}','${suggId}','${type}',
          ${res.lat},${res.lon},\`${res.display_name.replace(/`/g,"'")}\`)">
        <i class="fas fa-map-marker-alt"></i>
        ${res.display_name.split(',').slice(0,3).join(', ')}
      </div>`).join('');
  },450);
}
window.onAddrInput=onAddrInput;

function selectAddr(inputId,suggId,type,lat,lon,name) {
  const el=document.getElementById(inputId);
  if (el) el.value=name.split(',').slice(0,3).join(',').trim();
  const s=document.getElementById(suggId);
  if (s) s.innerHTML='';
  setMarker(type,parseFloat(lat),parseFloat(lon));
  map.setView([parseFloat(lat),parseFloat(lon)],14);
  if (markerFrom&&markerTo) calcRoute();
}
window.selectAddr=selectAddr;

async function calcRoute() {
  if (!markerFrom||!markerTo) {
    showN('❌ Imposta partenza e arrivo prima','error');
    return;
  }
  const btn=document.getElementById('calcRouteBtn');
  if (btn){ btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Calcolo...'; }

  const f=markerFrom.getLatLng();
  const t=markerTo.getLatLng();
  const profile=OSRM_PROFILE[curAct]||'driving';

  try {
    const res=await fetch(
      `https://router.project-osrm.org/route/v1/${profile}/`+
      `${f.lng},${f.lat};${t.lng},${t.lat}?overview=full&geometries=geojson`
    );
    const d=await res.json();
    if (btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-route"></i> Calcola Percorso'; }
    if (!d.routes?.length) {
      showN('❌ Percorso non trovato. Prova indirizzi diversi.','error');
      return;
    }
    const route=d.routes[0];
    const km   =(route.distance/1000).toFixed(1);
    const mins =Math.round(route.duration/60);

    // ✅ Percorso con stile migliorato — doppio layer (glow + linea)
    if (routeLine) map.removeLayer(routeLine);
    const routeGlow=L.geoJSON(route.geometry,{
      style:{ color:'rgba(22,163,74,0.25)', weight:10, opacity:1 }
    }).addTo(map);
    routeLine=L.geoJSON(route.geometry,{
      style:{ color:'#16a34a', weight:4, opacity:1, dashArray:'10,6', lineCap:'round' }
    }).addTo(map);

    // Animazione percorso — cambia opacity glow
    setTimeout(()=>{ try{ map.removeLayer(routeGlow); }catch{} },1500);

    // ✅ Freccia direzionale sul percorso
    if (typeof L.polylineDecorator !== 'undefined') {
      L.polylineDecorator(routeLine, {
        patterns:[{
          offset:'10%', repeat:'20%',
          symbol:L.Symbol.arrowHead({
            pixelSize:10, headAngle:45,
            pathOptions:{ fillOpacity:1, weight:0, color:'#16a34a' }
          })
        }]
      }).addTo(map);
    }

    map.fitBounds(routeLine.getBounds(),{ padding:[40,40] });
    calcedKm=parseFloat(km);
    updateCo2Estimate();

    const ri=document.getElementById('routeInfo');
    if (ri) {
      ri.style.display='flex';
      const rate=RATES[curAct];
      const co2=(calcedKm*rate.co2).toFixed(2);
      const pts=Math.round(calcedKm*rate.pts);
      const hours=Math.floor(mins/60);
      const minRem=mins%60;
      const timeStr=hours>0?`${hours}h ${minRem}min`:`${mins} min`;
      ri.innerHTML=`
        <div class="route-info-item">
          <i class="fas fa-road" style="color:var(--blue)"></i>
          <strong>${km} km</strong>
        </div>
        <div class="route-info-item">
          <i class="fas fa-clock" style="color:var(--yellow)"></i>
          ~${timeStr}
        </div>
        <div class="route-info-item co2-highlight">
          <i class="fas fa-leaf"></i>
          <strong>${co2} kg CO₂</strong>
        </div>
        <div class="route-info-item">
          <i class="fas fa-star" style="color:var(--yellow)"></i>
          <strong>+${pts} pt</strong>
        </div>`;
    }
    showN(`✅ Percorso: ${km} km · ~${timeStr}`,'success');
  } catch(e) {
    if (btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-route"></i> Calcola Percorso'; }
    console.error('Route error:',e);
    showN('❌ Errore nel calcolo del percorso','error');
  }
}
window.calcRoute=calcRoute;

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdminUsers() {
  if (!myProfile?.is_admin) return;
  const list=await api('/api/admin/users');
  const tbody=document.getElementById('adminUsersTbody');
  if (!tbody||!Array.isArray(list)) return;
  tbody.innerHTML=list.map(u=>`
    <tr>
      <td>
        <div class="u-info">
          <div class="u-av"><canvas width="36" height="36" id="adAv${u.id}"></canvas></div>
          <div>
            <div class="u-name">${u.name||'—'}
              ${u.is_admin?'<span class="admin-badge">👑 Admin</span>':''}
            </div>
            <div class="u-email">${u.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="pill ${u.is_banned?'pill-red':u.is_admin?'pill-yellow':'pill-green'}">
          ${u.is_banned?'🚫 Bannato':u.is_admin?'👑 Admin':'✓ Attivo'}
        </span>
      </td>
      <td>${parseFloat(u.co2_saved||0).toFixed(1)} kg</td>
      <td>${Math.round(u.points||0)} pt</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-icon" title="Attività"
            onclick="openUserActs(${u.id},'${(u.name||'').replace(/'/g,'')}')">
            <i class="fas fa-list"></i>
          </button>
          <button class="btn-icon crown" title="Toggle Admin"
            onclick="adminAction('toggle_admin',${u.id})">
            <i class="fas fa-crown"></i>
          </button>
          <button class="btn-icon warn" title="Avvisa"
            onclick="adminAction('warn',${u.id})">
            <i class="fas fa-exclamation-triangle"></i>
          </button>
          <button class="btn-icon ${u.is_banned?'':'ban'}" title="${u.is_banned?'Sbanna':'Banna'}"
            onclick="adminAction('${u.is_banned?'unban':'ban'}',${u.id})">
            <i class="fas fa-${u.is_banned?'check':'ban'}"></i>
          </button>
          <button class="btn-icon reset" title="Reset punti"
            onclick="adminAction('reset_points',${u.id})">
            <i class="fas fa-redo"></i>
          </button>
          <button class="btn-icon del" title="Elimina"
            onclick="adminAction('delete',${u.id})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
  setTimeout(()=>list.forEach(u=>drawMii(u,`adAv${u.id}`,36)),60);
}

async function adminAction(action,userId) {
  const labels={
    ban:          ['⛔','Banna utente',    'Vuoi bannare questo utente?'],
    unban:        ['✅','Sbanna utente',   'Vuoi sbannare questo utente?'],
    delete:       ['🗑️','Elimina utente', '⚠️ Azione IRREVERSIBILE!'],
    toggle_admin: ['👑','Toggle Admin',   'Cambia il ruolo admin?'],
    warn:         ['⚠️','Avvisa utente',  'Invia un avviso ufficiale?'],
    reset_points: ['🔄','Reset punti',    'Azzera tutti i punti?']
  };
  const [icon,title,msg]=labels[action]||['❓','Azione','Sei sicuro?'];
  openConfirm(icon,title,msg,async()=>{
    const d=await api(`/api/admin/users/${userId}/${action}`,'POST');
    if (d.error) return showN('❌ '+d.error,'error');
    showN(`✅ ${title} eseguito!`);
    loadAdminUsers();
  });
}
window.adminAction=adminAction;

async function openUserActs(userId,name) {
  const modal=document.getElementById('userActsModal');
  const title=document.getElementById('userActsTitle');
  const body=document.getElementById('userActsBody');
  if (!modal) return;
  title.textContent=`Attività di ${name}`;
  body.innerHTML=`<div style="text-align:center;padding:30px">
    <i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--green)"></i></div>`;
  modal.style.display='flex';
  const list=await api(`/api/admin/users/${userId}/activities`);
  if (!Array.isArray(list)||!list.length) {
    body.innerHTML=`<div class="empty"><div class="ei">📋</div><p>Nessuna attività.</p></div>`;
    return;
  }
  body.innerHTML=list.map(a=>`
    <div class="adm-act-item">
      <div style="font-size:22px">${ICONS[a.type]||'📌'}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">
          ${a.type} — ${parseFloat(a.co2_saved).toFixed(2)} kg CO₂
        </div>
        <div style="font-size:11px;color:var(--muted)">
          ${new Date(a.date).toLocaleString('it-IT')}
          ${a.km>0?' · '+a.km+' km':''}
          ${a.hours>0?' · '+a.hours+'h':''}
        </div>
      </div>
      <button class="adm-act-del" onclick="deleteAct(${a.id},this)">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}
window.openUserActs=openUserActs;

async function deleteAct(actId,btn) {
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  const d=await api(`/api/admin/activities/${actId}`,'DELETE');
  if (d.error){ btn.innerHTML='<i class="fas fa-trash"></i>'; return showN('❌ '+d.error,'error'); }
  const item=btn.closest('.adm-act-item');
  if (item){ item.style.transition='opacity .3s'; item.style.opacity='0'; setTimeout(()=>item.remove(),300); }
  showN('🗑️ Attività eliminata','info');
}
window.deleteAct=deleteAct;

function closeUserActsModal() {
  const modal=document.getElementById('userActsModal');
  if (modal) modal.style.display='none';
}
window.closeUserActsModal=closeUserActsModal;

// ══════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════
let confirmCallback=null;
function openConfirm(icon,title,msg,cb) {
  confirmCallback=cb;
  document.getElementById('confirmIcon').textContent=icon;
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').textContent=msg;
  document.getElementById('confirmOverlay').style.display='flex';
}
function confirmYes() {
  document.getElementById('confirmOverlay').style.display='none';
  if (typeof confirmCallback==='function') confirmCallback();
  confirmCallback=null;
}
function confirmNo() {
  document.getElementById('confirmOverlay').style.display='none';
  confirmCallback=null;
}
window.openConfirm=openConfirm;
window.confirmYes=confirmYes;
window.confirmNo=confirmNo;

// ══════════════════════════════════════════
//   RICERCA UTENTI
// ══════════════════════════════════════════
function onSearchInput() {
  clearTimeout(searchTimer);
  const val=document.getElementById('searchInput')?.value?.trim();
  if (!val||val.length<2) {
    const el=document.getElementById('searchResults');
    if (el) el.innerHTML='';
    return;
  }
  searchTimer=setTimeout(()=>searchUsers(val),400);
}
window.onSearchInput=onSearchInput;

async function searchUsers(query) {
  const list=await api(`/api/users/search?q=${encodeURIComponent(query)}`);
  const el=document.getElementById('searchResults');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML=`<div class="empty" style="padding:20px">
      <div class="ei">🔍</div><p>Nessun utente trovato.</p></div>`;
    return;
  }
  el.innerHTML=list.map(u=>userCardHTML(u,u.is_following)).join('');
  setTimeout(()=>list.forEach(u=>drawMii(u,`ucAv${u.id}`,44)),60);
}

// ══════════════════════════════════════════
//   CSS DINAMICO per nuovi elementi
// ══════════════════════════════════════════
function injectExtraStyles() {
  const style=document.createElement('style');
  style.textContent=`
    /* MAP BUTTONS */
    .map-sat-btn,.map-geo-btn,.map-reset-btn {
      background:var(--card,#1e293b);color:var(--text,'#f1f5f9');
      border:1.5px solid var(--border,'rgba(255,255,255,.1)');
      padding:6px 12px;border-radius:8px;cursor:pointer;
      font-size:12px;font-weight:600;margin-bottom:4px;
      box-shadow:0 2px 8px rgba(0,0,0,.3);transition:.2s;
      display:block;
    }
    .map-sat-btn:hover,.map-geo-btn:hover,.map-reset-btn:hover{ filter:brightness(1.2); }
    .map-sat-btn.active{ background:var(--green,'#16a34a');border-color:var(--green,'#16a34a'); }

    /* GROUP LEADERBOARD */
    .gc-lb-toggle {
      display:flex;align-items:center;gap:8px;
      padding:10px 16px;cursor:pointer;font-size:13px;
      font-weight:600;color:var(--muted);border-top:1px solid var(--border);
      transition:.2s;user-select:none;
    }
    .gc-lb-toggle:hover{ color:var(--text);background:rgba(255,255,255,.03); }
    .gc-lb-list{ padding:8px 12px 12px; }
    .gc-lb-row {
      display:flex;align-items:center;gap:10px;
      padding:8px 6px;border-radius:8px;transition:.15s;
    }
    .gc-lb-row:hover{ background:rgba(255,255,255,.04); }
    .gc-lb-rank{ font-size:16px;width:28px;text-align:center; }
    .gc-lb-av canvas{ border-radius:50%; }
    .gc-lb-name{ flex:1;display:flex;flex-direction:column; }
    .gc-lb-uname{ font-size:13px;font-weight:600; }
    .gc-lb-username{ font-size:11px;color:var(--muted); }
    .gc-lb-co2{ font-size:12px;color:#10b981;font-weight:700; }
    .gc-lb-pts{ font-size:12px;color:#fbbf24;font-weight:700; }

    /* INVITE CODE PILL */
    .invite-code-pill {
      background:rgba(99,102,241,.15);color:#818cf8;
      padding:2px 8px;border-radius:20px;font-size:11px;
      font-weight:700;font-family:monospace;letter-spacing:1px;
    }

    /* INVITE MODAL */
    #inviteModal {
      position:fixed;inset:0;background:rgba(0,0,0,.7);
      display:none;align-items:center;justify-content:center;z-index:1000;
    }
    .invite-modal-box {
      background:var(--card);border-radius:16px;
      width:min(440px,95vw);max-height:80vh;
      display:flex;flex-direction:column;overflow:hidden;
      border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.5);
    }
    .invite-modal-head {
      padding:20px;border-bottom:1px solid var(--border);
      display:flex;align-items:center;justify-content:space-between;
    }
    .invite-modal-head h3{ font-size:15px;font-weight:700; }
    .invite-modal-body{ overflow-y:auto;padding:12px; }
    .invite-modal-foot{
      padding:14px 16px;border-top:1px solid var(--border);
      display:flex;gap:10px;align-items:center;
    }
    .invite-follower-row {
      display:flex;align-items:center;gap:10px;
      padding:10px 8px;border-radius:10px;cursor:pointer;
      transition:.15s;
    }
    .invite-follower-row:hover{ background:rgba(255,255,255,.05); }
    .invite-follower-row input[type=checkbox]{ width:16px;height:16px;accent-color:var(--green); }
    .if-av canvas{ border-radius:50%; }
    .if-info{ flex:1; }
    .if-name{ font-size:13px;font-weight:600; }
    .if-user{ font-size:11px;color:var(--muted); }
    #sendInviteBtn {
      flex:1;background:var(--green);color:white;
      border:none;padding:10px;border-radius:10px;
      font-weight:700;font-size:13px;cursor:pointer;transition:.2s;
    }
    #sendInviteBtn:hover{ filter:brightness(1.1); }

    /* JOIN CODE INPUT */
    .join-code-wrap {
      display:flex;gap:8px;margin-top:12px;
    }
    .join-code-wrap input {
      flex:1;padding:10px 14px;border-radius:10px;
      border:1.5px solid var(--border);background:var(--input,rgba(255,255,255,.07));
      color:var(--text);font-size:13px;font-family:monospace;letter-spacing:2px;
      text-transform:uppercase;
    }
    .join-code-wrap input:focus{ outline:none;border-color:var(--green); }
    .btn-invite-followers {
      background:rgba(99,102,241,.15);color:#818cf8;
      border:1px solid rgba(99,102,241,.3);
      padding:6px 12px;border-radius:8px;
      font-size:12px;font-weight:600;cursor:pointer;transition:.2s;
    }
    .btn-invite-followers:hover{ background:rgba(99,102,241,.25); }
  `;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════
//   AUTO-INIT
// ══════════════════════════════════════════
async function autoInit() {
  injectExtraStyles();
  if (!token) return;
  const d=await api('/api/profile');
  if (d.error||!d.id) {
    localStorage.removeItem('ecotoken');
    token=null;
    return;
  }
  bootApp(d);
}

autoInit();

}); // end DOMContentLoaded
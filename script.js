'use strict';
document.addEventListener('DOMContentLoaded', () => {

// Funzioni di compatibilità
function switchAuthTab(tab) {
    switchTab(tab);
}

function checkPasswordStrength() {
    const pwd = document.getElementById('registerPassword')?.value || '';
    checkPwdStrength(pwd);
}

function checkResetPasswordStrength() {
    const pwd = document.getElementById('resetPassword')?.value || '';
    checkPwdStrength(pwd);
}

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
let geocodeTimer = null;
let shopData   = { items:[], owned:[], points:0 };
let tutStep    = 0;

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

// ✅ FIX: profilo OSRM corretto per ogni mezzo
const OSRM_PROFILE = {
  Bici:       'bike',
  Treno:      'driving',
  Bus:        'driving',
  Carpooling: 'driving'
};

const CO2_MILESTONES = [10,50,100,250,500,1000];

// ══════════════════════════════════════════
//   API HELPER
// ══════════════════════════════════════════
async function api(url, method='GET', body=null) {
  try {
    const opts = {
      method,
      headers: {
        'Content-Type':'application/json',
        ...(token ? { Authorization:`Bearer ${token}` } : {})
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const r   = await fetch(API + url, opts);
    const txt = await r.text();
    if (!txt) return {};
    try { return JSON.parse(txt); }
    catch { return { error: txt }; }
  } catch(e) {
    console.error('API error:', url, e);
    return { error: e.message };
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
  setTimeout(() => { el.style.display = 'none'; }, 2800);
}

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display    = tab==='login'    ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'flex' : 'none';
  document.getElementById('lErr').textContent = '';
  document.getElementById('rErr').textContent = '';
}
window.switchTab = switchTab;

function togglePwd(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const show = el.type === 'password';
  el.type    = show ? 'text' : 'password';
  btn.innerHTML = `<i class="fas fa-eye${show?'-slash':''}"></i>`;
}
window.togglePwd = togglePwd;

function checkPwd(val) {
  const rules = [
    { id:'ph1', ok: val.length >= 8 },
    { id:'ph2', ok: /[A-Z]/.test(val) },
    { id:'ph3', ok: /[0-9]/.test(val) },
    { id:'ph4', ok: /[^A-Za-z0-9]/.test(val) }
  ];
  rules.forEach(r => {
    const el = document.getElementById(r.id);
    if (el) el.classList.toggle('ok', r.ok);
  });
}
window.checkPwd = checkPwd;

async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('lEmail').value.trim();
  const pwd   = document.getElementById('lPwd').value;
  const err   = document.getElementById('lErr');
  const btn   = e.target.querySelector('.btn-auth');

  if (!email || !pwd) { err.textContent='Compila tutti i campi'; return; }
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Accesso...</span>';
  btn.disabled  = true;

  const d = await api('/api/login','POST',{ email, password:pwd });
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Accedi</span>';
  btn.disabled  = false;

  if (d.error) {
    err.textContent = d.error;
    document.getElementById('lPwd').classList.add('shake');
    setTimeout(() => document.getElementById('lPwd').classList.remove('shake'), 600);
    return;
  }
  token = d.token;
  localStorage.setItem('ecotoken', token);
  bootApp(d.user);
}
window.doLogin = doLogin;

async function doRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('rName').value.trim();
  const username = document.getElementById('rUsername').value.trim();
  const email    = document.getElementById('rEmail').value.trim();
  const pwd      = document.getElementById('rPwd').value;
  const err      = document.getElementById('rErr');
  const btn      = e.target.querySelector('.btn-auth');

  if (!name||!username||!email||!pwd) { err.textContent='Compila tutti i campi'; return; }
  if (pwd.length < 8) { err.textContent='Password troppo corta (min 8 caratteri)'; return; }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Registrazione...</span>';
  btn.disabled  = true;

  const d = await api('/api/register','POST',{ name, username, email, password:pwd });
  btn.innerHTML = '<i class="fas fa-user-plus"></i><span>Registrati</span>';
  btn.disabled  = false;

  if (d.error) { err.textContent = d.error; return; }
  token = d.token;
  localStorage.setItem('ecotoken', token);
  bootApp(d.user);
  setTimeout(() => showTutorial(), 500);
}
window.doRegister = doRegister;

function doLogout(e) {
  e?.stopPropagation();
  token = null;
  localStorage.removeItem('ecotoken');
  myProfile = null;
  mapInited = false;
  map = null;
  document.getElementById('authWrap').style.display = 'flex';
  document.getElementById('app').style.display      = 'none';
  showN('👋 Arrivederci!','info');
}
window.doLogout = doLogout;

// ══════════════════════════════════════════
//   BOOT APP
// ══════════════════════════════════════════
function bootApp(user) {
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('app').style.display      = 'flex';
  myProfile = user;

  if (window.innerWidth <= 768)
    document.getElementById('mobNav').style.display = 'flex';

  if (user.is_admin) {
    document.getElementById('adminNavBtn').style.display  = 'block';
    document.getElementById('sbAdminBadge').style.display = 'inline-flex';
  }

  document.getElementById('sbEmail').textContent = user.email || '';
  showTab('dashboard', null);
  loadAll();
}

// ══════════════════════════════════════════
//   LOAD ALL
// ══════════════════════════════════════════
async function loadAll() {
  await Promise.all([
    loadProfile(),
    loadStats(),
    loadActivities(),
    loadBadges(),
    loadYearly(),
    loadNotifications()
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
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`tab-${name}`);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.mn-btn').forEach(b => b.classList.remove('active'));
  if (btn && btn.classList.contains('mn-btn')) btn.classList.add('active');

  const [title, sub] = TAB_TITLES[name] || [name,''];
  document.getElementById('topTitle').textContent = title;
  document.getElementById('topSub').textContent   = sub;

  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'challenges')  loadChallenges();
  if (name === 'social')      { loadFollowers(); loadFollowing(); loadGroups(); }
  if (name === 'notifiche')   loadNotificationsPage();
  if (name === 'admin')       loadAdminUsers();
  if (name === 'shop')        loadShop();
  if (name === 'log') {
    setTimeout(() => {
      if (!mapInited && curAct && ['Treno','Bici','Bus','Carpooling'].includes(curAct))
        initMap();
    }, 100);
  }

  window.scrollTo({ top:0, behavior:'smooth' });
}
window.showTab = showTab;

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
function showTutorial() {
  tutStep = 0;
  document.getElementById('tutOverlay').style.display = 'flex';
  updateTutStep();
}
function closeTut() {
  document.getElementById('tutOverlay').style.display = 'none';
}
function tutNav(dir) {
  const max = 4;
  tutStep = Math.max(0, Math.min(max, tutStep + dir));
  updateTutStep();
  const nextBtn = document.querySelector('.tut-next');
  const prevBtn = document.querySelector('.tut-prev');
  if (nextBtn) nextBtn.textContent = tutStep === max ? 'Inizia! 🚀' : 'Avanti →';
  if (prevBtn) {
    prevBtn.style.opacity       = tutStep === 0 ? '0' : '1';
    prevBtn.style.pointerEvents = tutStep === 0 ? 'none' : 'auto';
  }
  if (tutStep > max) closeTut();
}
function goTut(n) { tutStep = n; updateTutStep(); }
function updateTutStep() {
  document.querySelectorAll('.tut-step').forEach((s,i) => s.classList.toggle('active', i===tutStep));
  document.querySelectorAll('.tut-dot').forEach((d,i)  => d.classList.toggle('active', i===tutStep));
}
window.closeTut = closeTut; window.tutNav = tutNav; window.goTut = goTut;
window.showTutorial = showTutorial;

// ══════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════
async function loadProfile() {
  const d = await api('/api/profile');
  if (d.error) return;
  myProfile = d;

  document.getElementById('pName').value     = d.name     || '';
  document.getElementById('pUsername').value = d.username || '';
  document.getElementById('pBio').value      = d.bio      || '';

  const sbName = document.getElementById('sbName');
  if (sbName) sbName.childNodes[0].textContent = (d.name || d.email) + ' ';
  document.getElementById('sbEmail').textContent = '@' + (d.username || d.email);

  document.getElementById('topCo2').textContent = parseFloat(d.co2_saved||0).toFixed(1);
  document.getElementById('topPts').textContent = Math.round(d.points||0);

  updateSidebarCo2(d.co2_saved || 0);

  const ps = document.getElementById('profileStats');
  if (ps) ps.innerHTML = `
    <div class="ps-item">
      <div class="ps-val">${Math.round(d.points||0)}</div>
      <div class="ps-lbl">Punti</div>
    </div>
    <div class="ps-item">
      <div class="ps-val">${parseFloat(d.co2_saved||0).toFixed(1)}</div>
      <div class="ps-lbl">kg CO₂</div>
    </div>
    <div class="ps-item">
      <div class="ps-val">${d.followers||0}</div>
      <div class="ps-lbl">Follower</div>
    </div>`;

  miiState = {
    color: d.avatar_color || '#16a34a',
    skin:  d.avatar_skin  || '#fde68a',
    eyes:  d.avatar_eyes  || 'normal',
    mouth: d.avatar_mouth || 'smile',
    hair:  d.avatar_hair  || 'none',
    ownedItems: d.owned_items || []
  };

  renderMiiBuilder();
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
}

function updateSidebarCo2(co2) {
  const val  = parseFloat(co2) || 0;
  const next = CO2_MILESTONES.find(m => m > val) || CO2_MILESTONES[CO2_MILESTONES.length-1];
  const prev = CO2_MILESTONES.filter(m => m <= val).pop() || 0;
  const pct  = Math.min(100, ((val - prev) / (next - prev)) * 100);

  const fill = document.getElementById('sbCo2Fill');
  const lbl  = document.getElementById('sbCo2Val');
  const nxt  = document.getElementById('sbCo2Next');
  if (fill) fill.style.width = pct + '%';
  if (lbl)  lbl.textContent  = val.toFixed(1) + ' kg';
  if (nxt) {
    nxt.textContent = val < CO2_MILESTONES[CO2_MILESTONES.length-1]
      ? `Prossimo badge: ${next} kg`
      : '🏆 Tutti i badge sbloccati!';
  }
}

async function saveProfile() {
  const payload = {
    name:         document.getElementById('pName').value.trim(),
    username:     document.getElementById('pUsername').value.trim(),
    bio:          document.getElementById('pBio').value.trim(),
    avatar_color: miiState.color,
    avatar_eyes:  miiState.eyes,
    avatar_mouth: miiState.mouth,
    avatar_hair:  miiState.hair,
    avatar_skin:  miiState.skin
  };
  const d = await api('/api/profile','PATCH', payload);
  if (d.error) return showN('❌ ' + d.error,'error');
  showN('✅ Profilo salvato!','success');
  loadProfile();
}
window.saveProfile = saveProfile;

// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
async function loadStats() {
  const d = await api('/api/stats');
  if (d.error) return;

  const co2Total = parseFloat(d.co2_total || 0);
  const co2Week  = parseFloat(d.co2_week  || 0);
  const co2Month = parseFloat(d.co2_month || 0);

  const heroVal = document.getElementById('heroCo2');
  if (heroVal) heroVal.textContent = co2Total.toFixed(1);

  const trees   = Math.round(co2Total / 21);
  const heroSub = document.getElementById('heroCo2Sub');
  if (heroSub) heroSub.textContent = co2Total > 0
    ? `Equivale a ${trees} alber${trees===1?'o':'i'} piantati 🌳`
    : 'Inizia a tracciare le tue azioni eco!';

  const next = CO2_MILESTONES.find(m => m > co2Total) || CO2_MILESTONES[CO2_MILESTONES.length-1];
  const prev = CO2_MILESTONES.filter(m => m <= co2Total).pop() || 0;
  const pct  = Math.min(100, ((co2Total - prev) / (next - prev)) * 100);
  const fill = document.getElementById('heroCo2Fill');
  if (fill) setTimeout(() => fill.style.width = pct + '%', 100);
  const tgt = document.getElementById('heroCo2Target');
  if (tgt) tgt.textContent = `/ ${next} kg`;

  if (document.getElementById('heroCo2Week'))  document.getElementById('heroCo2Week').textContent  = co2Week.toFixed(2);
  if (document.getElementById('heroCo2Month')) document.getElementById('heroCo2Month').textContent = co2Month.toFixed(2);

  const planet = document.getElementById('co2Planet');
  if (planet) {
    if      (co2Total >= 500) planet.textContent = '🌳';
    else if (co2Total >= 100) planet.textContent = '🌎';
    else if (co2Total >= 50)  planet.textContent = '🌍';
    else if (co2Total >= 10)  planet.textContent = '🌱';
    else                      planet.textContent = '🌍';
  }

  if (document.getElementById('sPts'))  document.getElementById('sPts').textContent  = Math.round(d.points||0);
  if (document.getElementById('sWeek')) document.getElementById('sWeek').textContent = co2Week.toFixed(2);
  if (document.getElementById('sActs')) document.getElementById('sActs').textContent = d.total_activities||0;
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
async function loadActivities() {
  const list = await api('/api/activities');
  if (!Array.isArray(list)) return;

  const ra = document.getElementById('recentActs');
  if (ra) {
    ra.innerHTML = list.length
      ? list.slice(0,5).map(a => actHTML(a)).join('')
      : `<div class="empty"><div class="ei">🌱</div><p>Nessuna attività ancora.<br>Registra la tua prima azione eco!</p></div>`;
  }

  const aa = document.getElementById('allActs');
  if (aa) {
    aa.innerHTML = list.length
      ? list.map(a => actHTML(a)).join('')
      : `<div class="empty"><div class="ei">📋</div><p>Nessuna attività registrata.</p></div>`;
  }
}

function actHTML(a) {
  const d    = new Date(a.date);
  const dStr = d.toLocaleDateString('it-IT',{day:'2-digit',month:'short'}) + ' ' +
               d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  const sub  = a.km > 0
    ? `${a.from_addr||''} ${a.to_addr?'→ '+a.to_addr:''} · ${a.km} km`.trim()
    : a.hours > 0 ? `${a.hours}h` : '';
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
//   BADGES
// ══════════════════════════════════════════
async function loadBadges() {
  const list = await api('/api/badges');
  if (!Array.isArray(list)) return;
  const el = document.getElementById('badgeList');
  if (!el) return;
  el.innerHTML = list.map(b => `
    <div class="badge-item ${b.unlocked?'on':'off'}">
      <div class="badge-icon">${b.icon}</div>
      <div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════
//   YEARLY
// ══════════════════════════════════════════
async function loadYearly() {
  const list = await api('/api/yearly');
  const el   = document.getElementById('yearlyChart');
  if (!el || !Array.isArray(list)) return;
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">📊</div><p>Nessun dato annuale ancora.</p></div>`;
    return;
  }
  const max = Math.max(...list.map(r => parseFloat(r.co2)));
  el.innerHTML = list.map(r => {
    const co2 = parseFloat(r.co2);
    const pct = max > 0 ? (co2/max)*100 : 0;
    return `
      <div class="yr-row">
        <div class="yr-month">${r.month}</div>
        <div class="yr-bar">
          <div class="yr-fill" style="width:0" data-w="${pct}"></div>
        </div>
        <div class="yr-co2">${co2.toFixed(1)} kg</div>
        <div class="yr-pts">⭐ ${Math.round(r.points)}</div>
      </div>`;
  }).join('');
  setTimeout(() => {
    el.querySelectorAll('.yr-fill').forEach(f => f.style.width = f.dataset.w + '%');
  }, 80);
}

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLeaderboard() {
  const list = await api('/api/leaderboard');
  const el   = document.getElementById('lbList');
  if (!el || !Array.isArray(list)) return;
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">🏆</div><p>Nessun dato in classifica.</p></div>`;
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = list.map((u,i) => `
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
  setTimeout(() => list.forEach(u => drawMii(u,`lbAv${u.id}`,40)), 60);
}

// ══════════════════════════════════════════
//   CHALLENGES ✅ FIXED
// ══════════════════════════════════════════
async function loadChallenges() {
  const list = await api('/api/challenges');
  const el   = document.getElementById('chList');
  if (!el) return;
  if (!Array.isArray(list) || !list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">🏆</div><p>Nessuna sfida ancora. Creane una!</p></div>`;
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="ch-item">
      <div class="ch-ico">🏆</div>
      <div class="ch-info">
        <h4>${c.title}</h4>
        <p>${c.description||'Nessuna descrizione.'}</p>
        <div class="ch-tags">
          ${c.co2_target>0    ? `<span class="ch-tag">🌍 Obiettivo: ${c.co2_target} kg CO₂</span>`   : ''}
          ${c.points_reward>0 ? `<span class="ch-tag">⭐ Premio: ${c.points_reward} pt</span>`        : ''}
          ${c.end_date        ? `<span class="ch-tag">📅 Scade: ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>` : ''}
          ${c.is_public       ? `<span class="ch-tag">🌐 Pubblica</span>`                              : ''}
          ${c.creator_name    ? `<span class="ch-tag">👤 ${c.creator_name}</span>`                    : ''}
        </div>
      </div>
    </div>`).join('');
}

function toggleChForm() {
  const f = document.getElementById('chForm');
  f.style.display = f.style.display==='none' ? 'block' : 'none';
}
window.toggleChForm = toggleChForm;

async function saveChallenge() {
  const title = document.getElementById('chTitle').value.trim();
  if (!title) return showN('❌ Inserisci un titolo per la sfida','error');

  const d = await api('/api/challenges','POST',{
    title,
    description:   document.getElementById('chDesc').value,
    co2_target:    parseFloat(document.getElementById('chCo2').value)||0,
    points_reward: parseInt(document.getElementById('chPts').value)||0,
    end_date:      document.getElementById('chDate').value||null,
    is_public:     document.getElementById('chPublic').checked
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Sfida creata!','success');
  document.getElementById('chForm').style.display = 'none';
  // Reset form
  ['chTitle','chDesc','chCo2','chPts','chDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadChallenges();
}
window.saveChallenge = saveChallenge;

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
async function loadFollowers() {
  const list = await api('/api/followers');
  const el   = document.getElementById('followersList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">👥</div><p>Nessun follower ancora.</p></div>`;
    return;
  }
  el.innerHTML = list.map(u => userCardHTML(u, false)).join('');
  setTimeout(() => list.forEach(u => drawMii(u,`ucAv${u.id}`,44)), 60);
}

async function loadFollowing() {
  const list = await api('/api/following');
  const el   = document.getElementById('followingList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">👤</div><p>Non segui ancora nessuno.</p></div>`;
    return;
  }
  el.innerHTML = list.map(u => userCardHTML(u, true)).join('');
  setTimeout(() => list.forEach(u => drawMii(u,`ucAv${u.id}`,44)), 60);
}

function userCardHTML(u, isFollowing) {
  return `
    <div class="user-card">
      <div class="uc-av"><canvas width="44" height="44" id="ucAv${u.id}"></canvas></div>
      <div class="uc-info">
        <div class="uc-name">${u.name||'Utente'}</div>
        <div class="uc-username">@${u.username||'—'}</div>
        <div class="uc-pts">⭐ ${Math.round(u.points||0)} pt</div>
      </div>
      <button class="btn-follow ${isFollowing?'following':''}"
        onclick="toggleFollow(${u.id},${isFollowing},this)">
        ${isFollowing?'✓ Seguito':'+ Segui'}
      </button>
    </div>`;
}

async function toggleFollow(userId, isFollowing, btn) {
  const d = await api(`/api/follow/${userId}`, isFollowing?'DELETE':'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  if (isFollowing) {
    btn.textContent = '+ Segui';
    btn.classList.remove('following');
    btn.onclick = () => toggleFollow(userId, false, btn);
  } else {
    btn.textContent = '✓ Seguito';
    btn.classList.add('following');
    btn.onclick = () => toggleFollow(userId, true, btn);
  }
}
window.toggleFollow = toggleFollow;

async function loadGroups() {
  const list = await api('/api/groups');
  const el   = document.getElementById('groupList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">👥</div><p>Nessun gruppo ancora. Creane uno!</p></div>`;
    return;
  }
  el.innerHTML = list.map(g => `
    <div class="group-card">
      <div class="group-icon">👥</div>
      <div class="group-info">
        <div class="group-name">${g.name}</div>
        <div class="group-desc">${g.description||''}</div>
        <div class="group-meta">👤 ${g.member_count} membri · ${g.is_public?'🌐 Pubblico':'🔒 Privato'}</div>
      </div>
      <button class="btn-join ${g.is_member?'leave':''}"
        onclick="toggleGroup(${g.id},${g.is_member},this)">
        ${g.is_member?'Abbandona':'Unisciti'}
      </button>
    </div>`).join('');
}

async function toggleGroup(id, isMember) {
  const d = await api(`/api/groups/${id}/${isMember?'leave':'join'}`, isMember?'DELETE':'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  loadGroups();
}
window.toggleGroup = toggleGroup;

function toggleGroupForm() {
  const f = document.getElementById('groupForm');
  f.style.display = f.style.display==='none' ? 'block' : 'none';
}
window.toggleGroupForm = toggleGroupForm;

async function createGroup() {
  const name = document.getElementById('gName').value.trim();
  if (!name) return showN('❌ Inserisci un nome per il gruppo','error');
  const d = await api('/api/groups','POST',{
    name,
    description: document.getElementById('gDesc').value,
    is_public:   document.getElementById('gPublic').checked
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Gruppo creato!','success');
  document.getElementById('groupForm').style.display = 'none';
  document.getElementById('gName').value = '';
  document.getElementById('gDesc').value = '';
  loadGroups();
}
window.createGroup = createGroup;

// ══════════════════════════════════════════
//   NOTIFICHE
// ══════════════════════════════════════════
async function loadNotifications() {
  const list = await api('/api/notifications');
  if (!Array.isArray(list)) return;
  const unread = list.filter(n => !n.is_read).length;
  const dot    = document.getElementById('sbNotifDot');
  const count  = document.getElementById('notifCount');
  if (dot)   dot.style.display   = unread > 0 ? 'block' : 'none';
  if (count) {
    count.style.display = unread > 0 ? 'flex' : 'none';
    count.textContent   = unread > 9 ? '9+' : unread;
  }
}

async function loadNotificationsPage() {
  const list = await api('/api/notifications');
  const el   = document.getElementById('notifList');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">🔔</div><p>Nessuna notifica.</p></div>`;
    return;
  }
  const typeIcon = { follow:'👥', warn:'⚠️', ban:'⛔', unban:'✅', carsharing:'🚗', shop:'🛍️', badge:'🏅' };
  el.innerHTML = list.map(n => `
    <div class="notif-item ${n.is_read?'':'unread'}">
      <div class="notif-item-icon ni-${n.type}">${typeIcon[n.type]||'🔔'}</div>
      <div>
        <div class="notif-item-msg">${n.message}</div>
        <div class="notif-item-time">${new Date(n.created_at).toLocaleString('it-IT')}</div>
      </div>
    </div>`).join('');
  await api('/api/notifications/read','PATCH');
  loadNotifications();
}

async function markAllRead() {
  await api('/api/notifications/read','PATCH');
  loadNotificationsPage();
  loadNotifications();
  showN('✅ Tutte le notifiche lette','info');
}
window.markAllRead = markAllRead;
// ══════════════════════════════════════════
//   SHOP ✅ FIXED
// ══════════════════════════════════════════
async function loadShop() {
  const d = await api('/api/shop');
  if (d.error) return showN('❌ '+d.error,'error');
  shopData = d;

  const shopPts = document.getElementById('shopUserPts');
  if (shopPts) shopPts.textContent = Math.round(d.points||0);

  drawMii(miiState,'shopPreviewCanvas',100);
  renderShop('all');
}

function filterShop(cat, btn) {
  document.querySelectorAll('.shop-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderShop(cat);
}
window.filterShop = filterShop;

function renderShop(cat) {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  const items = cat === 'all'
    ? shopData.items
    : shopData.items.filter(i => i.category === cat);

  if (!items || !items.length) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="ei">🛍️</div>
        <p>Nessun item in questa categoria.</p>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(item => {
    const owned   = shopData.owned.includes(item.id);
    const canBuy  = !owned && shopData.points >= item.cost;
    const isColor = item.category === 'color' || item.category === 'skin';

    return `
      <div class="shop-item ${item.is_rare?'rare':''} ${owned?'owned':''}">
        ${isColor
          ? `<div style="
              width:60px;height:60px;border-radius:50%;
              background:${item.value};
              margin:0 auto 12px;
              border:3px solid ${owned?'var(--green2)':'var(--border)'};
              box-shadow:0 4px 12px rgba(0,0,0,.1)">
            </div>`
          : `<span class="shop-item-emoji">${item.emoji||'🎁'}</span>`
        }
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.description}</div>
        <div class="shop-item-cost">
          <i class="fas fa-star"></i> ${item.cost} pt
        </div>
        ${owned
          ? `<button class="btn-buy owned-btn"
               onclick="equipItem(${item.id},'${item.category}','${item.value}')">
               <i class="fas fa-tshirt"></i> Equipaggia
             </button>`
          : `<button class="btn-buy" ${canBuy?'':'disabled'}
               onclick="${canBuy ? `buyItem(${item.id})` : ''}">
               ${canBuy
                 ? `<i class="fas fa-shopping-cart"></i> Acquista`
                 : shopData.points < item.cost
                   ? `<i class="fas fa-lock"></i> Mancano ${item.cost - Math.round(shopData.points)} pt`
                   : `<i class="fas fa-check"></i> Già tuo`
               }
             </button>`
        }
      </div>`;
  }).join('');
}

async function buyItem(itemId) {
  const item = shopData.items.find(i => i.id === itemId);
  if (!item) return;

  openConfirm('🛍️', `Acquista "${item.name}"`,
    `Costerà ${item.cost} punti. Hai ${Math.round(shopData.points)} pt disponibili.`,
    async () => {
      const d = await api(`/api/shop/buy/${itemId}`,'POST');
      if (d.error) return showN('❌ '+d.error,'error');

      shopData.owned.push(itemId);
      shopData.points -= item.cost;

      const shopPts = document.getElementById('shopUserPts');
      if (shopPts) shopPts.textContent = Math.round(shopData.points);
      document.getElementById('topPts').textContent = Math.round(shopData.points);

      if (miiState) miiState.ownedItems = shopData.owned;
      renderMiiBuilder();

      const activeTab = document.querySelector('.shop-tab.active');
      const activeCat = activeTab ? (
        activeTab.textContent.trim().toLowerCase().includes('tutti') ? 'all' : item.category
      ) : 'all';
      renderShop(activeCat);

      showN(`🛍️ "${item.name}" acquistato! Vai su Profilo → Avatar Builder per equipaggiarlo.`,'success');
    }
  );
}
window.buyItem = buyItem;

function equipItem(itemId, category, value) {
  const catMap = {
    hair:  'hair',
    eyes:  'eyes',
    mouth: 'mouth',
    color: 'color',
    skin:  'skin'
  };
  const key = catMap[category];
  if (!key) return showN('❌ Categoria non riconosciuta','error');

  miiState[key] = value;

  // Ridisegna avatar ovunque
  ['miiCanvas','sbAvatarCanvas','shopPreviewCanvas'].forEach(id => {
    const c = document.getElementById(id);
    if (c) drawMii(miiState, id, c.width);
  });

  renderMiiBuilder();
  showN(`✨ "${category}" equipaggiato! Premi Salva Profilo per mantenere il look.`,'success');
}
window.equipItem = equipItem;

// ══════════════════════════════════════════
//   MII AVATAR BUILDER
// ══════════════════════════════════════════
const AVATAR_COLORS = ['#16a34a','#3b82f6','#8b5cf6','#ef4444','#f59e0b','#ec4899','#14b8a6','#f97316'];
const SKIN_COLORS   = ['#fde68a','#fcd9a0','#d4a76a','#a0714a','#7c4a2d','#f5cba7','#e8a87c','#c68642'];
const EYE_OPTS      = ['normal','happy','sleepy','surprised','wink','cool'];
const MOUTH_OPTS    = ['smile','grin','open','sad','smirk','tongue'];
const HAIR_OPTS     = ['none','short','long','curly','bun','mohawk','wavy','cap'];
const PREMIUM_EYES  = ['star','heart','laser'];
const PREMIUM_MOUTH = ['rainbow','fire'];
const PREMIUM_HAIR  = ['rainbow','gold','galaxy','flame'];

let miiState = {
  color:'#16a34a', skin:'#fde68a',
  eyes:'normal', mouth:'smile', hair:'none',
  ownedItems:[]
};

function getOwnedValues(category) {
  if (!shopData.items.length) return [];
  return shopData.items
    .filter(i => i.category === category && shopData.owned.includes(i.id))
    .map(i => i.value);
}

function setMii(key, val, el) {
  miiState[key] = val;
  if (el) {
    el.closest('.mii-btn-row,.color-row')
      ?.querySelectorAll('.active')
      .forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }
  ['miiCanvas','sbAvatarCanvas','shopPreviewCanvas'].forEach(id => {
    const c = document.getElementById(id);
    if (c) drawMii(miiState, id, c.width);
  });
}
window.setMii = setMii;

function renderMiiBuilder() {
  const ownedColors = getOwnedValues('color');
  const ownedSkins  = getOwnedValues('skin');
  const ownedEyes   = getOwnedValues('eyes');
  const ownedMouths = getOwnedValues('mouth');
  const ownedHairs  = getOwnedValues('hair');

  // Colori avatar
  const acEl = document.getElementById('avatarColors');
  if (acEl) acEl.innerHTML = [...new Set([...AVATAR_COLORS,...ownedColors])].map(c => `
    <div class="color-swatch ${miiState.color===c?'active':''}"
      style="background:${c}"
      onclick="setMii('color','${c}',this)">
    </div>`).join('');

  // Pelle
  const scEl = document.getElementById('skinColors');
  if (scEl) scEl.innerHTML = [...new Set([...SKIN_COLORS,...ownedSkins])].map(c => `
    <div class="color-swatch ${miiState.skin===c?'active':''}"
      style="background:${c}"
      onclick="setMii('skin','${c}',this)">
    </div>`).join('');

  // Capelli
  const haEl = document.getElementById('hairOpts');
  if (haEl) haEl.innerHTML = [
    ...HAIR_OPTS.map(o => buildMiiBtn('hair',o,false)),
    ...PREMIUM_HAIR.map(o => buildMiiBtn('hair',o,!ownedHairs.includes(o)))
  ].join('');

  // Occhi
  const eyEl = document.getElementById('eyeOpts');
  if (eyEl) eyEl.innerHTML = [
    ...EYE_OPTS.map(o => buildMiiBtn('eyes',o,false)),
    ...PREMIUM_EYES.map(o => buildMiiBtn('eyes',o,!ownedEyes.includes(o)))
  ].join('');

  // Bocca
  const moEl = document.getElementById('mouthOpts');
  if (moEl) moEl.innerHTML = [
    ...MOUTH_OPTS.map(o => buildMiiBtn('mouth',o,false)),
    ...PREMIUM_MOUTH.map(o => buildMiiBtn('mouth',o,!ownedMouths.includes(o)))
  ].join('');
}

function buildMiiBtn(type, val, locked) {
  const EMOJIS = {
    none:'🙅',short:'💇',long:'💆',curly:'🌀',bun:'🎀',
    mohawk:'⚡',wavy:'〰️',cap:'🧢',rainbow:'🌈',gold:'✨',
    galaxy:'🌌',flame:'🔥',
    normal:'😐',happy:'😊',sleepy:'😴',surprised:'😲',
    wink:'😉',cool:'😎',star:'⭐',heart:'❤️',laser:'🔴',
    smile:'🙂',grin:'😁',open:'😮',sad:'🙁',smirk:'😏',
    tongue:'😛',fire:'🔥'
  };
  const active = miiState[type] === val;
  if (locked) {
    return `<button class="mii-opt-btn locked"
      title="Acquista nello Shop!"
      onclick="showTab('shop',null)">
      ${EMOJIS[val]||'?'} ${val}
    </button>`;
  }
  return `<button class="mii-opt-btn ${active?'active':''}"
    onclick="setMii('${type}','${val}',this)">
    ${EMOJIS[val]||'?'} ${val}
  </button>`;
}

// ══════════════════════════════════════════
//   DRAW MII (Canvas)
// ══════════════════════════════════════════
function drawMii(user, canvasId, size=120, canvasEl=null) {
  const canvas = canvasEl || document.getElementById(canvasId);
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size/2, cy = size/2, r = size/2;

  const color = user?.color || user?.avatar_color || miiState?.color || '#16a34a';
  const skin  = user?.skin  || user?.avatar_skin  || miiState?.skin  || '#fde68a';
  const eyes  = user?.eyes  || user?.avatar_eyes  || miiState?.eyes  || 'normal';
  const mouth = user?.mouth || user?.avatar_mouth || miiState?.mouth || 'smile';
  const hair  = user?.hair  || user?.avatar_hair  || miiState?.hair  || 'none';

  // Background circle
  ctx.beginPath();
  ctx.arc(cx,cy,r,0,Math.PI*2);
  const bg = ctx.createRadialGradient(cx-r*.2,cy-r*.2,r*.1,cx,cy,r);
  bg.addColorStop(0,lighten(color,40));
  bg.addColorStop(1,color);
  ctx.fillStyle = bg; ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(cx,cy+r*.85,r*.55,r*.35,0,Math.PI,0);
  ctx.fillStyle = darken(color,15); ctx.fill();

  // Neck
  ctx.beginPath();
  ctx.roundRect(cx-r*.12,cy+r*.28,r*.24,r*.22,4);
  ctx.fillStyle = skin; ctx.fill();

  // Face
  ctx.beginPath();
  ctx.ellipse(cx,cy+r*.05,r*.38,r*.42,0,0,Math.PI*2);
  const fg = ctx.createRadialGradient(cx-r*.1,cy-.05,r*.05,cx,cy,r*.5);
  fg.addColorStop(0,lighten(skin,20));
  fg.addColorStop(1,skin);
  ctx.fillStyle = fg; ctx.fill();

  // Blush
  [[cx-r*.22,cy+r*.18],[cx+r*.22,cy+r*.18]].forEach(([x,y]) => {
    ctx.beginPath();
    ctx.ellipse(x,y,r*.1,r*.07,0,0,Math.PI*2);
    ctx.fillStyle='rgba(255,150,150,.3)'; ctx.fill();
  });

  drawHair(ctx,cx,cy,r,color,hair);
  drawEyes(ctx,cx,cy,r,eyes,skin);
  drawMouth(ctx,cx,cy,r,mouth);

  // Nose
  ctx.beginPath();
  ctx.arc(cx,cy+r*.1,r*.03,0,Math.PI*2);
  ctx.fillStyle=darken(skin,20); ctx.fill();
}

function drawHair(ctx,cx,cy,r,color,style) {
  const hc = darken(color,25);

  if (style==='rainbow') {
    const g = ctx.createLinearGradient(cx-r*.4,0,cx+r*.4,0);
    g.addColorStop(0,'#ef4444'); g.addColorStop(.3,'#f59e0b');
    g.addColorStop(.6,'#3b82f6'); g.addColorStop(1,'#8b5cf6');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.4,r*.26,0,Math.PI,0); ctx.fill();
    return;
  }
  if (style==='gold') {
    const g = ctx.createLinearGradient(cx,cy-r*.5,cx,cy);
    g.addColorStop(0,'#fbbf24'); g.addColorStop(1,'#d97706');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.4,r*.26,0,Math.PI,0); ctx.fill();
    return;
  }
  if (style==='galaxy') {
    const g = ctx.createLinearGradient(cx-r*.4,0,cx+r*.4,0);
    g.addColorStop(0,'#6d28d9'); g.addColorStop(.5,'#7c3aed'); g.addColorStop(1,'#4f46e5');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.4,r*.26,0,Math.PI,0); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.7)';
    [[cx-r*.15,cy-r*.32],[cx+r*.1,cy-r*.38],[cx,cy-r*.25]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,r*.025,0,Math.PI*2); ctx.fill();
    });
    return;
  }
  if (style==='flame') {
    const g = ctx.createLinearGradient(cx,cy-r*.55,cx,cy-r*.1);
    g.addColorStop(0,'#fbbf24'); g.addColorStop(.5,'#f97316'); g.addColorStop(1,'#ef4444');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.14,r*.38,0,0,Math.PI*2); ctx.fill();
    return;
  }

  ctx.fillStyle = hc;
  switch(style) {
    case 'short':
      ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.38,r*.22,0,Math.PI,0); ctx.fill(); break;
    case 'long':
      ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.4,r*.24,0,Math.PI,0); ctx.fill();
      ctx.fillRect(cx-r*.4,cy-r*.25,r*.18,r*.55);
      ctx.fillRect(cx+r*.22,cy-r*.25,r*.18,r*.55); break;
    case 'curly':
      for(let i=0;i<6;i++){
        const a=(Math.PI/5)*i-Math.PI*.1;
        ctx.beginPath();
        ctx.arc(cx+Math.cos(a)*r*.32,cy-r*.18+Math.sin(a)*r*.15,r*.12,0,Math.PI*2);
        ctx.fill();
      } break;
    case 'bun':
      ctx.beginPath(); ctx.ellipse(cx,cy-r*.3,r*.36,r*.2,0,Math.PI,0); ctx.fill();
      ctx.beginPath(); ctx.arc(cx,cy-r*.38,r*.12,0,Math.PI*2); ctx.fill(); break;
    case 'mohawk':
      ctx.beginPath(); ctx.ellipse(cx,cy-r*.28,r*.14,r*.32,0,0,Math.PI*2); ctx.fill(); break;
    case 'wavy':
      ctx.beginPath(); ctx.moveTo(cx-r*.38,cy-r*.15);
      for(let x=-r*.38;x<=r*.38;x+=r*.1)
        ctx.quadraticCurveTo(cx+x+r*.05,cy-r*.38,cx+x+r*.1,cy-r*.2);
      ctx.lineTo(cx+r*.38,cy-r*.15);
      ctx.arc(cx,cy-r*.15,r*.38,0,Math.PI,true); ctx.fill(); break;
    case 'cap':
      ctx.beginPath(); ctx.ellipse(cx+r*.12,cy-r*.12,r*.3,r*.08,-.2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx,cy-r*.2,r*.38,r*.26,0,Math.PI,0); ctx.fill(); break;
    default: break; // none
  }
}

function drawEyes(ctx,cx,cy,r,style,skin) {
  const ey=cy-r*.07, ex1=cx-r*.14, ex2=cx+r*.14, es=r*.065;

  if (style==='star') {
    [ex1,ex2].forEach(x => {
      ctx.save(); ctx.translate(x,ey);
      ctx.beginPath();
      for(let i=0;i<5;i++){
        const a=i*Math.PI*.4-Math.PI/2, ia=a+Math.PI*.2;
        if(i===0) ctx.moveTo(Math.cos(a)*es,Math.sin(a)*es);
        else ctx.lineTo(Math.cos(a)*es,Math.sin(a)*es);
        ctx.lineTo(Math.cos(ia)*es*.4,Math.sin(ia)*es*.4);
      }
      ctx.closePath(); ctx.fillStyle='#f59e0b'; ctx.fill(); ctx.restore();
    }); return;
  }
  if (style==='heart') {
    [ex1,ex2].forEach(x => {
      ctx.save(); ctx.translate(x,ey);
      ctx.beginPath(); ctx.moveTo(0,es*.3);
      ctx.bezierCurveTo(es*.7,-es*.3,es*1.2,es*.5,0,es*1.2);
      ctx.bezierCurveTo(-es*1.2,es*.5,-es*.7,-es*.3,0,es*.3);
      ctx.fillStyle='#ef4444'; ctx.fill(); ctx.restore();
    }); return;
  }
  if (style==='laser') {
    [ex1,ex2].forEach(x => {
      ctx.beginPath(); ctx.arc(x,ey,es,0,Math.PI*2);
      ctx.fillStyle='#ef4444'; ctx.fill();
      ctx.beginPath(); ctx.arc(x,ey,es*.5,0,Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x+es,ey); ctx.lineTo(x+r*.4,ey);
      const lg=ctx.createLinearGradient(x+es,ey,x+r*.4,ey);
      lg.addColorStop(0,'rgba(239,68,68,.8)'); lg.addColorStop(1,'rgba(239,68,68,0)');
      ctx.strokeStyle=lg; ctx.lineWidth=r*.04; ctx.stroke();
    }); return;
  }

  switch(style) {
    case 'happy':
      [ex1,ex2].forEach(x => {
        ctx.beginPath(); ctx.arc(x,ey,es,Math.PI,0);
        ctx.strokeStyle='#1e293b'; ctx.lineWidth=r*.04; ctx.stroke();
      }); break;
    case 'sleepy':
      [ex1,ex2].forEach(x => {
        ctx.beginPath(); ctx.arc(x,ey+es*.3,es,Math.PI,0);
        ctx.fillStyle='#1e293b'; ctx.fill();
        ctx.beginPath(); ctx.rect(x-es,ey-es*.3,es*2,es*.8);
        ctx.fillStyle=lighten(skin||'#fde68a',10); ctx.fill();
      }); break;
    case 'surprised':
      [ex1,ex2].forEach(x => {
        ctx.beginPath(); ctx.arc(x,ey,es*1.3,0,Math.PI*2);
        ctx.fillStyle='white'; ctx.fill();
        ctx.beginPath(); ctx.arc(x,ey,es*.7,0,Math.PI*2);
        ctx.fillStyle='#1e293b'; ctx.fill();
      }); break;
    case 'wink':
      ctx.beginPath(); ctx.arc(ex1,ey,es,Math.PI,0);
      ctx.strokeStyle='#1e293b'; ctx.lineWidth=r*.04; ctx.stroke();
      ctx.beginPath(); ctx.arc(ex2,ey,es,0,Math.PI*2);
      ctx.fillStyle='#1e293b'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex2+es*.25,ey-es*.25,es*.3,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,.7)'; ctx.fill(); break;
    case 'cool':
      ctx.fillStyle='#1e293b';
      [ex1,ex2].forEach(x => {
        ctx.beginPath(); ctx.roundRect(x-es*1.1,ey-es*.8,es*2.2,es*1.6,es*.4); ctx.fill();
      });
      ctx.beginPath(); ctx.moveTo(ex1+es*1.1,ey); ctx.lineTo(ex2-es*1.1,ey);
      ctx.strokeStyle='#1e293b'; ctx.lineWidth=es*.4; ctx.stroke(); break;
    default: // normal
      [ex1,ex2].forEach(x => {
        ctx.beginPath(); ctx.arc(x,ey,es,0,Math.PI*2);
        ctx.fillStyle='#1e293b'; ctx.fill();
        ctx.beginPath(); ctx.arc(x+es*.3,ey-es*.3,es*.35,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,.7)'; ctx.fill();
      });
  }
}

function drawMouth(ctx,cx,cy,r,style) {
  const my=cy+r*.22;
  ctx.strokeStyle='#b45309'; ctx.lineWidth=r*.04; ctx.lineCap='round';

  if (style==='rainbow') {
    ctx.beginPath(); ctx.arc(cx,my-r*.06,r*.16,.15*Math.PI,.85*Math.PI);
    const mg=ctx.createLinearGradient(cx-r*.16,my,cx+r*.16,my);
    mg.addColorStop(0,'#ef4444'); mg.addColorStop(.5,'#3b82f6'); mg.addColorStop(1,'#8b5cf6');
    ctx.strokeStyle=mg; ctx.lineWidth=r*.05; ctx.stroke(); return;
  }
  if (style==='fire') {
    ctx.beginPath(); ctx.arc(cx,my-r*.06,r*.14,.15*Math.PI,.85*Math.PI);
    const fg=ctx.createLinearGradient(cx-r*.14,my,cx+r*.14,my);
    fg.addColorStop(0,'#fbbf24'); fg.addColorStop(1,'#ef4444');
    ctx.strokeStyle=fg; ctx.lineWidth=r*.05; ctx.stroke(); return;
  }

  switch(style) {
    case 'grin':
      ctx.beginPath(); ctx.arc(cx,my-r*.06,r*.16,.15*Math.PI,.85*Math.PI);
      ctx.fillStyle='#7f1d1d'; ctx.fill();
      ctx.strokeStyle='#b45309'; ctx.stroke();
      ctx.fillStyle='white'; ctx.fillRect(cx-r*.12,my-r*.09,r*.24,r*.07); break;
    case 'open':
      ctx.beginPath(); ctx.ellipse(cx,my,r*.1,r*.08,0,0,Math.PI*2);
      ctx.fillStyle='#7f1d1d'; ctx.fill(); break;
    case 'sad':
      ctx.beginPath(); ctx.arc(cx,my+r*.1,r*.14,1.2*Math.PI,1.8*Math.PI);
      ctx.stroke(); break;
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(cx-r*.1,my+r*.02);
      ctx.quadraticCurveTo(cx,my-r*.04,cx+r*.14,my-r*.06);
      ctx.stroke(); break;
    case 'tongue':
      ctx.beginPath(); ctx.arc(cx,my-r*.04,r*.13,.1*Math.PI,.9*Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx,my+r*.04,r*.07,r*.06,0,0,Math.PI*2);
      ctx.fillStyle='#f87171'; ctx.fill(); break;
    default: // smile
      ctx.beginPath(); ctx.arc(cx,my-r*.06,r*.14,.15*Math.PI,.85*Math.PI); ctx.stroke();
  }
}

// Color helpers
function lighten(hex,pct) {
  if (!hex||!hex.startsWith('#')) return hex||'#16a34a';
  const n=parseInt(hex.replace('#',''),16);
  return `rgb(${Math.min(255,((n>>16)&255)+pct*2.55|0)},${Math.min(255,((n>>8)&255)+pct*2.55|0)},${Math.min(255,(n&255)+pct*2.55|0)})`;
}
function darken(hex,pct) {
  if (!hex||!hex.startsWith('#')) return hex||'#16a34a';
  const n=parseInt(hex.replace('#',''),16);
  return `rgb(${Math.max(0,((n>>16)&255)-pct*2.55|0)},${Math.max(0,((n>>8)&255)-pct*2.55|0)},${Math.max(0,(n&255)-pct*2.55|0)})`;
}
// ══════════════════════════════════════════
//   LOG ACTIVITY
// ══════════════════════════════════════════
function selectAct(type, btn) {
  curAct = type;
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  const form = document.getElementById('logForm');
  form.style.display = 'block';
  document.getElementById('formTitle').textContent = `${ICONS[type]} ${type}`;

  const r    = RATES[type];
  const isKm = r.t === 'k';

  document.getElementById('kmField').style.display    = isKm  ? 'block' : 'none';
  document.getElementById('hoursField').style.display = !isKm ? 'block' : 'none';
  document.getElementById('mapSection').style.display = isKm  ? 'block' : 'none';

  // Reset valori
  const kmInp = document.getElementById('kmInput');
  const hrInp = document.getElementById('hoursInput');
  if (kmInp) kmInp.value = '';
  if (hrInp) hrInp.value = '';
  calcedKm = 0;

  updateCo2Estimate();

  if (isKm) {
    setTimeout(() => {
      if (!mapInited) initMap();
      else map?.invalidateSize();
    }, 200);
  }
}
window.selectAct = selectAct;

function cancelLog() {
  document.getElementById('logForm').style.display = 'none';
  curAct   = null;
  calcedKm = 0;
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('sel'));
  const co2El = document.getElementById('co2Estimate');
  if (co2El) co2El.style.display = 'none';
  resetMap();
}
window.cancelLog = cancelLog;

function updateCo2Estimate() {
  if (!curAct) return;
  const r    = RATES[curAct];
  const isKm = r.t === 'k';

  let val;
  if (isKm) {
    val = calcedKm > 0
      ? calcedKm
      : parseFloat(document.getElementById('kmInput')?.value) || 0;
  } else {
    val = parseFloat(document.getElementById('hoursInput')?.value) || 0;
  }

  const co2  = (val * r.co2).toFixed(2);
  const pts  = Math.round(val * r.pts);
  const unit = isKm ? 'km' : 'ore';

  const el  = document.getElementById('co2Estimate');
  const eco = document.getElementById('co2EstCo2');
  const epo = document.getElementById('co2EstPts');
  const eun = document.getElementById('co2EstUnit');

  if (el)  el.style.display = 'flex';
  if (eco) eco.textContent  = `${co2} kg`;
  if (epo) epo.textContent  = `+${pts}`;
  if (eun) eun.textContent  = `${val} ${unit}`;
}
window.updateCo2Estimate = updateCo2Estimate;

async function saveActivity() {
  if (!curAct) return showN('❌ Seleziona un tipo di attività','error');

  const r    = RATES[curAct];
  const isKm = r.t === 'k';

  let km=0, hours=0, fromA='', toA='';

  if (isKm) {
    if (calcedKm > 0) {
      km    = calcedKm;
      fromA = document.getElementById('fromAddr')?.value || '';
      toA   = document.getElementById('toAddr')?.value   || '';
    } else {
      km = parseFloat(document.getElementById('kmInput')?.value) || 0;
    }
    if (km <= 0) return showN('❌ Inserisci i km o calcola il percorso sulla mappa','error');
  } else {
    hours = parseFloat(document.getElementById('hoursInput')?.value) || 0;
    if (hours <= 0) return showN('❌ Inserisci le ore di attività','error');
  }

  const note = document.getElementById('noteInput')?.value?.trim() || '';
  const btn  = document.getElementById('saveBtnLog');
  if (btn) {
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';
  }

  const co2 = parseFloat(((isKm ? km : hours) * r.co2).toFixed(2));
  const pts = Math.round((isKm ? km : hours) * r.pts);

  const d = await api('/api/activities','POST',{
    type:curAct, km, hours, note, from_addr:fromA, to_addr:toA
  });

  if (btn) {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-leaf"></i> Salva Attività';
  }

  if (d.error) return showN('❌ ' + d.error,'error');

  showCo2Explosion(co2, pts);
  showN(`✅ Attività salvata! +${co2} kg CO₂ · +${pts} pt`,'success');

  cancelLog();
  await Promise.all([loadStats(), loadActivities(), loadBadges(), loadYearly(), loadProfile()]);
}
window.saveActivity = saveActivity;

// ══════════════════════════════════════════
//   MAPPA LEAFLET ✅ FIXED (profili OSRM)
// ══════════════════════════════════════════
function initMap() {
  if (mapInited) return;
  const container = document.getElementById('leafletMap');
  if (!container) return;

  try {
    map = L.map('leafletMap', {
      center: [45.464, 9.190],
      zoom:   12,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);

    map.on('click', handleMapClick);
    mapInited = true;
    setTimeout(() => map.invalidateSize(), 150);
  } catch(e) {
    console.error('Leaflet init error:', e);
    showN('❌ Errore caricamento mappa','error');
  }
}

function handleMapClick(e) {
  const { lat, lng } = e.latlng;
  if (!markerFrom) {
    setMarker('from', lat, lng);
    reverseGeocode(lat, lng, 'fromAddr');
  } else if (!markerTo) {
    setMarker('to', lat, lng);
    reverseGeocode(lat, lng, 'toAddr');
    setTimeout(calcRoute, 400);
  }
}

function setMarker(type, lat, lng) {
  const cfg = {
    from: { color:'#16a34a', label:'🟢 Partenza', anchor:[52,14] },
    to:   { color:'#ef4444', label:'🔴 Arrivo',   anchor:[40,14] }
  }[type];

  const icon = L.divIcon({
    html: `<div style="
      background:${cfg.color};color:white;
      padding:5px 10px;border-radius:20px;
      font-size:11px;font-weight:700;
      box-shadow:0 3px 10px rgba(0,0,0,.3);
      white-space:nowrap;border:2px solid white;">
      ${cfg.label}
    </div>`,
    className: '',
    iconAnchor: cfg.anchor
  });

  if (type === 'from') {
    if (markerFrom) map.removeLayer(markerFrom);
    markerFrom = L.marker([lat,lng],{ icon, draggable:true })
      .addTo(map)
      .on('dragend', e => {
        const p = e.target.getLatLng();
        reverseGeocode(p.lat, p.lng, 'fromAddr');
        if (markerTo) calcRoute();
      });
  } else {
    if (markerTo) map.removeLayer(markerTo);
    markerTo = L.marker([lat,lng],{ icon, draggable:true })
      .addTo(map)
      .on('dragend', e => {
        const p = e.target.getLatLng();
        reverseGeocode(p.lat, p.lng, 'toAddr');
        calcRoute();
      });
  }
}

function resetMap() {
  if (!map) return;
  if (markerFrom) { map.removeLayer(markerFrom); markerFrom = null; }
  if (markerTo)   { map.removeLayer(markerTo);   markerTo   = null; }
  if (routeLine)  { map.removeLayer(routeLine);   routeLine  = null; }
  const ri = document.getElementById('routeInfo');
  if (ri) ri.style.display = 'none';
  const fa = document.getElementById('fromAddr');
  const ta = document.getElementById('toAddr');
  if (fa) fa.value = '';
  if (ta) ta.value = '';
  calcedKm = 0;
  updateCo2Estimate();
}
window.resetMap = resetMap;

async function geocodeAddress(addr) {
  if (!addr || addr.length < 3) return null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=5`,
      { headers:{ 'Accept-Language':'it' } }
    );
    return await r.json();
  } catch { return null; }
}

async function reverseGeocode(lat, lng, inputId) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers:{ 'Accept-Language':'it' } }
    );
    const d  = await r.json();
    const el = document.getElementById(inputId);
    if (el && d.display_name)
      el.value = d.display_name.split(',').slice(0,3).join(',').trim();
  } catch(e) { console.warn('Reverse geocode failed:', e); }
}

function onAddrInput(inputId, suggId, type) {
  clearTimeout(geocodeTimer);
  const val = document.getElementById(inputId)?.value;
  if (!val || val.length < 3) {
    const s = document.getElementById(suggId);
    if (s) s.innerHTML = '';
    return;
  }
  geocodeTimer = setTimeout(async () => {
    const results = await geocodeAddress(val);
    if (!results?.length) return;
    const sugg = document.getElementById(suggId);
    if (!sugg) return;
    sugg.innerHTML = results.map(res => `
      <div class="addr-sugg-item"
        onclick="selectAddr('${inputId}','${suggId}','${type}',
          ${res.lat},${res.lon},\`${res.display_name.replace(/`/g,"'")}\`)">
        <i class="fas fa-map-marker-alt"></i>
        ${res.display_name.split(',').slice(0,3).join(', ')}
      </div>`).join('');
  }, 450);
}
window.onAddrInput = onAddrInput;

function selectAddr(inputId, suggId, type, lat, lon, name) {
  const el = document.getElementById(inputId);
  if (el) el.value = name.split(',').slice(0,3).join(',').trim();
  const s = document.getElementById(suggId);
  if (s) s.innerHTML = '';

  setMarker(type, parseFloat(lat), parseFloat(lon));
  map.setView([parseFloat(lat), parseFloat(lon)], 14);

  if (markerFrom && markerTo) calcRoute();
}
window.selectAddr = selectAddr;

// ✅ FIX PRINCIPALE: profilo OSRM corretto per tipo attività
async function calcRoute() {
  if (!markerFrom || !markerTo) {
    showN('❌ Inserisci partenza e arrivo prima di calcolare','error');
    return;
  }

  const btn = document.getElementById('calcRouteBtn');
  if (btn) {
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcolo...';
  }

  const f       = markerFrom.getLatLng();
  const t       = markerTo.getLatLng();

  // ✅ Sceglie profilo OSRM corretto
  const profile = OSRM_PROFILE[curAct] || 'driving';

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/${profile}/` +
      `${f.lng},${f.lat};${t.lng},${t.lat}?overview=full&geometries=geojson`
    );
    const d = await res.json();

    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-route"></i> Calcola Percorso';
    }

    if (!d.routes?.length) {
      showN('❌ Percorso non trovato. Prova indirizzi più precisi.','error');
      return;
    }

    const route = d.routes[0];
    const km    = (route.distance / 1000).toFixed(1);
    const mins  = Math.round(route.duration / 60);

    // Disegna percorso
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.geoJSON(route.geometry, {
      style: { color:'#16a34a', weight:5, opacity:.9, dashArray:'8,4' }
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding:[30,30] });

    // Aggiorna stato
    calcedKm = parseFloat(km);
    updateCo2Estimate();

    // Aggiorna route info
    const ri = document.getElementById('routeInfo');
    if (ri) {
      ri.style.display = 'flex';
      const rate = RATES[curAct];
      const co2  = (calcedKm * rate.co2).toFixed(2);
      const pts  = Math.round(calcedKm * rate.pts);
      ri.innerHTML = `
        <div class="route-info-item">
          <i class="fas fa-road" style="color:var(--blue)"></i>
          <strong>${km} km</strong>
        </div>
        <div class="route-info-item">
          <i class="fas fa-clock" style="color:var(--yellow)"></i>
          ~${mins} min
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

    showN(`✅ Percorso: ${km} km · ~${mins} min`,'success');

  } catch(e) {
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-route"></i> Calcola Percorso';
    }
    console.error('Route error:', e);
    showN('❌ Errore nel calcolo del percorso. Riprova.','error');
  }
}
window.calcRoute = calcRoute;

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdminUsers() {
  if (!myProfile?.is_admin) return;
  const list  = await api('/api/admin/users');
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody || !Array.isArray(list)) return;

  tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div class="u-info">
          <div class="u-av">
            <canvas width="36" height="36" id="adAv${u.id}"></canvas>
          </div>
          <div>
            <div class="u-name">
              ${u.name||'—'}
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

  setTimeout(() => list.forEach(u => drawMii(u,`adAv${u.id}`,36)), 60);
}

async function adminAction(action, userId) {
  const labels = {
    ban:          ['⛔','Banna utente',     'Vuoi bannare questo utente dalla piattaforma?'],
    unban:        ['✅','Sbanna utente',    'Vuoi sbannare questo utente?'],
    delete:       ['🗑️','Elimina utente',  '⚠️ Questa azione è IRREVERSIBILE!'],
    toggle_admin: ['👑','Toggle Admin',    'Cambia il ruolo admin per questo utente?'],
    warn:         ['⚠️','Avvisa utente',   'Invia un avviso ufficiale a questo utente?'],
    reset_points: ['🔄','Reset punti',     'Azzera tutti i punti di questo utente?']
  };
  const [icon,title,msg] = labels[action] || ['❓','Azione','Sei sicuro?'];

  openConfirm(icon, title, msg, async () => {
    const d = await api(`/api/admin/users/${userId}/${action}`,'POST');
    if (d.error) return showN('❌ '+d.error,'error');
    showN(`✅ ${title} eseguito!`,'success');
    loadAdminUsers();
  });
}
window.adminAction = adminAction;

async function openUserActs(userId, name) {
  const modal = document.getElementById('userActsModal');
  const title = document.getElementById('userActsTitle');
  const body  = document.getElementById('userActsBody');
  if (!modal) return;

  title.textContent = `Attività di ${name}`;
  body.innerHTML    = `<div style="text-align:center;padding:30px">
    <i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--green)"></i>
  </div>`;
  modal.style.display = 'flex';

  const list = await api(`/api/admin/users/${userId}/activities`);
  if (!Array.isArray(list)||!list.length) {
    body.innerHTML = `<div class="empty"><div class="ei">📋</div><p>Nessuna attività.</p></div>`;
    return;
  }

  body.innerHTML = list.map(a => `
    <div class="adm-act-item">
      <div style="font-size:22px">${ICONS[a.type]||'📌'}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">
          ${a.type} — ${parseFloat(a.co2_saved).toFixed(2)} kg CO₂
        </div>
        <div style="font-size:11px;color:var(--muted)">
          ${new Date(a.date).toLocaleString('it-IT')}
          ${a.km>0 ? ' · '+a.km+' km' : ''}
          ${a.hours>0 ? ' · '+a.hours+'h' : ''}
        </div>
      </div>
      <button class="adm-act-del" onclick="deleteAct(${a.id},this)">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}
window.openUserActs = openUserActs;

async function deleteAct(actId, btn) {
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  const d = await api(`/api/admin/activities/${actId}`,'DELETE');
  if (d.error) {
    btn.innerHTML = '<i class="fas fa-trash"></i>';
    return showN('❌ '+d.error,'error');
  }
  const item = btn.closest('.adm-act-item');
  if (item) {
    item.style.transition = 'opacity .3s';
    item.style.opacity    = '0';
    setTimeout(() => item.remove(), 300);
  }
  showN('🗑️ Attività eliminata','info');
}
window.deleteAct = deleteAct;

function closeUserActsModal() {
  const modal = document.getElementById('userActsModal');
  if (modal) modal.style.display = 'none';
}
window.closeUserActsModal = closeUserActsModal;

// ══════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════
let confirmCallback = null;

function openConfirm(icon, title, msg, cb) {
  confirmCallback = cb;
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  document.getElementById('confirmOverlay').style.display = 'flex';
}
function confirmYes() {
  document.getElementById('confirmOverlay').style.display = 'none';
  if (typeof confirmCallback === 'function') confirmCallback();
  confirmCallback = null;
}
function confirmNo() {
  document.getElementById('confirmOverlay').style.display = 'none';
  confirmCallback = null;
}
window.openConfirm = openConfirm;
window.confirmYes  = confirmYes;
window.confirmNo   = confirmNo;

// ══════════════════════════════════════════
//   RICERCA UTENTI
// ══════════════════════════════════════════
let searchTimer = null;

function onSearchInput() {
  clearTimeout(searchTimer);
  const val = document.getElementById('searchInput')?.value?.trim();
  if (!val || val.length < 2) {
    const el = document.getElementById('searchResults');
    if (el) el.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(() => searchUsers(val), 400);
}
window.onSearchInput = onSearchInput;

async function searchUsers(query) {
  const list = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
  const el   = document.getElementById('searchResults');
  if (!el) return;
  if (!Array.isArray(list)||!list.length) {
    el.innerHTML = `<div class="empty" style="padding:20px">
      <div class="ei">🔍</div><p>Nessun utente trovato per "${query}".</p>
    </div>`;
    return;
  }
  el.innerHTML = list.map(u => userCardHTML(u, u.is_following)).join('');
  setTimeout(() => list.forEach(u => drawMii(u,`ucAv${u.id}`,44)), 60);
}

// ══════════════════════════════════════════
//   AUTO-INIT
// ══════════════════════════════════════════
async function autoInit() {
  if (!token) return;
  const d = await api('/api/profile');
  if (d.error || !d.id) {
    token = null;
    localStorage.removeItem('ecotoken');
    return;
  }
  bootApp(d);
}
autoInit();

// ══════════════════════════════════════════
//   GLOBAL EVENTS
// ══════════════════════════════════════════
document.addEventListener('click', e => {
  if (!e.target.closest('.map-search-wrap'))
    document.querySelectorAll('.addr-sugg').forEach(s => s.innerHTML = '');
});

window.addEventListener('resize', () => {
  if (map && mapInited) setTimeout(() => map.invalidateSize(), 100);
  const mobNav = document.getElementById('mobNav');
  if (mobNav) mobNav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['confirmOverlay','userActsModal','tutOverlay'].forEach(id => {
    const m = document.getElementById(id);
    if (m && m.style.display !== 'none') m.style.display = 'none';
  });
  const exp = document.getElementById('co2Explosion');
  if (exp && exp.style.display !== 'none') exp.style.display = 'none';
});

}); // fine DOMContentLoaded
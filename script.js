// ══════════════════════════════════════════
//   ECOTRACK — script.js
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

const BASE = '';
let token = localStorage.getItem('ecotoken');
let curAct = null;
let calcedKm = 0;
let myProfile = null;

// ══════════════════════════════════════════
//   API HELPER
// ══════════════════════════════════════════
async function api(url, method='GET', body=null) {
  const opts = {
    method,
    headers: { 'Content-Type':'application/json', ...(token?{'Authorization':'Bearer '+token}:{}) }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(BASE+url, opts);
    return await r.json();
  } catch(e) { return { error: e.message }; }
}

// ══════════════════════════════════════════
//   TOAST
// ══════════════════════════════════════════
let notifTimer;
function showN(msg, type='success') {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.className = `notif ${type}`;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
let tutIdx = 0;
function goTut(i) {
  document.querySelectorAll('.tut-step').forEach((s,j) => s.classList.toggle('active', j===i));
  document.querySelectorAll('.tut-dot').forEach((d,j)  => d.classList.toggle('active', j===i));
  tutIdx = i;
  const btn = document.querySelector('.tut-next');
  btn.textContent = i === 3 ? '🚀 Inizia!' : 'Avanti →';
}
function tutNav(dir) {
  const next = tutIdx + dir;
  if (next < 0) return;
  if (next > 3) { closeTut(); return; }
  goTut(next);
}
function closeTut() {
  document.getElementById('tutOverlay').style.display = 'none';
  localStorage.setItem('ecoTutDone','1');
}
window.goTut = goTut; window.tutNav = tutNav; window.closeTut = closeTut;

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
function switchTab(tab, btn) {
  document.getElementById('loginForm').style.display    = tab==='login'    ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'flex' : 'none';
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
window.switchTab = switchTab;

function togglePwd(id, btn) {
  const inp = document.getElementById(id);
  const isText = inp.type === 'text';
  inp.type = isText ? 'password' : 'text';
  btn.innerHTML = `<i class="fas fa-eye${isText?'':'-slash'}"></i>`;
}
window.togglePwd = togglePwd;

function checkPwd(val) {
  const checks = [
    { id:'ph1', ok: val.length >= 8 },
    { id:'ph2', ok: /[A-Z]/.test(val) },
    { id:'ph3', ok: /[0-9]/.test(val) },
    { id:'ph4', ok: /[^A-Za-z0-9]/.test(val) }
  ];
  checks.forEach(c => document.getElementById(c.id)?.classList.toggle('ok', c.ok));
}
window.checkPwd = checkPwd;

async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('lEmail').value.trim();
  const pwd   = document.getElementById('lPwd').value;
  const btn   = e.target.querySelector('.btn-auth');
  const err   = document.getElementById('lErr');
  err.textContent = '';
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Accesso...</span>';
  btn.disabled = true;
  const d = await api('/api/login','POST',{ email, password:pwd });
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Accedi</span>';
  if (d.error) { err.textContent = d.error; err.parentElement.classList.add('shake'); setTimeout(()=>err.parentElement.classList.remove('shake'),500); return; }
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
  const password = document.getElementById('rPwd').value;
  const btn      = e.target.querySelector('.btn-auth');
  const err      = document.getElementById('rErr');
  err.textContent = '';
  if (password.length < 8) { err.textContent='Password troppo corta!'; return; }
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Registrazione...</span>';
  btn.disabled = true;
  const d = await api('/api/register','POST',{ name, username, email, password });
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-user-plus"></i><span>Registrati</span>';
  if (d.error) { err.textContent = d.error; return; }
  token = d.token;
  localStorage.setItem('ecotoken', token);
  bootApp(d.user);
}
window.doRegister = doRegister;

function doLogout(e) {
  e.stopPropagation();
  token = null;
  localStorage.removeItem('ecotoken');
  location.reload();
}
window.doLogout = doLogout;

// ══════════════════════════════════════════
//   BOOT APP
// ══════════════════════════════════════════
function bootApp(user) {
  myProfile = user;
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  if (window.innerWidth <= 768) document.getElementById('mobNav').style.display = 'flex';
  document.getElementById('sbEmail').textContent = user.email || '';
  initAdmin(user);
  drawMii(user, 'sbAvatarCanvas', 36);
  loadAll();
  loadProfile();
  loadNotifCount();
  if (!localStorage.getItem('ecoTutDone')) document.getElementById('tutOverlay').style.display = 'flex';
}

function initAdmin(user) {
  if (user.is_admin) {
    document.getElementById('adminNavBtn').style.display = 'flex';
    document.getElementById('sbAdminBadge').style.display = 'inline-flex';
  }
}

// ══════════════════════════════════════════
//   TAB NAVIGATION
// ══════════════════════════════════════════
const TAB_TITLES = {
  dashboard:   ['Dashboard',   'Bentornato! 🌱'],
  log:         ['Log Attività','Registra la tua attività eco 🌍'],
  challenges:  ['Sfide',       'Completa sfide e guadagna punti 🏆'],
  leaderboard: ['Classifica',  'Scala la vetta! 👑'],
  social:      ['Community',   'Connettiti con altri eco-warriors 👥'],
  notifiche:   ['Notifiche',   'Le tue notifiche 🔔'],
  profile:     ['Profilo',     'Personalizza il tuo account ⚙️'],
  admin:       ['Admin Panel', 'Gestione piattaforma 👑'],
};

function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-'+name)?.classList.add('active');
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mn-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const [title, sub] = TAB_TITLES[name] || [name,''];
  document.getElementById('topTitle').textContent = title;
  document.getElementById('topSub').textContent   = sub;
  if (name==='leaderboard') loadLeaderboard();
  if (name==='social')      { loadFollowers(); loadFollowing(); loadGroups(); }
  if (name==='notifiche')   loadNotifications();
  if (name==='profile')     loadProfile();
  if (name==='admin')       loadAdminUsers();
  if (name==='log') {
    setTimeout(() => { if (map) map.invalidateSize(); }, 200);
  }
}
window.showTab = showTab;

// ══════════════════════════════════════════
//   LOAD ALL
// ══════════════════════════════════════════
function loadAll() {
  loadStats();
  loadActivities();
  loadBadges();
  loadYearly();
  loadChallenges();
}

// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
async function loadStats() {
  const d = await api('/api/stats');
  if (d.error) return;
  animCount('sWeek', parseFloat(d.co2_week)||0, 1);
  animCount('sPts',  parseInt(d.points)||0,     0);
  animCount('sCo2',  parseFloat(d.co2_total)||0, 1);
  animCount('sActs', parseInt(d.total_activities)||0, 0);
}

function animCount(id, target, decimals) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 1000, steps = 40, inc = target/steps;
  let cur = 0, i = 0;
  const t = setInterval(() => {
    cur = Math.min(cur+inc, target);
    el.textContent = decimals ? cur.toFixed(decimals) : Math.round(cur);
    if (++i >= steps) clearInterval(t);
  }, dur/steps);
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
const ICONS = {
  Remoto:'🏠', Treno:'🚂', Bici:'🚴', Bus:'🚌', Carpooling:'🚗', Videocall:'💻'
};
const RATES = {
  Remoto:    { t:'h', co2:.5,  pts:10  },
  Treno:     { t:'k', co2:.04, pts:2   },
  Bici:      { t:'k', co2:0,   pts:5   },
  Bus:       { t:'k', co2:.08, pts:1.5 },
  Carpooling:{ t:'k', co2:.06, pts:3   },
  Videocall: { t:'h', co2:.1,  pts:8   }
};

function renderActs(acts, containerId, limit=null) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const list = limit ? acts.slice(0,limit) : acts;
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">🌱</div><p>Nessuna attività ancora.<br>Inizia a registrare!</p></div>`;
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="act-item">
      <div class="act-icon-wrap">${ICONS[a.type]||'📌'}</div>
      <div class="act-detail">
        <div class="act-name">${a.type}</div>
        <div class="act-sub">
          ${a.km>0 ? `📍 ${a.from_addr||''} → ${a.to_addr||''} · <strong>${a.km} km</strong>` : ''}
          ${a.hours>0 ? `⏱ ${a.hours} ore` : ''}
          ${a.note ? ` · ${a.note}` : ''}
          <br>${new Date(a.date).toLocaleDateString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
        </div>
      </div>
      <div class="act-tags">
        <span class="tag tag-g">🌱 ${a.co2_saved} kg</span>
        <span class="tag tag-y">⭐ +${a.points}</span>
      </div>
    </div>`).join('');
}

async function loadActivities() {
  const acts = await api('/api/activities');
  if (acts.error) return;
  renderActs(acts, 'recentActs', 5);
  renderActs(acts, 'allActs');
}

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
async function loadBadges() {
  const badges = await api('/api/badges');
  if (badges.error) return;
  document.getElementById('badgeList').innerHTML = badges.map(b => `
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
  const data = await api('/api/yearly');
  const el = document.getElementById('yearlyChart');
  if (!el) return;
  if (!data.length) { el.innerHTML = `<div class="empty"><div class="ei">📊</div><p>Nessun dato annuale.</p></div>`; return; }
  const max = Math.max(...data.map(d=>parseFloat(d.co2)||0), 1);
  el.innerHTML = data.map(d => {
    const pct = Math.round((parseFloat(d.co2)/max)*100);
    return `
    <div class="yr-row">
      <div class="yr-month">${d.month}</div>
      <div class="yr-bar"><div class="yr-fill" data-w="${pct}"></div></div>
      <div class="yr-co2">${parseFloat(d.co2).toFixed(1)} kg</div>
      <div class="yr-pts">⭐${Math.round(d.points)}</div>
    </div>`;
  }).join('');
  setTimeout(() => {
    document.querySelectorAll('.yr-fill').forEach(f => {
      f.style.width = f.dataset.w + '%';
    });
  }, 100);
}

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
async function loadChallenges() {
  const list = await api('/api/challenges');
  const el = document.getElementById('chList');
  if (!el) return;
  if (!list.length) { el.innerHTML = `<div class="empty"><div class="ei">🏆</div><p>Nessuna sfida. Creane una!</p></div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="ch-item">
      <div class="ch-ico">🏆</div>
      <div class="ch-info" style="flex:1">
        <h4>${c.title}</h4>
        <p>${c.description||'Nessuna descrizione'}</p>
        <div class="ch-tags">
          ${c.co2_target>0?`<span class="ch-tag">🌱 ${c.co2_target} kg CO₂</span>`:''}
          ${c.points_reward>0?`<span class="ch-tag">⭐ ${c.points_reward} pt</span>`:''}
          ${c.end_date?`<span class="ch-tag">📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>`:''}
          ${c.is_public?'<span class="ch-tag">🌍 Pubblica</span>':''}
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
  const d = await api('/api/challenges','POST',{
    title:       document.getElementById('chTitle').value,
    description: document.getElementById('chDesc').value,
    co2_target:  parseFloat(document.getElementById('chCo2').value)||0,
    points_reward:parseInt(document.getElementById('chPts').value)||0,
    end_date:    document.getElementById('chDate').value,
    is_public:   document.getElementById('chPublic').checked
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('🏆 Sfida creata!','success');
  toggleChForm();
  loadChallenges();
}
window.saveChallenge = saveChallenge;

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLeaderboard() {
  const list = await api('/api/leaderboard');
  const el = document.getElementById('lbList');
  if (!el||list.error) return;
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = list.map((u,i) => {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    drawMii(u, null, 40, c);
    return `
    <div class="lb-row ${i<3?'r'+(i+1):''}">
      <div class="lb-rank">${medals[i]||'#'+(i+1)}</div>
      <div class="lb-av">
        <canvas width="40" height="40" id="lbAv${u.id}"></canvas>
      </div>
      <div class="lb-name">
        <div class="lb-uname">${u.name||'—'}</div>
        <div class="lb-username">@${u.username||'—'}</div>
      </div>
      <div class="lb-co2">🌱 ${parseFloat(u.co2_saved).toFixed(1)} kg</div>
      <div class="lb-pts">⭐ ${Math.round(u.points)}</div>
    </div>`;
  }).join('');
  setTimeout(() => list.forEach(u => drawMii(u, 'lbAv'+u.id, 40)), 50);
}

// ══════════════════════════════════════════
//   NOTIFICHE
// ══════════════════════════════════════════
async function loadNotifCount() {
  const list = await api('/api/notifications');
  if (list.error) return;
  const unread = list.filter(n=>!n.is_read).length;
  const dot    = document.getElementById('sbNotifDot');
  const count  = document.getElementById('notifCount');
  if (unread > 0) {
    dot?.style && (dot.style.display='block');
    if (count) { count.style.display='flex'; count.textContent=unread; }
  } else {
    dot?.style && (dot.style.display='none');
    if (count) count.style.display='none';
  }
}

async function loadNotifications() {
  const list = await api('/api/notifications');
  const el   = document.getElementById('notifList');
  if (!el) return;
  if (!list.length||list.error) {
    el.innerHTML = `<div class="empty"><div class="ei">🔔</div><p>Nessuna notifica.</p></div>`;
    return;
  }
  el.innerHTML = list.map(n => `
    <div class="notif-item ${n.is_read?'':'unread'}">
      <div class="notif-item-icon ni-${n.type}">
        ${n.type==='follow'?'👥':n.type==='warn'?'⚠️':n.type==='ban'?'⛔':n.type==='unban'?'✅':n.type==='carsharing'?'🚗':'🔔'}
      </div>
      <div class="notif-item-body">
        <div class="notif-item-msg">${n.message}</div>
        <div class="notif-item-time">${new Date(n.created_at).toLocaleString('it-IT')}</div>
      </div>
    </div>`).join('');
  await api('/api/notifications/read','PATCH');
  loadNotifCount();
}

async function markAllRead() {
  await api('/api/notifications/read','PATCH');
  loadNotifications();
  showN('✅ Tutte le notifiche lette','info');
}
window.markAllRead = markAllRead;

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
async function loadFollowers() {
  const list = await api('/api/followers');
  const el   = document.getElementById('followersList');
  if (!el) return;
  if (!list.length||list.error) { el.innerHTML=`<div class="empty"><div class="ei">👥</div><p>Nessun follower ancora.</p></div>`; return; }
  el.innerHTML = list.map(u => `
    <div class="user-card">
      <div class="uc-av"><canvas width="44" height="44" id="fwAv${u.id}"></canvas></div>
      <div class="uc-info">
        <div class="uc-name">${u.name||'—'}</div>
        <div class="uc-username">@${u.username||'—'}</div>
        <div class="uc-pts">⭐ ${u.points||0} pt</div>
      </div>
    </div>`).join('');
  setTimeout(() => list.forEach(u => drawMii(u,'fwAv'+u.id,44)), 50);
}

async function loadFollowing() {
  const list = await api('/api/following');
  const el   = document.getElementById('followingList');
  if (!el) return;
  if (!list.length||list.error) { el.innerHTML=`<div class="empty"><div class="ei">👤</div><p>Non stai seguendo nessuno.</p></div>`; return; }
  el.innerHTML = list.map(u => `
    <div class="user-card">
      <div class="uc-av"><canvas width="44" height="44" id="fgAv${u.id}"></canvas></div>
      <div class="uc-info">
        <div class="uc-name">${u.name||'—'}</div>
        <div class="uc-username">@${u.username||'—'}</div>
        <div class="uc-pts">⭐ ${u.points||0} pt</div>
      </div>
      <button class="btn-follow following" onclick="unfollow(${u.id},this)">Segui già</button>
    </div>`).join('');
  setTimeout(() => list.forEach(u => drawMii(u,'fgAv'+u.id,44)), 50);
}

async function unfollow(userId, btn) {
  const d = await api(`/api/follow/${userId}`,'DELETE');
  if (d.error) return showN('❌ '+d.error,'error');
  showN('👋 Non segui più questo utente','info');
  loadFollowing();
}
window.unfollow = unfollow;

// ══════════════════════════════════════════
//   GRUPPI
// ══════════════════════════════════════════
async function loadGroups() {
  const list = await api('/api/groups');
  const el   = document.getElementById('groupList');
  if (!el) return;
  if (!list.length||list.error) { el.innerHTML=`<div class="empty"><div class="ei">👥</div><p>Nessun gruppo. Creane uno!</p></div>`; return; }
  el.innerHTML = list.map(g => `
    <div class="group-card">
      <div class="group-icon">👥</div>
      <div class="group-info">
        <div class="group-name">${g.name}</div>
        <div class="group-desc">${g.description||''}</div>
        <div class="group-meta">👤 ${g.member_count} membri · ${g.is_public?'🌍 Pubblico':'🔒 Privato'}</div>
      </div>
      <button class="btn-join ${g.is_member?'leave':''}" onclick="${g.is_member?`leaveGroup(${g.id},this)`:`joinGroup(${g.id},this)`}">
        ${g.is_member?'Abbandona':'Unisciti'}
      </button>
    </div>`).join('');
}

async function joinGroup(id, btn) {
  const d = await api(`/api/groups/${id}/join`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  showN('🎉 Sei entrato nel gruppo!','success');
  loadGroups();
}
async function leaveGroup(id, btn) {
  const d = await api(`/api/groups/${id}/leave`,'DELETE');
  if (d.error) return showN('❌ '+d.error,'error');
  showN('👋 Hai abbandonato il gruppo','info');
  loadGroups();
}
function toggleGroupForm() {
  const f = document.getElementById('groupForm');
  f.style.display = f.style.display==='none' ? 'block' : 'none';
}
async function createGroup() {
  const d = await api('/api/groups','POST',{
    name:      document.getElementById('gName').value,
    description:document.getElementById('gDesc').value,
    is_public: document.getElementById('gPublic').checked
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('🎉 Gruppo creato!','success');
  toggleGroupForm();
  loadGroups();
}
window.joinGroup=joinGroup; window.leaveGroup=leaveGroup;
window.toggleGroupForm=toggleGroupForm; window.createGroup=createGroup;
// ══════════════════════════════════════════
//   MII AVATAR BUILDER
// ══════════════════════════════════════════
const AVATAR_COLORS = ['#16a34a','#3b82f6','#8b5cf6','#ef4444','#f59e0b','#ec4899','#14b8a6','#f97316'];
const SKIN_COLORS   = ['#fde68a','#fcd9a0','#d4a76a','#a0714a','#7c4a2d','#f5cba7','#e8a87c','#c68642'];
const EYE_OPTS      = ['normal','happy','sleepy','surprised','wink','cool'];
const MOUTH_OPTS    = ['smile','grin','open','sad','smirk','tongue'];
const HAIR_OPTS     = ['none','short','long','curly','bun','mohawk','wavy','cap'];

let miiState = {
  color: '#16a34a',
  skin:  '#fde68a',
  eyes:  'normal',
  mouth: 'smile',
  hair:  'none'
};

function drawMii(user, canvasId, size=120, canvasEl=null) {
  const canvas = canvasEl || document.getElementById(canvasId);
  if (!canvas) return;
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx  = size/2, cy = size/2, r = size/2;

  const color = user?.avatar_color || miiState.color || '#16a34a';
  const skin  = user?.avatar_skin  || miiState.skin  || '#fde68a';
  const eyes  = user?.avatar_eyes  || miiState.eyes  || 'normal';
  const mouth = user?.avatar_mouth || miiState.mouth || 'smile';
  const hair  = user?.avatar_hair  || miiState.hair  || 'none';

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  const grad = ctx.createRadialGradient(cx-r*.2, cy-r*.2, r*.1, cx, cy, r);
  grad.addColorStop(0, lighten(color, 40));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fill();

  // Body / shirt
  ctx.beginPath();
  ctx.ellipse(cx, cy + r*.85, r*.55, r*.35, 0, Math.PI, 0);
  ctx.fillStyle = darken(color, 15);
  ctx.fill();

  // Neck
  ctx.beginPath();
  ctx.roundRect(cx - r*.12, cy + r*.28, r*.24, r*.22, 4);
  ctx.fillStyle = skin;
  ctx.fill();

  // Face
  ctx.beginPath();
  ctx.ellipse(cx, cy + r*.05, r*.38, r*.42, 0, 0, Math.PI*2);
  const skinGrad = ctx.createRadialGradient(cx - r*.1, cy - r*.05, r*.05, cx, cy, r*.5);
  skinGrad.addColorStop(0, lighten(skin, 20));
  skinGrad.addColorStop(1, skin);
  ctx.fillStyle = skinGrad;
  ctx.fill();

  // Cheek blush
  ctx.beginPath();
  ctx.ellipse(cx - r*.22, cy + r*.18, r*.1, r*.07, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,150,150,.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r*.22, cy + r*.18, r*.1, r*.07, 0, 0, Math.PI*2);
  ctx.fill();

  // Hair
  drawHair(ctx, cx, cy, r, color, hair, skin);

  // Eyes
  drawEyes(ctx, cx, cy, r, eyes, color);

  // Mouth
  drawMouth(ctx, cx, cy, r, mouth);

  // Nose (small dot)
  ctx.beginPath();
  ctx.arc(cx, cy + r*.1, r*.03, 0, Math.PI*2);
  ctx.fillStyle = darken(skin, 20);
  ctx.fill();
}

function drawHair(ctx, cx, cy, r, color, style, skin) {
  const hc = darken(color, 25);
  ctx.fillStyle = hc;
  switch(style) {
    case 'short':
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*.28, r*.38, r*.22, 0, Math.PI, 0);
      ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*.28, r*.4, r*.24, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - r*.4, cy - r*.25, r*.18, r*.55);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx + r*.22, cy - r*.25, r*.18, r*.55);
      ctx.fill();
      break;
    case 'curly':
      for (let i=0; i<6; i++) {
        const angle = (Math.PI / 5) * i - Math.PI*.1;
        const hx = cx + Math.cos(angle) * r*.32;
        const hy = cy - r*.18 + Math.sin(angle) * r*.15;
        ctx.beginPath();
        ctx.arc(hx, hy, r*.12, 0, Math.PI*2);
        ctx.fill();
      }
      break;
    case 'bun':
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*.3, r*.36, r*.2, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - r*.38, r*.12, 0, Math.PI*2);
      ctx.fill();
      break;
    case 'mohawk':
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*.28, r*.14, r*.32, 0, 0, Math.PI*2);
      ctx.fill();
      break;
    case 'wavy':
      ctx.beginPath();
      ctx.moveTo(cx - r*.38, cy - r*.15);
      for (let x = -r*.38; x <= r*.38; x += r*.1) {
        ctx.quadraticCurveTo(cx + x + r*.05, cy - r*.38, cx + x + r*.1, cy - r*.2);
      }
      ctx.lineTo(cx + r*.38, cy - r*.15);
      ctx.arc(cx, cy - r*.15, r*.38, 0, Math.PI, true);
      ctx.fill();
      break;
    case 'cap':
      // Bill
      ctx.beginPath();
      ctx.ellipse(cx + r*.12, cy - r*.12, r*.3, r*.08, -.2, 0, Math.PI*2);
      ctx.fill();
      // Cap
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*.2, r*.38, r*.26, 0, Math.PI, 0);
      ctx.fill();
      break;
    default:
      break;
  }
}

function drawEyes(ctx, cx, cy, r, style, color) {
  const ey = cy - r*.07;
  const ex1 = cx - r*.14, ex2 = cx + r*.14;
  const es  = r*.065;

  switch(style) {
    case 'happy':
      [[ex1,ey],[ex2,ey]].forEach(([x,y]) => {
        ctx.beginPath();
        ctx.arc(x, y, es, Math.PI, 0);
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = r*.04;
        ctx.stroke();
      });
      break;
    case 'sleepy':
      [[ex1,ey],[ex2,ey]].forEach(([x,y]) => {
        ctx.beginPath();
        ctx.arc(x, y+es*.3, es, Math.PI, 0);
        ctx.fillStyle = '#1e293b'; ctx.fill();
        ctx.beginPath();
        ctx.rect(x-es, y-es*.3, es*2, es*.8);
        ctx.fillStyle = '#fde68a'; ctx.fill();
      });
      break;
    case 'surprised':
      [[ex1,ey],[ex2,ey]].forEach(([x,y]) => {
        ctx.beginPath();
        ctx.arc(x, y, es*1.3, 0, Math.PI*2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, es*.7, 0, Math.PI*2);
        ctx.fillStyle = '#1e293b'; ctx.fill();
      });
      break;
    case 'wink':
      // Left eye wink
      ctx.beginPath();
      ctx.arc(ex1, ey, es, Math.PI, 0);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = r*.04; ctx.stroke();
      // Right eye normal
      ctx.beginPath();
      ctx.arc(ex2, ey, es, 0, Math.PI*2);
      ctx.fillStyle = '#1e293b'; ctx.fill();
      ctx.beginPath();
      ctx.arc(ex2 + es*.25, ey - es*.25, es*.3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      break;
    case 'cool':
      // Sunglasses
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(ex1 - es*1.1, ey - es*.8, es*2.2, es*1.6, es*.4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(ex2 - es*1.1, ey - es*.8, es*2.2, es*1.6, es*.4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ex1 + es*1.1, ey); ctx.lineTo(ex2 - es*1.1, ey);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = es*.4; ctx.stroke();
      break;
    default: // normal
      [[ex1,ey],[ex2,ey]].forEach(([x,y]) => {
        ctx.beginPath();
        ctx.arc(x, y, es, 0, Math.PI*2);
        ctx.fillStyle = '#1e293b'; ctx.fill();
        ctx.beginPath();
        ctx.arc(x + es*.3, y - es*.3, es*.35, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      });
  }
}

function drawMouth(ctx, cx, cy, r, style) {
  const my = cy + r*.22;
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth   = r*.04;
  ctx.lineCap     = 'round';

  switch(style) {
    case 'grin':
      ctx.beginPath();
      ctx.arc(cx, my - r*.06, r*.16, .15*Math.PI, .85*Math.PI);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.stroke();
      // Teeth
      ctx.fillStyle = 'white';
      ctx.fillRect(cx - r*.12, my - r*.09, r*.24, r*.07);
      break;
    case 'open':
      ctx.beginPath();
      ctx.ellipse(cx, my, r*.1, r*.08, 0, 0, Math.PI*2);
      ctx.fillStyle = '#7f1d1d'; ctx.fill();
      break;
    case 'sad':
      ctx.beginPath();
      ctx.arc(cx, my + r*.1, r*.14, 1.2*Math.PI, 1.8*Math.PI);
      ctx.stroke();
      break;
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(cx - r*.1, my + r*.02);
      ctx.quadraticCurveTo(cx, my - r*.04, cx + r*.14, my - r*.06);
      ctx.stroke();
      break;
    case 'tongue':
      ctx.beginPath();
      ctx.arc(cx, my - r*.04, r*.13, .1*Math.PI, .9*Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, my + r*.04, r*.07, r*.06, 0, 0, Math.PI*2);
      ctx.fillStyle = '#f87171'; ctx.fill();
      break;
    default: // smile
      ctx.beginPath();
      ctx.arc(cx, my - r*.06, r*.14, .15*Math.PI, .85*Math.PI);
      ctx.stroke();
  }
}

// Color helpers
function lighten(hex, pct) {
  const n = parseInt(hex.replace('#',''),16);
  const r = Math.min(255,((n>>16)&255)+pct*2.55|0);
  const g = Math.min(255,((n>>8)&255)+pct*2.55|0);
  const b = Math.min(255,(n&255)+pct*2.55|0);
  return `rgb(${r},${g},${b})`;
}
function darken(hex, pct) {
  const n = parseInt(hex.replace('#',''),16);
  const r = Math.max(0,((n>>16)&255)-pct*2.55|0);
  const g = Math.max(0,((n>>8)&255)-pct*2.55|0);
  const b = Math.max(0,(n&255)-pct*2.55|0);
  return `rgb(${r},${g},${b})`;
}

// ══════════════════════════════════════════
//   PROFILO
// ══════════════════════════════════════════
async function loadProfile() {
  const d = await api('/api/profile');
  if (d.error) return;
  myProfile = d;

  document.getElementById('pName').value     = d.name     || '';
  document.getElementById('pUsername').value = d.username || '';
  document.getElementById('pBio').value      = d.bio      || '';
  document.getElementById('sbName').childNodes[0].textContent = (d.name||d.email)+' ';

  // Profile stats
  const ps = document.getElementById('profileStats');
  if (ps) ps.innerHTML = `
    <div class="ps-item"><div class="ps-val">${Math.round(d.points||0)}</div><div class="ps-lbl">Punti</div></div>
    <div class="ps-item"><div class="ps-val">${parseFloat(d.co2_saved||0).toFixed(1)}</div><div class="ps-lbl">kg CO₂</div></div>
    <div class="ps-item"><div class="ps-val">${d.followers||0}</div><div class="ps-lbl">Follower</div></div>`;

  // Sync mii state
  miiState = {
    color: d.avatar_color || '#16a34a',
    skin:  d.avatar_skin  || '#fde68a',
    eyes:  d.avatar_eyes  || 'normal',
    mouth: d.avatar_mouth || 'smile',
    hair:  d.avatar_hair  || 'none'
  };

  renderMiiBuilder();
  drawMii(miiState, 'miiCanvas',  120);
  drawMii(miiState, 'sbAvatarCanvas', 36);
}

function renderMiiBuilder() {
  // Avatar colors
  const acEl = document.getElementById('avatarColors');
  if (acEl) acEl.innerHTML = AVATAR_COLORS.map(c => `
    <div class="color-swatch ${miiState.color===c?'active':''}"
      style="background:${c}"
      onclick="setMii('color','${c}',this)">
    </div>`).join('');

  // Skin colors
  const scEl = document.getElementById('skinColors');
  if (scEl) scEl.innerHTML = SKIN_COLORS.map(c => `
    <div class="color-swatch ${miiState.skin===c?'active':''}"
      style="background:${c}"
      onclick="setMii('skin','${c}',this)">
    </div>`).join('');

  // Eye opts
  const eyEl = document.getElementById('eyeOpts');
  if (eyEl) eyEl.innerHTML = EYE_OPTS.map(o => `
    <button class="mii-opt-btn ${miiState.eyes===o?'active':''}"
      onclick="setMii('eyes','${o}',this)">
      ${o==='normal'?'😐':o==='happy'?'😊':o==='sleepy'?'😴':o==='surprised'?'😲':o==='wink'?'😉':'😎'}
      ${o}
    </button>`).join('');

  // Mouth opts
  const moEl = document.getElementById('mouthOpts');
  if (moEl) moEl.innerHTML = MOUTH_OPTS.map(o => `
    <button class="mii-opt-btn ${miiState.mouth===o?'active':''}"
      onclick="setMii('mouth','${o}',this)">
      ${o==='smile'?'🙂':o==='grin'?'😁':o==='open'?'😮':o==='sad'?'🙁':o==='smirk'?'😏':'😛'}
      ${o}
    </button>`).join('');

  // Hair opts
  const haEl = document.getElementById('hairOpts');
  if (haEl) haEl.innerHTML = HAIR_OPTS.map(o => `
    <button class="mii-opt-btn ${miiState.hair===o?'active':''}"
      onclick="setMii('hair','${o}',this)">
      ${o==='none'?'🚫':o==='short'?'👦':o==='long'?'👩':o==='curly'?'🌀':o==='bun'?'🎀':o==='mohawk'?'🦔':o==='wavy'?'🌊':'🧢'}
      ${o}
    </button>`).join('');
}

function setMii(key, val, btn) {
  miiState[key] = val;

  // Update active class
  const parentRow = btn.closest('.color-row, .mii-btn-row');
  if (parentRow) parentRow.querySelectorAll('.active').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  // Redraw
  drawMii(miiState, 'miiCanvas', 120);
  drawMii(miiState, 'sbAvatarCanvas', 36);
}
window.setMii = setMii;

async function saveProfile() {
  const d = await api('/api/profile','PATCH',{
    name:         document.getElementById('pName').value,
    username:     document.getElementById('pUsername').value,
    bio:          document.getElementById('pBio').value,
    avatar_color: miiState.color,
    avatar_skin:  miiState.skin,
    avatar_eyes:  miiState.eyes,
    avatar_mouth: miiState.mouth,
    avatar_hair:  miiState.hair
  });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Profilo salvato!','success');
  loadProfile();
}
window.saveProfile = saveProfile;

// ══════════════════════════════════════════
//   MAPPA LEAFLET
// ══════════════════════════════════════════
let map         = null;
let markerFrom  = null;
let markerTo    = null;
let routeLine   = null;
let geocodeTimers = {};

const MAP_PROFILES = {
  Treno:'driving-car', Bici:'cycling-regular',
  Bus:'driving-car',   Carpooling:'driving-car'
};

function initMap() {
  if (map) return;
  const container = document.getElementById('mapContainer');
  if (!container) return;

  map = L.map('mapContainer', { zoomControl:true, attributionControl:true })
         .setView([45.4642, 9.1900], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OSM</a>',
    maxZoom: 19
  }).addTo(map);

  // Click mappa per piazzare pin
  map.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    if (!markerFrom) {
      setMapPin('from', lat, lng);
      const addr = await reverseGeocode(lat, lng);
      document.getElementById('iFrom').value = addr;
    } else if (!markerTo) {
      setMapPin('to', lat, lng);
      const addr = await reverseGeocode(lat, lng);
      document.getElementById('iTo').value = addr;
      calcRoute();
    } else {
      clearPins();
      setMapPin('from', lat, lng);
      const addr = await reverseGeocode(lat, lng);
      document.getElementById('iFrom').value = addr;
    }
  });
}

function makePin(type) {
  const color = type==='from' ? '#16a34a' : '#ef4444';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;
      border-radius:50% 50% 50% 0;
      background:${color};
      border:3px solid white;
      box-shadow:0 3px 12px rgba(0,0,0,.35);
      transform:rotate(-45deg);
    "></div>`,
    iconSize:[26,26], iconAnchor:[13,26]
  });
}

function setMapPin(type, lat, lng) {
  const icon = makePin(type);
  if (type==='from') {
    if (markerFrom) map.removeLayer(markerFrom);
    markerFrom = L.marker([lat,lng],{ icon, draggable:true }).addTo(map);
    markerFrom.on('dragend', async e => {
      const p = e.target.getLatLng();
      document.getElementById('iFrom').value = await reverseGeocode(p.lat, p.lng);
      if (markerTo) calcRoute();
    });
  } else {
    if (markerTo) map.removeLayer(markerTo);
    markerTo = L.marker([lat,lng],{ icon, draggable:true }).addTo(map);
    markerTo.on('dragend', async e => {
      const p = e.target.getLatLng();
      document.getElementById('iTo').value = await reverseGeocode(p.lat, p.lng);
      if (markerFrom) calcRoute();
    });
  }
}

function clearPins() {
  if (markerFrom) { map.removeLayer(markerFrom); markerFrom=null; }
  if (markerTo)   { map.removeLayer(markerTo);   markerTo=null;   }
  if (routeLine)  { map.removeLayer(routeLine);   routeLine=null;  }
  calcedKm = 0;
  document.getElementById('routeInfo').style.display = 'none';
  document.getElementById('iFrom').value = '';
  document.getElementById('iTo').value   = '';
  updPreview();
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers:{ 'Accept-Language':'it' } }
    );
    const d = await r.json();
    return d.display_name?.split(',').slice(0,3).join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

async function geocodeLive(type) {
  const id     = type==='from' ? 'iFrom' : 'iTo';
  const suggId = type==='from' ? 'fromSugg' : 'toSugg';
  const q      = document.getElementById(id).value.trim();
  const sugg   = document.getElementById(suggId);
  clearTimeout(geocodeTimers[type]);
  if (q.length < 3) { sugg.innerHTML=''; return; }
  geocodeTimers[type] = setTimeout(async () => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
        { headers:{ 'Accept-Language':'it' } }
      );
      const results = await r.json();
      sugg.innerHTML = results.map(p => `
        <div class="addr-sugg-item"
          onclick="selectAddr('${type}',${p.lat},${p.lon},\`${p.display_name.replace(/`/g,"'").replace(/"/g,'&quot;')}\`)">
          <i class="fas fa-map-marker-alt"></i>
          <span>${p.display_name.split(',').slice(0,3).join(', ')}</span>
        </div>`).join('');
    } catch {}
  }, 400);
}
window.geocodeLive = geocodeLive;

window.selectAddr = async function(type, lat, lng, label) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  const id     = type==='from' ? 'iFrom' : 'iTo';
  const suggId = type==='from' ? 'fromSugg' : 'toSugg';
  document.getElementById(id).value       = label.split(',').slice(0,3).join(', ');
  document.getElementById(suggId).innerHTML = '';
  setMapPin(type, lat, lng);
  map.setView([lat,lng], 13);
  if (markerFrom && markerTo) calcRoute();
};

window.calcRoute = async function() {
  if (!markerFrom || !markerTo) return showN('⚠️ Inserisci partenza e destinazione!','error');
  const btn = document.querySelector('.btn-calc-route');
  if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Calcolo...'; btn.disabled=true; }

  const f = markerFrom.getLatLng();
  const t = markerTo.getLatLng();
  const profile = MAP_PROFILES[curAct] || 'driving-car';

  const d = await api('/api/route-distance','POST',{
    fromLat: f.lat, fromLng: f.lng,
    toLat:   t.lat, toLng:   t.lng,
    profile
  });

  if (btn) { btn.innerHTML='<i class="fas fa-route"></i> Calcola'; btn.disabled=false; }
  if (d.error) return showN('❌ Percorso non trovato. Prova indirizzi diversi.','error');

  calcedKm = d.km;

  // Disegna percorso
  if (routeLine) map.removeLayer(routeLine);
  let latlngs;
  try   { latlngs = decodePolyline(d.geometry); }
  catch { latlngs = [[f.lat,f.lng],[t.lat,t.lng]]; }

  routeLine = L.polyline(latlngs, {
    color:'#16a34a', weight:5, opacity:.9
  }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding:[40,40] });

  // Route info box
  const rr    = RATES[curAct];
  const co2   = (calcedKm * rr.co2).toFixed(2);
  const pts   = Math.round(calcedKm * rr.pts);
  document.getElementById('routeKm').textContent   = d.km   + ' km';
  document.getElementById('routeMins').textContent  = d.mins + ' min';
  document.getElementById('routeCo2').textContent   = co2   + ' kg CO₂ salvata';
  document.getElementById('routePts').textContent   = '+' + pts + ' punti';
  document.getElementById('routeInfo').style.display = 'flex';

  // Aggiorna stima
  document.getElementById('pCO2').textContent = co2;
  document.getElementById('pPts').textContent = pts;
  document.getElementById('pKm').textContent  = d.km;
};

function decodePolyline(encoded) {
  let idx=0, lat=0, lng=0, res=[];
  while (idx < encoded.length) {
    let b, shift=0, result=0;
    do { b=encoded.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20);
    lat += (result&1) ? ~(result>>1) : (result>>1);
    shift=0; result=0;
    do { b=encoded.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20);
    lng += (result&1) ? ~(result>>1) : (result>>1);
    res.push([lat/1e5, lng/1e5]);
  }
  return res;
}
// ══════════════════════════════════════════
//   LOG ATTIVITÀ
// ══════════════════════════════════════════
function selAct(type, btn) {
  curAct  = type;
  calcedKm = 0;

  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  const isRemote  = type==='Remoto'   || type==='Videocall';
  const hasMap    = type==='Treno'    || type==='Bici' ||
                    type==='Bus'      || type==='Carpooling';

  document.getElementById('logForm').style.display   = 'block';
  document.getElementById('hrRow').style.display     = isRemote ? 'block' : 'none';
  document.getElementById('mapBlock').style.display  = hasMap   ? 'block' : 'none';
  document.getElementById('cpRow').style.display     = type==='Carpooling' ? 'block' : 'none';

  const emojis = { Remoto:'🏠', Treno:'🚂', Bici:'🚴', Bus:'🚌', Carpooling:'🚗', Videocall:'💻' };
  document.getElementById('logTitle').innerHTML =
    `${emojis[type]||'📌'} <span style="color:var(--green)">${type}</span>`;

  // Reset mappa se cambio tipo
  if (hasMap) {
    setTimeout(() => {
      initMap();
      if (map) map.invalidateSize();
    }, 100);
  }

  // Reset route info
  if (document.getElementById('routeInfo'))
    document.getElementById('routeInfo').style.display = 'none';
  calcedKm = 0;
  updPreview();
}
window.selAct = selAct;

function updPreview() {
  const rr = RATES[curAct];
  if (!rr) return;
  let val = 0;
  if (rr.t === 'k') val = calcedKm || 0;
  if (rr.t === 'h') val = parseFloat(document.getElementById('iHr')?.value) || 0;
  const co2 = (val * rr.co2).toFixed(2);
  const pts = Math.round(val * rr.pts);
  if (document.getElementById('pCO2')) document.getElementById('pCO2').textContent = co2;
  if (document.getElementById('pPts')) document.getElementById('pPts').textContent = pts;
  if (document.getElementById('pKm'))  document.getElementById('pKm').textContent  = rr.t==='k' ? (calcedKm||'—') : '—';
}
window.updPreview = updPreview;

async function saveAct() {
  if (!curAct) return showN('⚠️ Seleziona un tipo di attività!','error');

  const rr    = RATES[curAct];
  const hours = parseFloat(document.getElementById('iHr')?.value)  || 0;
  const note  = document.getElementById('iNote')?.value || '';
  const cp    = document.getElementById('iCp')?.value   || '';

  const fromAddr = document.getElementById('iFrom')?.value || '';
  const toAddr   = document.getElementById('iTo')?.value   || '';

  // Validazione
  if (rr.t==='h' && hours <= 0) return showN('⚠️ Inserisci le ore lavorate!','error');
  if (rr.t==='k' && calcedKm <= 0) return showN('⚠️ Calcola prima il percorso sulla mappa!','error');

  const payload = {
    type:            curAct,
    km:              rr.t==='k' ? calcedKm : 0,
    hours:           rr.t==='h' ? hours    : 0,
    note,
    from_addr:       fromAddr,
    to_addr:         toAddr,
    carsharing_with: cp
  };

  const btn = document.querySelector('.btn-save');
  if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvo...'; btn.disabled=true; }

  const d = await api('/api/activity','POST', payload);

  if (btn) { btn.innerHTML='<i class="fas fa-check"></i> Salva'; btn.disabled=false; }
  if (d.error) return showN('❌ '+d.error,'error');

  showN(`✅ Attività salvata! +${d.points} punti 🌱`,'success');
  cancelAct();
  loadAll();
}
window.saveAct = saveAct;

function cancelAct() {
  curAct   = null;
  calcedKm = 0;
  document.getElementById('logForm').style.display  = 'none';
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('sel'));

  // Reset inputs
  const ids = ['iHr','iNote','iCp','iFrom','iTo'];
  ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });

  // Reset mappa
  if (map && markerFrom) { map.removeLayer(markerFrom); markerFrom=null; }
  if (map && markerTo)   { map.removeLayer(markerTo);   markerTo=null;   }
  if (map && routeLine)  { map.removeLayer(routeLine);  routeLine=null;  }

  // Reset route info e stima
  const ri = document.getElementById('routeInfo');
  if (ri) ri.style.display = 'none';
  if (document.getElementById('pCO2')) document.getElementById('pCO2').textContent = '0';
  if (document.getElementById('pPts')) document.getElementById('pPts').textContent = '0';
  if (document.getElementById('pKm'))  document.getElementById('pKm').textContent  = '—';

  // Nascondi suggerimenti
  ['fromSugg','toSugg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}
window.cancelAct = cancelAct;

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdminUsers() {
  const list = await api('/api/admin/users');
  if (list.error) return showN('❌ Accesso negato','error');

  // Stats
  document.getElementById('admTotUsers').textContent = list.length;
  document.getElementById('admTotActs').textContent  =
    list.reduce((s,u) => s + parseInt(u.activity_count||0), 0);
  document.getElementById('admTotCo2').textContent   =
    list.reduce((s,u) => s + parseFloat(u.co2_saved||0), 0).toFixed(1);

  const tbody = document.getElementById('adminUsersList');
  tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div class="u-info">
          <div class="u-av"><canvas width="36" height="36" id="admAv${u.id}"></canvas></div>
          <div>
            <div class="u-name">${u.name||'—'} ${u.is_admin?'<span class="admin-badge">ADMIN</span>':''}</div>
            <div class="u-email">@${u.username||'—'} · ${u.email}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="pill ${u.is_admin?'pill-yellow':'pill-gray'}">
          ${u.is_admin?'👑 Admin':'👤 User'}
        </span>
      </td>
      <td><strong>⭐ ${Math.round(u.points||0)}</strong></td>
      <td>${parseFloat(u.co2_saved||0).toFixed(1)} kg</td>
      <td>
        <span class="pill ${u.is_banned?'pill-red':'pill-green'}">
          ${u.is_banned ? '⛔ Bannato' : '✅ Attivo'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-icon" title="Vedi attività" onclick="viewUserActs(${u.id},'${u.name||u.email}')">
            <i class="fas fa-list"></i>
          </button>
          <button class="btn-icon crown" title="Toggle admin" onclick="toggleAdmin(${u.id},${!u.is_admin})">
            <i class="fas fa-crown"></i>
          </button>
          <button class="btn-icon warn" title="Avviso" onclick="openWarnModal(${u.id})">
            <i class="fas fa-exclamation-triangle"></i>
          </button>
          <button class="btn-icon reset" title="Azzera punti" onclick="resetPoints(${u.id})">
            <i class="fas fa-undo"></i>
          </button>
          ${u.is_banned
            ? `<button class="btn-icon" title="Rimuovi ban" onclick="unbanUser(${u.id})" style="color:var(--green)"><i class="fas fa-unlock"></i></button>`
            : `<button class="btn-icon ban" title="Banna" onclick="openBanModal(${u.id})"><i class="fas fa-ban"></i></button>`
          }
          <button class="btn-icon del" title="Elimina utente" onclick="deleteUser(${u.id},'${u.name||u.email}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');

  setTimeout(() => list.forEach(u => drawMii(u, 'admAv'+u.id, 36)), 50);
}
window.loadAdminUsers = loadAdminUsers;

async function viewUserActs(userId, name) {
  document.getElementById('actsModalTitle').textContent = `Attività di ${name}`;
  document.getElementById('actsModal').style.display   = 'flex';
  const body = document.getElementById('actsModalBody');
  body.innerHTML = '<div style="text-align:center;padding:30px"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--muted)"></i></div>';
  const list = await api(`/api/admin/activities/${userId}`);
  if (!list.length) { body.innerHTML='<p style="text-align:center;color:var(--muted);padding:20px">Nessuna attività.</p>'; return; }
  body.innerHTML = list.map(a => `
    <div class="adm-act-item">
      <div style="font-size:24px">${ICONS[a.type]||'📌'}</div>
      <div style="flex:1">
        <div style="font-weight:700">${a.type}</div>
        <div style="font-size:12px;color:var(--muted)">
          ${a.km>0?`${a.from_addr||''} → ${a.to_addr||''} · ${a.km} km`:''}
          ${a.hours>0?`${a.hours}h`:''}
          ${a.note?`· ${a.note}`:''}
        </div>
        <div style="font-size:11px;color:var(--muted2)">${new Date(a.date).toLocaleString('it-IT')}</div>
      </div>
      <span class="tag tag-g">🌱 ${a.co2_saved} kg</span>
      <span class="tag tag-y">⭐ ${a.points}</span>
      <button class="adm-act-del" onclick="deleteAct(${a.id},${userId},'${name}')">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}
window.viewUserActs = viewUserActs;

async function deleteAct(actId, userId, name) {
  openConfirm('🗑️','Elimina attività','Questa azione rimuoverà i punti dall\'utente. Confermi?', async () => {
    const d = await api(`/api/admin/activity/${actId}`,'DELETE');
    if (d.error) return showN('❌ '+d.error,'error');
    showN('🗑️ Attività eliminata','info');
    viewUserActs(userId, name);
    loadAdminUsers();
  });
}
window.deleteAct = deleteAct;

async function toggleAdmin(userId, makeAdmin) {
  openConfirm(
    makeAdmin?'👑':'👤',
    makeAdmin?'Promuovi ad Admin':'Rimuovi ruolo Admin',
    makeAdmin?'Questo utente avrà accesso al pannello admin.':'Questo utente perderà i privilegi admin.',
    async () => {
      const d = await api(`/api/admin/user/${userId}/role`,'PATCH',{ is_admin:makeAdmin });
      if (d.error) return showN('❌ '+d.error,'error');
      showN(makeAdmin?'👑 Admin assegnato!':'👤 Ruolo rimosso','info');
      loadAdminUsers();
    }
  );
}
window.toggleAdmin = toggleAdmin;

async function resetPoints(userId) {
  openConfirm('🔄','Azzera Punti','Tutti i punti e le CO₂ di questo utente verranno azzerati.', async () => {
    const d = await api(`/api/admin/user/${userId}/reset-points`,'POST');
    if (d.error) return showN('❌ '+d.error,'error');
    showN('🔄 Punti azzerati','info');
    loadAdminUsers();
  });
}
window.resetPoints = resetPoints;

// Ban Modal
let pendingBanUserId = null;
function openBanModal(userId) {
  pendingBanUserId = userId;
  document.getElementById('banReason').value = '';
  document.getElementById('banDays').value   = '';
  document.getElementById('banModal').style.display = 'flex';
  document.getElementById('banConfirmBtn').onclick = async () => {
    const reason = document.getElementById('banReason').value;
    const days   = parseInt(document.getElementById('banDays').value) || 0;
    const d = await api(`/api/admin/user/${pendingBanUserId}/ban`,'POST',{ reason, days:days||null });
    if (d.error) return showN('❌ '+d.error,'error');
    document.getElementById('banModal').style.display = 'none';
    showN('⛔ Utente bannato','info');
    loadAdminUsers();
  };
}
window.openBanModal = openBanModal;

async function unbanUser(userId) {
  const d = await api(`/api/admin/user/${userId}/unban`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Ban rimosso','success');
  loadAdminUsers();
}
window.unbanUser = unbanUser;

// Warn Modal
let pendingWarnUserId = null;
function openWarnModal(userId) {
  pendingWarnUserId = userId;
  document.getElementById('warnMsg').value = '';
  document.getElementById('warnModal').style.display = 'flex';
  document.getElementById('warnConfirmBtn').onclick = async () => {
    const message = document.getElementById('warnMsg').value;
    if (!message) return showN('⚠️ Scrivi un messaggio!','error');
    const d = await api(`/api/admin/user/${pendingWarnUserId}/warn`,'POST',{ message });
    if (d.error) return showN('❌ '+d.error,'error');
    document.getElementById('warnModal').style.display = 'none';
    showN('⚠️ Avviso inviato','info');
  };
}
window.openWarnModal = openWarnModal;

async function deleteUser(userId, name) {
  openConfirm('🗑️',`Elimina ${name}`,
    'Questa azione è irreversibile. Tutte le attività verranno eliminate.',
    async () => {
      const d = await api(`/api/admin/user/${userId}`,'DELETE');
      if (d.error) return showN('❌ '+d.error,'error');
      showN('🗑️ Utente eliminato','info');
      loadAdminUsers();
    }
  );
}
window.deleteUser = deleteUser;

function closeActsModal(e) {
  if (e.target === document.getElementById('actsModal'))
    document.getElementById('actsModal').style.display = 'none';
}
window.closeActsModal = closeActsModal;

// ══════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════
let confirmCb = null;
function openConfirm(icon, title, msg, cb) {
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  document.getElementById('confirmModal').style.display = 'flex';
  confirmCb = cb;
  document.getElementById('confirmYes').onclick = async () => {
    closeConfirm();
    if (confirmCb) await confirmCb();
  };
}
function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCb = null;
}
window.openConfirm = openConfirm;
window.closeConfirm = closeConfirm;

// ══════════════════════════════════════════
//   CLICK OUTSIDE SUGGERIMENTI
// ══════════════════════════════════════════
document.addEventListener('click', e => {
  if (!e.target.closest('.map-search-wrap')) {
    document.querySelectorAll('.addr-sugg').forEach(s => s.innerHTML='');
  }
});

// ══════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════
if (token) {
  api('/api/profile').then(d => {
    if (d.error) {
      localStorage.removeItem('ecotoken');
      token = null;
      return;
    }
    bootApp(d);
  });
} else {
  document.getElementById('authWrap').style.display = 'flex';
  document.getElementById('app').style.display      = 'none';
}

}); // end DOMContentLoaded
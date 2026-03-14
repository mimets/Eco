'use strict';

// ══════════════════════════════════════════
//   GLOBALS
// ══════════════════════════════════════════
let token      = localStorage.getItem('ecotoken') || null;
let myProfile  = null;
let mapInited  = false;
let map        = null;
let routeLayer = null;
let markerFrom = null;
let markerTo   = null;
let satellite  = false;
let tileLayer  = null;
let selectedAct= null;
let allShopItems = [];
let ownedItems   = [];
let shopFilter   = 'all';
let confirmCb    = null;
let tutStep      = 0;
let searchTimer  = null;
let openGroupLbs = {};

const miiState = {
  color: '#16a34a',
  skin:  '#fde68a',
  eyes:  'normal',
  mouth: 'smile',
  hair:  'none'
};

// ══════════════════════════════════════════
//   API HELPER
// ══════════════════════════════════════════
async function api(url, method='GET', body=null) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type':'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body)  opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    const data = await res.json().catch(()=>({}));
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  } catch(e) {
    console.error('API error:', e);
    return { error: 'Errore di connessione' };
  }
}

// ══════════════════════════════════════════
//   NOTIFICATION TOAST
// ══════════════════════════════════════════
function showN(msg, type='success', dur=3000) {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg;
  el.className   = `notif ${type} show`;
  setTimeout(() => el.classList.remove('show'), dur);
}

// ══════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════
function showConfirm(title, msg, cb, icon='❓') {
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  document.getElementById('confirmOverlay').style.display = 'flex';
  confirmCb = cb;
}
function confirmYes() {
  document.getElementById('confirmOverlay').style.display = 'none';
  if (confirmCb) confirmCb();
  confirmCb = null;
}
function confirmNo() {
  document.getElementById('confirmOverlay').style.display = 'none';
  confirmCb = null;
}
window.confirmYes = confirmYes;
window.confirmNo  = confirmNo;

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
function showTutorial() {
  tutStep = 0;
  renderTut();
  document.getElementById('tutOverlay').style.display = 'flex';
}
function closeTut() {
  document.getElementById('tutOverlay').style.display = 'none';
}
function goTut(n) {
  tutStep = n;
  renderTut();
}
function tutNav(dir) {
  const steps = document.querySelectorAll('.tut-step');
  tutStep = Math.max(0, Math.min(steps.length - 1, tutStep + dir));
  renderTut();
}
function renderTut() {
  const steps = document.querySelectorAll('.tut-step');
  const dots  = document.querySelectorAll('.tut-dot');
  const prev  = document.querySelector('.tut-prev');
  const next  = document.querySelector('.tut-next');
  steps.forEach((s,i) => s.classList.toggle('active', i === tutStep));
  dots.forEach((d,i)  => d.classList.toggle('active', i === tutStep));
  if (prev) { prev.style.opacity = tutStep===0?'0':'1'; prev.style.pointerEvents = tutStep===0?'none':'auto'; }
  if (next) {
    if (tutStep === steps.length-1) {
      next.textContent = '🚀 Inizia!';
      next.onclick = closeTut;
    } else {
      next.textContent = 'Avanti →';
      next.onclick = () => tutNav(1);
    }
  }
}
window.showTutorial = showTutorial;
window.closeTut     = closeTut;
window.goTut        = goTut;
window.tutNav       = tutNav;

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
function switchTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('loginForm').style.display    = tab==='login'    ? 'flex':'none';
  document.getElementById('registerForm').style.display = tab==='register' ? 'flex':'none';
  document.getElementById('lErr').textContent = '';
  document.getElementById('rErr').textContent = '';
}
window.switchTab = switchTab;

function togglePwd(id, btn) {
  const el   = document.getElementById(id);
  if (!el) return;
  const show = el.type === 'password';
  el.type    = show ? 'text' : 'password';
  btn.innerHTML = `<i class="fas fa-eye${show?'-slash':''}"></i>`;
}
window.togglePwd = togglePwd;

function checkPwd(val) {
  [
    { id:'ph1', ok: val.length >= 8 },
    { id:'ph2', ok: /[A-Z]/.test(val) },
    { id:'ph3', ok: /[0-9]/.test(val) },
    { id:'ph4', ok: /[^A-Za-z0-9]/.test(val) }
  ].forEach(r => document.getElementById(r.id)?.classList.toggle('ok', r.ok));
}
window.checkPwd = checkPwd;

// ✅ LOGIN con username O email
async function doLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('lIdentifier').value.trim();
  const pwd        = document.getElementById('lPwd').value;
  const err        = document.getElementById('lErr');
  const btn        = e.target.querySelector('.btn-auth');
  if (!identifier || !pwd) { err.textContent = 'Compila tutti i campi'; return; }
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Accesso...</span>';
  btn.disabled  = true;
  const d = await api('/api/login','POST',{ identifier, password: pwd });
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Accedi</span>';
  btn.disabled  = false;
  if (d.error) {
    err.innerHTML = d.needsVerify
      ? `${d.error} <button class="resend-btn" onclick="resendVerify()">Reinvia email</button>`
      : d.error;
    document.getElementById('lPwd').classList.add('shake');
    setTimeout(() => document.getElementById('lPwd').classList.remove('shake'), 600);
    return;
  }
  token = d.token;
  localStorage.setItem('ecotoken', token);
  bootApp(d.user);
}
window.doLogin = doLogin;

// ✅ REGISTRAZIONE con validazione username
async function doRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('rName').value.trim();
  const username = document.getElementById('rUsername').value.trim().toLowerCase();
  const email    = document.getElementById('rEmail').value.trim();
  const pwd      = document.getElementById('rPwd').value;
  const err      = document.getElementById('rErr');
  const btn      = e.target.querySelector('.btn-auth');

  if (!name||!username||!email||!pwd)
    return (err.textContent = 'Compila tutti i campi');
  if (/\s/.test(username))
    return (err.textContent = '❌ Username senza spazi!');
  if (!/^[a-zA-Z0-9_\.]+$/.test(username))
    return (err.textContent = '❌ Username: solo lettere, numeri, _ e .');
  if (username.length < 3)
    return (err.textContent = '❌ Username min 3 caratteri');
  if (pwd.length < 8)
    return (err.textContent = '❌ Password troppo corta (min 8)');

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Registrazione...</span>';
  btn.disabled  = true;

  const d = await api('/api/register','POST',{ name, username, email, password: pwd });

  btn.innerHTML = '<i class="fas fa-user-plus"></i><span>Registrati</span>';
  btn.disabled  = false;

  if (d.error) { err.textContent = d.error; return; }

  if (d.needsVerify) {
    showVerifyScreen(email);
    return;
  }
  token = d.token;
  localStorage.setItem('ecotoken', token);
  bootApp(d.user);
  setTimeout(() => showTutorial(), 500);
}
window.doRegister = doRegister;

// ✅ Schermata verifica email
function showVerifyScreen(email) {
  const w = document.getElementById('authWrap');
  if (!w) return;
  w.innerHTML = `
    <div class="auth-card verify-card">
      <div class="verify-icon">📧</div>
      <h2 class="verify-title">Controlla la tua email!</h2>
      <p class="verify-sub">
        Abbiamo inviato un link di conferma a<br>
        <strong>${email}</strong>
      </p>
      <p class="verify-hint">
        Clicca il link nell'email per attivare il tuo account.<br>
        Poi torna qui e accedi normalmente con il tuo username.
      </p>
      <div class="verify-actions">
        <button class="btn-auth" onclick="resendVerifyTo('${email}')">
          <i class="fas fa-redo"></i><span>Reinvia email</span>
        </button>
        <button class="btn-auth btn-secondary" onclick="location.reload()">
          <i class="fas fa-sign-in-alt"></i><span>Vai al login</span>
        </button>
      </div>
      <p class="verify-spam">Non trovi l'email? Controlla la cartella spam 📂</p>
    </div>`;
}
window.showVerifyScreen = showVerifyScreen;

async function resendVerify() {
  const id = document.getElementById('lIdentifier')?.value?.trim();
  if (!id) return showN('❌ Inserisci la tua email','error');
  const email = id.includes('@') ? id : '';
  if (!email)  return showN('❌ Inserisci l\'email nel campo per il reinvio','error');
  await resendVerifyTo(email);
}
window.resendVerify = resendVerify;

async function resendVerifyTo(email) {
  const d = await api('/api/resend-verify','POST',{ email });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('📧 Email inviata! Controlla la casella.','success');
}
window.resendVerifyTo = resendVerifyTo;

function doLogout(e) {
  e?.stopPropagation();
  token = null;
  localStorage.removeItem('ecotoken');
  myProfile = null; mapInited = false; map = null;
  document.getElementById('authWrap').style.display = 'flex';
  document.getElementById('app').style.display      = 'none';
  showN('👋 Arrivederci!','info');
}
window.doLogout = doLogout;

// ══════════════════════════════════════════
//   BOOT APP
// ══════════════════════════════════════════
async function bootApp(user) {
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('app').style.display      = 'flex';
  if (user) {
    myProfile = user;
    syncMiiState(user);
    updateSidebar(user);
  }
  await loadProfile();
  await loadDashboard();
  loadNotifCount();
  setInterval(loadNotifCount, 30000);
  // mobile nav
  if (window.innerWidth <= 768)
    document.getElementById('mobNav').style.display = 'flex';
}

function syncMiiState(u) {
  miiState.color = u.avatar_color || '#16a34a';
  miiState.skin  = u.avatar_skin  || '#fde68a';
  miiState.eyes  = u.avatar_eyes  || 'normal';
  miiState.mouth = u.avatar_mouth || 'smile';
  miiState.hair  = u.avatar_hair  || 'none';
}

// ══════════════════════════════════════════
//   TABS
// ══════════════════════════════════════════
function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mn-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('tab-'+name);
  if (panel) panel.classList.add('active');
  if (btn)   btn.classList.add('active');

  const titles = {
    dashboard:   ['Dashboard',   'Bentornato! 🌱'],
    log:         ['Log Attività','Registra le tue azioni eco 🚴'],
    shop:        ['Shop Avatar', 'Spendi i tuoi punti 🛍️'],
    challenges:  ['Sfide',       'Raggiungi i tuoi obiettivi 🏆'],
    leaderboard: ['Classifica',  'Scala la vetta 🥇'],
    social:      ['Community',   'Connettiti con altri eco-warriors 👥'],
    notifiche:   ['Notifiche',   'Le tue ultime notifiche 🔔'],
    profile:     ['Profilo',     'Il tuo profilo EcoTrack 🌿'],
    admin:       ['Admin Panel', 'Gestione utenti 👑'],
  };
  const [title, sub] = titles[name] || ['EcoTrack',''];
  document.getElementById('topTitle').textContent = title;
  document.getElementById('topSub').textContent   = sub;

  // lazy load per tab
  if (name==='log')         loadActivities();
  if (name==='shop')        loadShop();
  if (name==='challenges')  loadChallenges();
  if (name==='leaderboard') loadLeaderboard();
  if (name==='social')      loadSocial();
  if (name==='notifiche')   loadNotifiche();
  if (name==='profile')     loadProfile();
  if (name==='admin')       loadAdmin();
}
window.showTab = showTab;

// ══════════════════════════════════════════
//   SIDEBAR UPDATE
// ══════════════════════════════════════════
function updateSidebar(u) {
  document.getElementById('sbName').innerHTML =
    (u.name||'Utente') +
    (u.is_admin ? ' <span class="admin-badge">👑</span>' : '');
  document.getElementById('sbEmail').textContent = '@'+(u.username||'');
  document.getElementById('topCo2').textContent  = parseFloat(u.co2_saved||0).toFixed(1);
  document.getElementById('topPts').textContent  = u.points||0;
  if (u.is_admin)
    document.getElementById('adminNavBtn').style.display = 'flex';

  // co2 progress bar
  const targets = [10,50,100,250,500,1000];
  const co2     = parseFloat(u.co2_saved||0);
  const next    = targets.find(t=>t>co2) || 1000;
  const prev    = targets[targets.indexOf(next)-1] || 0;
  const pct     = Math.min(100, ((co2-prev)/(next-prev))*100);
  const fill    = document.getElementById('sbCo2Fill');
  const val     = document.getElementById('sbCo2Val');
  const nxt     = document.getElementById('sbCo2Next');
  if (fill) fill.style.width   = pct+'%';
  if (val)  val.textContent    = co2.toFixed(1)+' kg';
  if (nxt)  nxt.textContent    = `Prossimo badge: ${next} kg`;

  // avatar sidebar
  drawMii(miiState,'sbAvatarCanvas',36);
}

// ══════════════════════════════════════════
//   MII AVATAR DRAW
// ══════════════════════════════════════════
function drawMii(state, canvasId, size=120) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const s   = size;
  const cx  = s/2, cy = s/2;
  ctx.clearRect(0,0,s,s);

  // BG circle
  ctx.beginPath();
  ctx.arc(cx,cy,s/2,0,Math.PI*2);
  ctx.fillStyle = state.color || '#16a34a';
  ctx.fill();

  // Face
  const faceR = s*0.32;
  ctx.beginPath();
  ctx.arc(cx, cy*0.95, faceR, 0, Math.PI*2);
  ctx.fillStyle = state.skin || '#fde68a';
  ctx.fill();

  // Eyes
  const eyeY    = cy*0.82;
  const eyeOffX = s*0.09;
  drawEyes(ctx, cx, eyeY, eyeOffX, s, state.eyes||'normal');

  // Mouth
  drawMouth(ctx, cx, cy*1.08, s, state.mouth||'smile');

  // Hair
  drawHair(ctx, cx, cy, s, state.hair||'none', state.color||'#16a34a');
}

function drawEyes(ctx, cx, ey, offX, s, type) {
  const r = s*0.045;
  ctx.fillStyle = '#1e293b';
  if (type==='happy') {
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.strokeStyle='#1e293b'; ctx.lineWidth=s*0.025;
      ctx.arc(x,y+r*0.5,r*1.2,Math.PI,Math.PI*2); ctx.stroke();
    });
  } else if (type==='sleepy') {
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.strokeStyle='#1e293b'; ctx.lineWidth=s*0.03;
      ctx.arc(x,y,r*1.2,Math.PI,Math.PI*2); ctx.stroke();
    });
  } else if (type==='surprised') {
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,r*1.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(x-r*0.3,y-r*0.3,r*0.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#1e293b';
    });
  } else if (type==='wink') {
    ctx.beginPath(); ctx.arc(cx-offX,ey,r,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.strokeStyle='#1e293b'; ctx.lineWidth=s*0.03;
    ctx.moveTo(cx+offX-r,ey); ctx.lineTo(cx+offX+r,ey); ctx.stroke();
  } else if (type==='cool') {
    // sunglasses
    ctx.fillStyle='#1e293b';
    ctx.beginPath(); ctx.roundRect(cx-offX*1.8,ey-r*1.2,offX*1.4,r*2.4,r*0.5); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx+offX*0.4,ey-r*1.2,offX*1.4,r*2.4,r*0.5); ctx.fill();
    ctx.beginPath(); ctx.strokeStyle='#1e293b'; ctx.lineWidth=s*0.02;
    ctx.moveTo(cx-offX*0.4,ey); ctx.lineTo(cx+offX*0.4,ey); ctx.stroke();
  } else if (type==='star') {
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => drawStar(ctx,x,y,r*1.4,'#fbbf24'));
  } else if (type==='heart') {
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => drawHeart(ctx,x,y,r*1.2,'#ef4444'));
  } else if (type==='laser') {
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fillStyle='#ef4444'; ctx.fill();
      ctx.beginPath(); ctx.strokeStyle='#ef4444'; ctx.lineWidth=s*0.015;
      ctx.moveTo(x,y); ctx.lineTo(s+10,y); ctx.stroke();
    });
    ctx.fillStyle='#1e293b';
  } else {
    // normal
    [[cx-offX,ey],[cx+offX,ey]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(x-r*0.3,y-r*0.3,r*0.35,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#1e293b';
    });
  }
}

function drawMouth(ctx, cx, my, s, type) {
  ctx.strokeStyle='#1e293b'; ctx.lineWidth=s*0.03; ctx.lineCap='round';
  const w=s*0.12;
  if (type==='grin') {
    ctx.beginPath(); ctx.arc(cx,my-w*0.3,w,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
  } else if (type==='open') {
    ctx.beginPath(); ctx.arc(cx,my,w*0.7,0,Math.PI*2);
    ctx.fillStyle='#1e293b'; ctx.fill();
    ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(cx,my+w*0.2,w*0.4,0,Math.PI); ctx.fill();
  } else if (type==='smirk') {
    ctx.beginPath(); ctx.moveTo(cx-w,my); ctx.quadraticCurveTo(cx,my-w*0.3,cx+w,my+w*0.3); ctx.stroke();
  } else if (type==='tongue') {
    ctx.beginPath(); ctx.arc(cx,my-w*0.3,w,0.1*Math.PI,0.9*Math.PI); ctx.stroke();
    ctx.fillStyle='#f9a8d4'; ctx.beginPath(); ctx.arc(cx,my+w*0.4,w*0.5,0,Math.PI); ctx.fill();
  } else if (type==='sad') {
    ctx.beginPath(); ctx.arc(cx,my+w*0.5,w,1.2*Math.PI,1.8*Math.PI); ctx.stroke();
  } else if (type==='rainbow') {
    const grad=ctx.createLinearGradient(cx-w,my,cx+w,my);
    grad.addColorStop(0,'#ef4444'); grad.addColorStop(0.5,'#fbbf24'); grad.addColorStop(1,'#3b82f6');
    ctx.strokeStyle=grad;
    ctx.beginPath(); ctx.arc(cx,my-w*0.3,w,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
    ctx.strokeStyle='#1e293b';
  } else if (type==='fire') {
    ctx.beginPath(); ctx.arc(cx,my-w*0.3,w,0.15*Math.PI,0.85*Math.PI);
    ctx.strokeStyle='#f97316'; ctx.stroke();
    ctx.strokeStyle='#1e293b';
  } else {
    // smile
    ctx.beginPath(); ctx.arc(cx,my-w*0.3,w,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
  }
}

function drawHair(ctx, cx, cy, s, type, color) {
  if (type==='none') return;
  const faceTop = cy*0.95 - s*0.32;
  ctx.fillStyle = '#1e293b';

  if (type==='short') {
    ctx.beginPath();
    ctx.arc(cx, faceTop+s*0.05, s*0.32, Math.PI, Math.PI*2);
    ctx.fill();
  } else if (type==='long') {
    ctx.beginPath();
    ctx.arc(cx, faceTop+s*0.05, s*0.34, Math.PI, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(cx-s*0.34, faceTop+s*0.04, s*0.14, s*0.38);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(cx+s*0.20, faceTop+s*0.04, s*0.14, s*0.38);
    ctx.fill();
  } else if (type==='curly') {
    for (let i=0;i<6;i++) {
      const angle = (i/6)*Math.PI*2;
      const rx = cx + Math.cos(angle)*s*0.28;
      const ry = faceTop+s*0.08 + Math.sin(angle)*s*0.1;
      ctx.beginPath(); ctx.arc(rx,ry,s*0.09,0,Math.PI*2); ctx.fill();
    }
  } else if (type==='bun') {
    ctx.beginPath();
    ctx.arc(cx, faceTop+s*0.05, s*0.3, Math.PI, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, faceTop-s*0.06, s*0.11, 0, Math.PI*2);
    ctx.fill();
  } else if (type==='mohawk') {
    ctx.beginPath();
    ctx.moveTo(cx-s*0.07, faceTop+s*0.04);
    ctx.lineTo(cx, faceTop-s*0.22);
    ctx.lineTo(cx+s*0.07, faceTop+s*0.04);
    ctx.fill();
  } else if (type==='wavy') {
    ctx.beginPath();
    ctx.arc(cx, faceTop+s*0.05, s*0.32, Math.PI, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+s*0.2, faceTop+s*0.08);
    for (let i=0;i<4;i++) {
      ctx.quadraticCurveTo(
        cx+s*0.26 + (i%2===0?s*0.05:-s*0.05), faceTop+s*0.18+i*s*0.07,
        cx+s*0.2, faceTop+s*0.28+i*s*0.07
      );
    }
    ctx.lineWidth=s*0.06; ctx.strokeStyle='#1e293b'; ctx.stroke();
  } else if (type==='cap') {
    ctx.beginPath();
    ctx.arc(cx, faceTop+s*0.05, s*0.32, Math.PI, Math.PI*2);
    ctx.fillStyle=color; ctx.fill();
    ctx.fillStyle='#1e293b';
    ctx.beginPath();
    ctx.rect(cx-s*0.34, faceTop+s*0.04, s*0.68, s*0.07);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(cx-s*0.02, faceTop+s*0.04, s*0.36, s*0.1);
    ctx.fillStyle='#334155'; ctx.fill();
  } else if (type==='rainbow') {
    const g=ctx.createLinearGradient(cx-s*0.3,0,cx+s*0.3,0);
    g.addColorStop(0,'#ef4444'); g.addColorStop(0.33,'#fbbf24');
    g.addColorStop(0.66,'#3b82f6'); g.addColorStop(1,'#8b5cf6');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(cx,faceTop+s*0.05,s*0.32,Math.PI,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1e293b';
  } else if (type==='gold') {
    ctx.fillStyle='#fbbf24';
    ctx.beginPath(); ctx.arc(cx,faceTop+s*0.05,s*0.32,Math.PI,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1e293b';
  } else if (type==='galaxy') {
    const g=ctx.createRadialGradient(cx,faceTop,0,cx,faceTop,s*0.35);
    g.addColorStop(0,'#8b5cf6'); g.addColorStop(0.5,'#3b82f6'); g.addColorStop(1,'#1e1b4b');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(cx,faceTop+s*0.05,s*0.32,Math.PI,Math.PI*2); ctx.fill();
  } else if (type==='flame') {
    const g=ctx.createLinearGradient(cx,faceTop-s*0.3,cx,faceTop+s*0.1);
    g.addColorStop(0,'#fbbf24'); g.addColorStop(0.5,'#f97316'); g.addColorStop(1,'#ef4444');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(cx-s*0.28,faceTop+s*0.06);
    ctx.quadraticCurveTo(cx-s*0.1,faceTop-s*0.28,cx,faceTop-s*0.35);
    ctx.quadraticCurveTo(cx+s*0.1,faceTop-s*0.28,cx+s*0.28,faceTop+s*0.06);
    ctx.closePath(); ctx.fill();
  }
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i=0;i<5;i++) {
    const a = (i*4*Math.PI/5) - Math.PI/2;
    const b = (i*4*Math.PI/5+2*Math.PI/5) - Math.PI/2;
    i===0 ? ctx.moveTo(x+r*Math.cos(a), y+r*Math.sin(a))
          : ctx.lineTo(x+r*Math.cos(a), y+r*Math.sin(a));
    ctx.lineTo(x+r*0.4*Math.cos(b), y+r*0.4*Math.sin(b));
  }
  ctx.closePath(); ctx.fill();
}

function drawHeart(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y+r*0.5);
  ctx.bezierCurveTo(x-r*1.2,y-r*0.5, x-r*2,y+r*0.8, x,y+r*1.8);
  ctx.bezierCurveTo(x+r*2,y+r*0.8, x+r*1.2,y-r*0.5, x,y+r*0.5);
  ctx.fill();
}
window.drawMii = drawMii;
// ══════════════════════════════════════════
//   DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  const [stats, acts, badges, yearly] = await Promise.all([
    api('/api/stats'),
    api('/api/activities'),
    api('/api/badges'),
    api('/api/yearly')
  ]);

  if (stats.error) return;

  // Hero CO2
  const co2   = parseFloat(stats.co2_total||0);
  const targets = [10,50,100,250,500,1000];
  const next    = targets.find(t=>t>co2) || 1000;
  const prev    = targets[targets.indexOf(next)-1] || 0;
  const pct     = Math.min(100,((co2-prev)/(next-prev))*100);

  document.getElementById('heroCo2').textContent      = co2.toFixed(1);
  document.getElementById('heroCo2Week').textContent  = parseFloat(stats.co2_week||0).toFixed(1)+' kg';
  document.getElementById('heroCo2Month').textContent = parseFloat(stats.co2_month||0).toFixed(1)+' kg';
  document.getElementById('heroCo2Target').textContent= '/ '+next+' kg';
  document.getElementById('topCo2').textContent       = co2.toFixed(1);
  document.getElementById('topPts').textContent       = stats.points||0;

  const fill = document.getElementById('heroCo2Fill');
  if (fill) setTimeout(()=>fill.style.width=pct+'%',100);

  const sub = document.getElementById('heroCo2Sub');
  if (sub) sub.textContent = co2===0
    ? 'Inizia a tracciare le tue azioni eco!'
    : `Prossimo obiettivo: ${next} kg CO₂ 🎯`;

  // Planet emoji
  const planet = document.getElementById('co2Planet');
  if (planet) {
    if      (co2>=500) planet.textContent='🌍';
    else if (co2>=100) planet.textContent='🌿';
    else if (co2>=50)  planet.textContent='🌱';
    else               planet.textContent='🌍';
  }

  // Stats cards
  document.getElementById('sPts').textContent  = stats.points||0;
  document.getElementById('sWeek').textContent = parseFloat(stats.co2_week||0).toFixed(1);
  document.getElementById('sActs').textContent = stats.total_activities||0;

  // Recent activities
  const recentEl = document.getElementById('recentActs');
  if (recentEl) {
    if (!acts.length) {
      recentEl.innerHTML = '<div class="empty"><div class="ei">🌱</div><p>Nessuna attività ancora.</p></div>';
    } else {
      recentEl.innerHTML = acts.slice(0,5).map(a => actHTML(a)).join('');
    }
  }

  // Badges
  const badgeEl = document.getElementById('badgeList');
  if (badgeEl && !badges.error) {
    badgeEl.innerHTML = badges.map(b => `
      <div class="badge-item ${b.unlocked?'on':'off'}">
        <div class="badge-icon">${b.icon}</div>
        <div>
          <div class="badge-name">${b.name}</div>
          <div style="font-size:11px;color:var(--muted)">${b.desc}</div>
        </div>
      </div>`).join('');
  }

  // Yearly chart
  renderYearlyChart(yearly||[]);

  // update sidebar
  if (myProfile) updateSidebar(myProfile);
}

function actHTML(a) {
  const icons = {
    Bici:'🚴',Treno:'🚂',Bus:'🚌',
    Carpooling:'🚗',Remoto:'🏠',Videocall:'💻'
  };
  const date = new Date(a.date).toLocaleDateString('it-IT',{day:'2-digit',month:'short'});
  return `
    <div class="act-item">
      <div class="act-icon-wrap">${icons[a.type]||'🌱'}</div>
      <div class="act-detail">
        <div class="act-name">${a.type}${a.note?` — <span style="font-weight:500;color:var(--muted)">${a.note}</span>`:''}</div>
        <div class="act-sub">
          ${a.km>0?`${a.km} km · `:''}
          ${a.hours>0?`${a.hours}h · `:''}
          ${date}
        </div>
      </div>
      <div class="act-tags">
        <span class="tag tag-g">-${a.co2_saved} kg CO₂</span>
        <span class="tag tag-y">+${a.points} pt</span>
      </div>
    </div>`;
}

function renderYearlyChart(rows) {
  const el = document.getElementById('yearlyChart');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div class="ei">📊</div><p>Nessun dato annuale ancora.</p></div>';
    return;
  }
  const max = Math.max(...rows.map(r=>parseFloat(r.co2)||0), 1);
  el.innerHTML = rows.map(r => {
    const co2 = parseFloat(r.co2||0);
    const pct = Math.round((co2/max)*100);
    return `
      <div class="yr-row">
        <span class="yr-month">${r.month}</span>
        <div class="yr-bar">
          <div class="yr-fill" style="width:0%" data-pct="${pct}"></div>
        </div>
        <span class="yr-co2">${co2.toFixed(1)}</span>
        <span class="yr-pts">+${r.points||0}pt</span>
      </div>`;
  }).join('');
  setTimeout(()=>{
    el.querySelectorAll('.yr-fill').forEach(f=>{
      f.style.width = f.dataset.pct+'%';
    });
  },100);
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
const RATES = {
  Remoto:     { t:'h', co2:.5,  pts:10  },
  Treno:      { t:'k', co2:.04, pts:2   },
  Bici:       { t:'k', co2:0,   pts:5   },
  Bus:        { t:'k', co2:.08, pts:1.5 },
  Carpooling: { t:'k', co2:.06, pts:3   },
  Videocall:  { t:'h', co2:.1,  pts:8   }
};

function selectAct(type, btn) {
  selectedAct = type;
  document.querySelectorAll('.at-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');

  const r   = RATES[type];
  const isKm= r.t==='k';

  document.getElementById('logForm').style.display    = 'block';
  document.getElementById('kmField').style.display    = isKm ? 'block':'none';
  document.getElementById('hoursField').style.display = isKm ? 'none':'block';
  document.getElementById('mapSection').style.display = isKm ? 'block':'none';
  document.getElementById('co2Estimate').style.display= 'none';

  const icons={Bici:'🚴',Treno:'🚂',Bus:'🚌',Carpooling:'🚗',Remoto:'🏠',Videocall:'💻'};
  document.getElementById('formTitle').textContent = `${icons[type]||'🌱'} ${type}`;

  document.getElementById('kmInput').value    = '';
  document.getElementById('hoursInput').value = '';
  document.getElementById('noteInput').value  = '';

  if (isKm && !mapInited) initMap();

  document.getElementById('logForm').scrollIntoView({behavior:'smooth',block:'nearest'});
}
window.selectAct = selectAct;

function cancelLog() {
  document.getElementById('logForm').style.display = 'none';
  document.querySelectorAll('.at-btn').forEach(b=>b.classList.remove('sel'));
  selectedAct = null;
}
window.cancelLog = cancelLog;

function updateCo2Estimate() {
  if (!selectedAct) return;
  const r   = RATES[selectedAct];
  const val = r.t==='k'
    ? parseFloat(document.getElementById('kmInput').value||0)
    : parseFloat(document.getElementById('hoursInput').value||0);
  if (!val || val<=0) {
    document.getElementById('co2Estimate').style.display='none';
    return;
  }
  const co2 = (val*r.co2).toFixed(2);
  const pts = Math.round(val*r.pts);
  document.getElementById('co2EstCo2').textContent  = co2+' kg';
  document.getElementById('co2EstPts').textContent  = '+'+pts;
  document.getElementById('co2EstUnit').textContent = val+(r.t==='k'?' km':' h');
  document.getElementById('co2Estimate').style.display = 'flex';
}
window.updateCo2Estimate = updateCo2Estimate;

async function saveActivity() {
  if (!selectedAct) return showN('❌ Seleziona un\'attività','error');
  const r    = RATES[selectedAct];
  const km   = parseFloat(document.getElementById('kmInput').value||0);
  const hours= parseFloat(document.getElementById('hoursInput').value||0);
  const note = document.getElementById('noteInput').value.trim();
  const from = document.getElementById('fromAddr')?.value?.trim()||'';
  const to   = document.getElementById('toAddr')?.value?.trim()||'';

  if (r.t==='k' && km<=0)    return showN('❌ Inserisci i km','error');
  if (r.t==='h' && hours<=0) return showN('❌ Inserisci le ore','error');

  const btn = document.getElementById('saveBtnLog');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvo...'; }

  const d = await api('/api/activities','POST',{
    type:selectedAct, km, hours, note,
    from_addr:from, to_addr:to
  });

  if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-leaf"></i> Salva Attività'; }

  if (d.error) return showN('❌ '+d.error,'error');

  showCo2Explosion(d.co2_saved||0, d.points||0);
  cancelLog();
  await loadDashboard();
  await loadActivities();
}
window.saveActivity = saveActivity;

function showCo2Explosion(co2, pts) {
  const el = document.getElementById('co2Explosion');
  if (!el) return;
  document.getElementById('co2ExpKg').textContent  = `+${parseFloat(co2).toFixed(2)} kg`;
  document.getElementById('co2ExpPts').textContent = `+${pts} punti ⭐`;
  el.style.display = 'flex';
  setTimeout(()=>el.style.display='none', 2800);
}

async function loadActivities() {
  const acts = await api('/api/activities');
  const el   = document.getElementById('allActs');
  if (!el) return;
  if (!acts.length||acts.error) {
    el.innerHTML='<div class="empty"><div class="ei">📋</div><p>Nessuna attività.</p></div>';
    return;
  }
  el.innerHTML = acts.map(a=>actHTML(a)).join('');
}

// ══════════════════════════════════════════
//   MAP
// ══════════════════════════════════════════
function initMap() {
  if (mapInited) return;
  mapInited = true;
  map = L.map('leafletMap',{ zoomControl:true }).setView([45.5,10.5],8);

  tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap'
  }).addTo(map);

  // custom controls
  const satCtrl = L.control({position:'topright'});
  satCtrl.onAdd = () => {
    const d=L.DomUtil.create('div');
    d.innerHTML=`<button class="map-sat-btn" id="satBtn" onclick="toggleSat()">🛰️ Satellite</button>`;
    return d;
  };
  satCtrl.addTo(map);

  const geoCtrl = L.control({position:'topright'});
  geoCtrl.onAdd = () => {
    const d=L.DomUtil.create('div');
    d.innerHTML=`<button class="map-geo-btn" onclick="geoLocate()">📍 La mia posizione</button>`;
    return d;
  };
  geoCtrl.addTo(map);

  const resetCtrl = L.control({position:'topright'});
  resetCtrl.onAdd = () => {
    const d=L.DomUtil.create('div');
    d.innerHTML=`<button class="map-reset-btn" onclick="resetRoute()">🔄 Reset</button>`;
    return d;
  };
  resetCtrl.addTo(map);

  map.on('click', onMapClick);
}

function toggleSat() {
  satellite = !satellite;
  if (map) {
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(
      satellite
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: satellite ? '© Esri' : '© OpenStreetMap' }
    ).addTo(map);
  }
  const btn = document.getElementById('satBtn');
  if (btn) btn.classList.toggle('active', satellite);
}
window.toggleSat = toggleSat;

function geoLocate() {
  if (!navigator.geolocation) return showN('❌ Geolocalizzazione non supportata','error');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude:lat, longitude:lng } = pos.coords;
    if (markerFrom) map.removeLayer(markerFrom);
    markerFrom = L.marker([lat,lng],{
      icon: L.divIcon({
        html:'<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
        iconSize:[14,14], iconAnchor:[7,7]
      })
    }).addTo(map).bindPopup('📍 Partenza').openPopup();
    map.setView([lat,lng],14);
    reverseGeocode(lat, lng, 'fromAddr');
  }, ()=>showN('❌ Impossibile ottenere posizione','error'));
}
window.geoLocate = geoLocate;

function onMapClick(e) {
  const {lat,lng} = e.latlng;
  if (!markerFrom) {
    markerFrom = L.marker([lat,lng],{
      icon:L.divIcon({
        html:'<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
        iconSize:[14,14],iconAnchor:[7,7]
      })
    }).addTo(map).bindPopup('🟢 Partenza').openPopup();
    reverseGeocode(lat,lng,'fromAddr');
  } else if (!markerTo) {
    markerTo = L.marker([lat,lng],{
      icon:L.divIcon({
        html:'<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
        iconSize:[14,14],iconAnchor:[7,7]
      })
    }).addTo(map).bindPopup('🔴 Arrivo').openPopup();
    reverseGeocode(lat,lng,'toAddr');
  }
}

function resetRoute() {
  if (markerFrom) { map.removeLayer(markerFrom); markerFrom=null; }
  if (markerTo)   { map.removeLayer(markerTo);   markerTo=null;   }
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer=null; }
  document.getElementById('fromAddr').value='';
  document.getElementById('toAddr').value='';
  document.getElementById('routeInfo').style.display='none';
  document.getElementById('kmInput').value='';
  document.getElementById('co2Estimate').style.display='none';
}
window.resetRoute = resetRoute;

async function reverseGeocode(lat, lng, inputId) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers:{'Accept-Language':'it'} }
    );
    const d = await r.json();
    const el = document.getElementById(inputId);
    if (el) el.value = d.display_name?.split(',').slice(0,3).join(', ')||'';
  } catch(e) { console.warn('Reverse geocode error:', e); }
}

let addrTimers = {};
async function onAddrInput(inputId, suggId, role) {
  const val = document.getElementById(inputId)?.value?.trim();
  const box = document.getElementById(suggId);
  if (!box) return;
  clearTimeout(addrTimers[role]);
  if (!val||val.length<3) { box.innerHTML=''; return; }
  addrTimers[role] = setTimeout(async()=>{
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&addressdetails=1`,
        { headers:{'Accept-Language':'it'} }
      );
      const results = await r.json();
      box.innerHTML = results.map(p=>`
        <div class="addr-sugg-item" onclick="pickAddr('${inputId}','${suggId}','${role}',${p.lat},${p.lon},\`${p.display_name.replace(/`/g,"'")}\`)">
          <i class="fas fa-map-marker-alt"></i>
          ${p.display_name.split(',').slice(0,3).join(', ')}
        </div>`).join('');
    } catch(e) { console.warn('Geocode error:',e); }
  }, 400);
}
window.onAddrInput = onAddrInput;

function pickAddr(inputId, suggId, role, lat, lon, name) {
  const el = document.getElementById(inputId);
  if (el) el.value = name.split(',').slice(0,3).join(', ');
  document.getElementById(suggId).innerHTML='';

  const latlng = [parseFloat(lat), parseFloat(lon)];
  const icon = L.divIcon({
    html:`<div style="background:${role==='from'?'#16a34a':'#ef4444'};width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
    iconSize:[14,14],iconAnchor:[7,7]
  });
  if (role==='from') {
    if (markerFrom) map.removeLayer(markerFrom);
    markerFrom = L.marker(latlng,{icon}).addTo(map)
      .bindPopup('🟢 Partenza').openPopup();
  } else {
    if (markerTo) map.removeLayer(markerTo);
    markerTo = L.marker(latlng,{icon}).addTo(map)
      .bindPopup('🔴 Arrivo').openPopup();
  }
  map.setView(latlng,13);
}
window.pickAddr = pickAddr;

function swapAddresses() {
  const f = document.getElementById('fromAddr');
  const t = document.getElementById('toAddr');
  if (!f||!t) return;
  [f.value,t.value] = [t.value,f.value];
  [markerFrom,markerTo] = [markerTo,markerFrom];
}
window.swapAddresses = swapAddresses;

async function calcRoute() {
  if (!markerFrom||!markerTo)
    return showN('❌ Imposta partenza e arrivo sulla mappa','error');
  const btn = document.getElementById('calcRouteBtn');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Calcolo...'; }

  const {lat:lat1,lng:lng1} = markerFrom.getLatLng();
  const {lat:lat2,lng:lng2} = markerTo.getLatLng();

  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`
    );
    const data = await r.json();
    if (!data.routes?.length) throw new Error('No route');

    const route  = data.routes[0];
    const distKm = (route.distance/1000).toFixed(2);
    const durMin = Math.round(route.duration/60);

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry,{
      style:{ color:'#16a34a', weight:4, opacity:.8 }
    }).addTo(map);
    map.fitBounds(routeLayer.getBounds(),{padding:[20,20]});

    // update km input
    document.getElementById('kmInput').value = distKm;
    updateCo2Estimate();

    // route info
    const info = document.getElementById('routeInfo');
    if (info) {
      const r2 = RATES[selectedAct];
      const co2 = (distKm*r2.co2).toFixed(2);
      info.style.display='flex';
      info.innerHTML=`
        <div class="route-info-item">📍 <strong>${distKm} km</strong></div>
        <div class="route-info-item">⏱️ <strong>${durMin} min</strong></div>
        <div class="route-info-item co2-highlight">🌱 <strong>-${co2} kg CO₂</strong></div>`;
    }
  } catch(e) {
    showN('❌ Impossibile calcolare il percorso','error');
  }
  if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-route"></i> Calcola Percorso'; }
}
window.calcRoute = calcRoute;

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
async function loadShop() {
  const [items, profile] = await Promise.all([
    api('/api/shop'),
    api('/api/profile')
  ]);
  if (items.error||profile.error) return;
  allShopItems = items;
  ownedItems   = profile.owned_items||[];
  const pts    = profile.points||0;
  document.getElementById('shopPts').textContent = pts+' pt';
  renderShop(pts);
}

function filterShop(cat, btn) {
  shopFilter = cat;
  document.querySelectorAll('.shop-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderShop(parseInt(document.getElementById('shopPts').textContent)||0);
}
window.filterShop = filterShop;

function renderShop(pts) {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  const cats = shopFilter==='all'
    ? ['hair','eyes','mouth','color','skin']
    : [shopFilter];
  const catLabels = {
    hair:'💇 Capelli', eyes:'👁️ Occhi',
    mouth:'👄 Bocca',  color:'🎨 Colore Avatar', skin:'👤 Pelle'
  };
  grid.innerHTML = cats.map(cat=>{
    const catItems = allShopItems.filter(i=>i.category===cat);
    if (!catItems.length) return '';
    return `
      <div class="section-card shop-section">
        <div class="shop-section-title">${catLabels[cat]||cat}</div>
        <div class="shop-items-grid">
          ${catItems.map(item=>shopItemHTML(item,pts)).join('')}
        </div>
      </div>`;
  }).join('');
}

function shopItemHTML(item, pts) {
  const owned  = ownedItems.includes(item.id);
  const canBuy = pts >= item.cost;
  return `
    <div class="shop-item ${owned?'owned':''} ${item.is_rare?'rare':''}">
      ${item.is_rare?'<div class="rare-badge">✨ RARO</div>':''}
      <div class="shop-item-preview" onclick="previewItem(${item.id})"
        title="Anteprima">${item.emoji}</div>
      <div class="shop-item-name">${item.name}</div>
      <div class="shop-item-desc">${item.description||''}</div>
      ${!owned?`
        <div class="shop-progress">
          <div class="shop-progress-fill"
            style="width:${Math.min(100,Math.round((pts/item.cost)*100))}%"></div>
        </div>
        <div class="shop-item-cost">
          <span class="cost-badge ${canBuy?'can':'cant'}">
            ⭐ ${item.cost} pt
          </span>
        </div>
        <button class="shop-buy-btn ${canBuy?'':'disabled'}"
          onclick="${canBuy?`buyItem(${item.id})`:'showN(\"❌ Punti insufficienti\",\"error\")'}"
          ${canBuy?'':'disabled'}>
          <i class="fas fa-shopping-cart"></i>
          ${canBuy?'Acquista':'Mancano '+(item.cost-pts)+' pt'}
        </button>
      `:`
        <div class="owned-badge">✅ Posseduto</div>
        <button class="shop-buy-btn" onclick="equipItem(${item.id})">
          <i class="fas fa-check"></i> Equipaggia
        </button>
      `}
    </div>`;
}

function previewItem(itemId) {
  const item = allShopItems.find(i=>i.id===itemId);
  if (!item) return;
  const preview = {
    ...miiState,
    [item.category==='color'?'color':
     item.category==='skin' ?'skin' :
     item.category]:
    item.category==='color'||item.category==='skin'
      ? item.value
      : item.value
  };
  document.getElementById('shopPreview').style.display='flex';
  drawMii(preview,'shopPreviewCanvas',80);
}
window.previewItem = previewItem;

function closeShopPreview() {
  document.getElementById('shopPreview').style.display='none';
}
window.closeShopPreview = closeShopPreview;

async function buyItem(itemId) {
  showConfirm(
    'Acquisto',
    `Vuoi acquistare questo oggetto?`,
    async()=>{
      const d = await api('/api/shop/buy','POST',{ item_id:itemId });
      if (d.error) return showN('❌ '+d.error,'error');
      showN('🎉 Acquisto completato!','success');
      await loadShop();
    },
    '🛍️'
  );
}
window.buyItem = buyItem;

function equipItem(itemId) {
  const item = allShopItems.find(i=>i.id===itemId);
  if (!item) return;
  const cat = item.category;
  if      (cat==='color') miiState.color = item.value;
  else if (cat==='skin')  miiState.skin  = item.value;
  else                    miiState[cat]  = item.value;

  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();
  showN(`✅ ${item.name} equipaggiato!`,'success');
}
window.equipItem = equipItem;
// ══════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════
async function loadProfile() {
  const d = await api('/api/profile');
  if (d.error) return;
  myProfile = d;
  syncMiiState(d);
  updateSidebar(d);

  // Campi form
  const pName     = document.getElementById('pName');
  const pUsername = document.getElementById('pUsername');
  const pBio      = document.getElementById('pBio');
  if (pName)     pName.value     = d.name||'';
  if (pUsername) pUsername.value = d.username||'';
  if (pBio)      pBio.value      = d.bio||'';

  // Stats profilo
  const psEl = document.getElementById('profileStats');
  if (psEl) {
    psEl.innerHTML = `
      <div class="ps-item">
        <div class="ps-val">${parseFloat(d.co2_saved||0).toFixed(1)}</div>
        <div class="ps-lbl">kg CO₂</div>
      </div>
      <div class="ps-item">
        <div class="ps-val">${d.points||0}</div>
        <div class="ps-lbl">Punti</div>
      </div>
      <div class="ps-item">
        <div class="ps-val">${d.followers||0}</div>
        <div class="ps-lbl">Follower</div>
      </div>`;
  }

  // Avatar
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();
}

// ✅ SAVE PROFILE con fix avatar
async function saveProfile() {
  const payload = {
    name:         document.getElementById('pName').value.trim(),
    username:     document.getElementById('pUsername').value.trim().toLowerCase(),
    bio:          document.getElementById('pBio').value.trim(),
    avatar_color: miiState.color || '#16a34a',
    avatar_eyes:  miiState.eyes  || 'normal',
    avatar_mouth: miiState.mouth || 'smile',
    avatar_hair:  miiState.hair  || 'none',
    avatar_skin:  miiState.skin  || '#fde68a'
  };

  if (!payload.name)     return showN('❌ Nome obbligatorio','error');
  if (!payload.username) return showN('❌ Username obbligatorio','error');
  if (/\s/.test(payload.username))
    return showN('❌ Username senza spazi!','error');
  if (!/^[a-zA-Z0-9_\.]+$/.test(payload.username))
    return showN('❌ Username: solo lettere, numeri, _ e .','error');

  const btn = document.getElementById('saveProfileBtn');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvataggio...'; }

  const d = await api('/api/profile','PATCH',payload);

  if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Salva Profilo'; }

  if (d.error) return showN('❌ '+d.error,'error');

  // ✅ Aggiorna miiState con risposta server
  miiState.color = d.avatar_color || miiState.color;
  miiState.eyes  = d.avatar_eyes  || miiState.eyes;
  miiState.mouth = d.avatar_mouth || miiState.mouth;
  miiState.hair  = d.avatar_hair  || miiState.hair;
  miiState.skin  = d.avatar_skin  || miiState.skin;

  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();

  showN('✅ Profilo salvato!','success');
  await loadProfile();
}
window.saveProfile = saveProfile;

// ══════════════════════════════════════════
//   MII BUILDER
// ══════════════════════════════════════════
const MII_OPTS = {
  eyes:  ['normal','happy','sleepy','surprised','wink','cool','star','heart','laser'],
  mouth: ['smile','grin','open','smirk','tongue','sad','rainbow','fire'],
  hair:  ['none','short','long','curly','bun','mohawk','wavy','cap','rainbow','gold','galaxy','flame']
};

const MII_LABELS = {
  eyes:{
    normal:'😐',happy:'😊',sleepy:'😴',surprised:'😲',
    wink:'😉',cool:'😎',star:'⭐',heart:'❤️',laser:'🔴'
  },
  mouth:{
    smile:'🙂',grin:'😁',open:'😮',smirk:'😏',
    tongue:'😛',sad:'🙁',rainbow:'🌈',fire:'🔥'
  },
  hair:{
    none:'🚫',short:'💇',long:'💆',curly:'🌀',bun:'🎀',
    mohawk:'⚡',wavy:'〰️',cap:'🧢',rainbow:'🌈',
    gold:'✨',galaxy:'🌌',flame:'🔥'
  }
};

// Oggetti shop premium (bloccati finché non acquistati)
const PREMIUM_EYES  = ['star','heart','laser'];
const PREMIUM_MOUTH = ['rainbow','fire'];
const PREMIUM_HAIR  = ['rainbow','gold','galaxy','flame'];

function renderMiiBuilder() {
  ['eyes','mouth','hair'].forEach(cat=>{
    const el = document.getElementById('mii'+cap(cat));
    if (!el) return;
    el.innerHTML = MII_OPTS[cat].map(val=>{
      const isPremium =
        (cat==='eyes'  && PREMIUM_EYES.includes(val))  ||
        (cat==='mouth' && PREMIUM_MOUTH.includes(val)) ||
        (cat==='hair'  && PREMIUM_HAIR.includes(val));
      const unlocked = !isPremium ||
        ownedItems.some(id=>{
          const item = allShopItems.find(i=>i.id===id);
          return item && item.category===cat && item.value===val;
        });
      const isSel = miiState[cat]===val;
      return `
        <div class="mii-opt ${isSel?'sel':''} ${!unlocked?'locked':''}"
          title="${val}"
          onclick="${unlocked?`pickMii('${cat}','${val}',this)`:`showN('🔒 Acquista nello Shop!','info')`}">
          <canvas width="44" height="44" id="miiopt_${cat}_${val}"></canvas>
        </div>`;
    }).join('');

    // disegna preview in ogni canvas
    MII_OPTS[cat].forEach(val=>{
      const c = document.getElementById(`miiopt_${cat}_${val}`);
      if (!c) return;
      const preview = { ...miiState, [cat]:val };
      drawMii(preview, `miiopt_${cat}_${val}`, 44);
    });
  });

  // sync colori selezionati
  document.querySelectorAll('.color-swatch').forEach(el=>{
    el.classList.toggle('sel', el.dataset.val===miiState.color);
  });
  document.querySelectorAll('.skin-swatch').forEach(el=>{
    el.classList.toggle('sel', el.dataset.val===miiState.skin);
  });
}

function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }

function pickMii(cat, val, el) {
  miiState[cat] = val;
  document.querySelectorAll(`.mii-opt`).forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel');
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();
}
window.pickMii = pickMii;

function pickColor(val) {
  miiState.color = val;
  document.querySelectorAll('.color-swatch').forEach(el=>{
    el.classList.toggle('sel', el.dataset.val===val);
  });
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();
}
window.pickColor = pickColor;

function pickSkin(val) {
  miiState.skin = val;
  document.querySelectorAll('.skin-swatch').forEach(el=>{
    el.classList.toggle('sel', el.dataset.val===val);
  });
  drawMii(miiState,'miiCanvas',120);
  drawMii(miiState,'sbAvatarCanvas',36);
  renderMiiBuilder();
}
window.pickSkin = pickSkin;

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
async function loadChallenges() {
  const d = await api('/api/challenges');
  const el= document.getElementById('chList');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">🏆</div><p>Nessuna sfida ancora.</p></div>';
    return;
  }
  el.innerHTML = d.map(ch=>`
    <div class="ch-item">
      <div class="ch-ico">🏆</div>
      <div class="ch-info">
        <h4>${ch.title}</h4>
        <p>${ch.description||'Nessuna descrizione'}</p>
        <div class="ch-tags">
          ${ch.co2_target>0?`<span class="ch-tag">🌱 Target: ${ch.co2_target} kg CO₂</span>`:''}
          ${ch.points_reward>0?`<span class="ch-tag">⭐ Premio: ${ch.points_reward} pt</span>`:''}
          ${ch.end_date?`<span class="ch-tag">📅 Scade: ${new Date(ch.end_date).toLocaleDateString('it-IT')}</span>`:''}
          <span class="ch-tag">${ch.is_public?'🌍 Pubblica':'🔒 Privata'}</span>
          ${ch.creator_name?`<span class="ch-tag">👤 ${ch.creator_name}</span>`:''}
        </div>
      </div>
    </div>`).join('');
}

function toggleChForm() {
  const f = document.getElementById('chForm');
  if (!f) return;
  f.style.display = f.style.display==='none'?'block':'none';
}
window.toggleChForm = toggleChForm;

async function saveChallenge() {
  const title   = document.getElementById('chTitle').value.trim();
  const desc    = document.getElementById('chDesc').value.trim();
  const co2     = parseFloat(document.getElementById('chCo2').value||0);
  const pts     = parseInt(document.getElementById('chPts').value||0);
  const date    = document.getElementById('chDate').value;
  const isPublic= document.getElementById('chPublic').checked;

  if (!title) return showN('❌ Titolo obbligatorio','error');

  const d = await api('/api/challenges','POST',{
    title,description:desc,co2_target:co2,
    points_reward:pts,end_date:date||null,is_public:isPublic
  });
  if (d.error) return showN('❌ '+d.error,'error');

  showN('✅ Sfida creata!','success');
  toggleChForm();
  document.getElementById('chTitle').value='';
  document.getElementById('chDesc').value='';
  document.getElementById('chCo2').value='';
  document.getElementById('chPts').value='';
  document.getElementById('chDate').value='';
  await loadChallenges();
}
window.saveChallenge = saveChallenge;

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLeaderboard() {
  const d = await api('/api/leaderboard');
  const el= document.getElementById('lbList');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">🏆</div><p>Nessun dato.</p></div>';
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = d.map((u,i)=>`
    <div class="lb-row ${i<3?'r'+(i+1):''}">
      <div class="lb-rank">${medals[i]||('#'+(i+1))}</div>
      <div class="lb-av">
        <canvas id="lbav_${u.id}" width="40" height="40"></canvas>
      </div>
      <div class="lb-name">
        <div class="lb-uname">${u.name}</div>
        <div class="lb-username">@${u.username||''}</div>
      </div>
      <div class="lb-co2">🌱 ${parseFloat(u.co2_saved||0).toFixed(1)} kg</div>
      <div class="lb-pts">⭐ ${u.points||0}</div>
    </div>`).join('');

  // disegna avatar
  d.forEach(u=>{
    const state = {
      color: u.avatar_color||'#16a34a',
      skin:  u.avatar_skin ||'#fde68a',
      eyes:  u.avatar_eyes ||'normal',
      mouth: u.avatar_mouth||'smile',
      hair:  u.avatar_hair ||'none'
    };
    drawMii(state,`lbav_${u.id}`,40);
  });
}

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
async function loadSocial() {
  await Promise.all([
    loadFollowing(),
    loadFollowers(),
    loadGroups()
  ]);
}

async function loadFollowing() {
  const d  = await api('/api/following');
  const el = document.getElementById('followingList');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">👣</div><p>Non segui nessuno.</p></div>';
    return;
  }
  el.innerHTML = d.map(u=>userCardHTML(u,true)).join('');
  d.forEach(u=>drawMii(
    {color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a',
     eyes:u.avatar_eyes||'normal',mouth:u.avatar_mouth||'smile',hair:u.avatar_hair||'none'},
    `ucav_${u.id}`,44
  ));
}

async function loadFollowers() {
  const d  = await api('/api/followers');
  const el = document.getElementById('followersList');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">👥</div><p>Nessun follower ancora.</p></div>';
    return;
  }
  el.innerHTML = d.map(u=>userCardHTML(u,false)).join('');
  d.forEach(u=>drawMii(
    {color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a',
     eyes:u.avatar_eyes||'normal',mouth:u.avatar_mouth||'smile',hair:u.avatar_hair||'none'},
    `ucav_${u.id}`,44
  ));
}

function userCardHTML(u, isFollowing) {
  return `
    <div class="user-card">
      <div class="uc-av">
        <canvas id="ucav_${u.id}" width="44" height="44"></canvas>
      </div>
      <div class="uc-info">
        <div class="uc-name">${u.name}</div>
        <div class="uc-username">@${u.username||''}</div>
        <div class="uc-pts">⭐ ${u.points||0} pt</div>
      </div>
      <button
        class="btn-follow ${isFollowing||u.is_following?'following':''}"
        onclick="${isFollowing||u.is_following?`unfollow(${u.id},this)`:`follow(${u.id},this)`}">
        ${isFollowing||u.is_following?'✓ Seguito':'+ Segui'}
      </button>
    </div>`;
}

let searchDebounce = null;
function onSearchInput() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(doSearch, 400);
}
window.onSearchInput = onSearchInput;

async function doSearch() {
  const q  = document.getElementById('searchInput')?.value?.trim();
  const el = document.getElementById('searchResults');
  if (!el) return;
  if (!q||q.length<2) { el.innerHTML=''; return; }
  const d = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">🔍</div><p>Nessun utente trovato.</p></div>';
    return;
  }
  el.innerHTML = d.map(u=>userCardHTML(u, u.is_following)).join('');
  d.forEach(u=>drawMii(
    {color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a',
     eyes:u.avatar_eyes||'normal',mouth:u.avatar_mouth||'smile',hair:u.avatar_hair||'none'},
    `ucav_${u.id}`,44
  ));
}

async function follow(id, btn) {
  const d = await api(`/api/follow/${id}`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  btn.className='btn-follow following';
  btn.textContent='✓ Seguito';
  btn.onclick=()=>unfollow(id,btn);
  showN('👥 Ora stai seguendo questo utente!');
}
window.follow = follow;

async function unfollow(id, btn) {
  const d = await api(`/api/follow/${id}`,'DELETE');
  if (d.error) return showN('❌ '+d.error,'error');
  btn.className='btn-follow';
  btn.textContent='+ Segui';
  btn.onclick=()=>follow(id,btn);
  await loadFollowing();
}
window.unfollow = unfollow;

// ══════════════════════════════════════════
//   GROUPS
// ══════════════════════════════════════════
async function loadGroups() {
  const d  = await api('/api/groups');
  const el = document.getElementById('groupsList');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">👥</div><p>Nessun gruppo ancora.</p></div>';
    return;
  }
  el.innerHTML = d.map(g=>groupCardHTML(g)).join('');
}

function groupCardHTML(g) {
  const isMember = g.is_member;
  return `
    <div class="section-card" style="padding:0;overflow:hidden;margin-bottom:12px" id="gc_${g.id}">
      <div class="gc-head">
        <div class="gc-icon">👥</div>
        <div class="gc-info">
          <div class="gc-name">${g.name}</div>
          <div class="gc-desc">${g.description||''}</div>
          <div class="gc-meta">
            <span>👤 ${g.member_count||0} membri</span>
            ${g.invite_code?`<span class="invite-code-pill">🔑 ${g.invite_code}</span>`:''}
            <span class="${g.is_public?'pub-badge':'priv-badge'}">${g.is_public?'🌍 Pubblico':'🔒 Privato'}</span>
          </div>
        </div>
        <div class="gc-actions">
          ${isMember?`
            <button class="btn-invite-followers"
              onclick="openInviteModal(${g.id},'${g.name.replace(/'/g,"\\'")}')">
              <i class="fas fa-user-plus"></i> Invita
            </button>
            <button class="btn-leave" onclick="leaveGroup(${g.id})">
              Esci
            </button>
          `:`
            <button class="btn-join" onclick="joinGroup(${g.id},this)">
              <i class="fas fa-sign-in-alt"></i> Unisciti
            </button>
          `}
        </div>
      </div>
      ${isMember?`
        <div class="gc-lb-toggle" onclick="toggleGroupLb(${g.id})">
          <i class="fas fa-trophy" style="color:var(--yellow)"></i>
          <span>Classifica gruppo</span>
          <i class="fas fa-chevron-down" id="gcarrow_${g.id}"
            style="margin-left:auto;transition:transform .3s"></i>
        </div>
        <div class="gc-lb" id="gclb_${g.id}" style="display:none"></div>
      `:''}
    </div>`;
}

async function toggleGroupLb(id) {
  const el    = document.getElementById(`gclb_${id}`);
  const arrow = document.getElementById(`gcarrow_${id}`);
  if (!el) return;
  const open = el.style.display==='none';
  el.style.display = open?'block':'none';
  if (arrow) arrow.style.transform = open?'rotate(180deg)':'rotate(0)';
  if (open && !openGroupLbs[id]) {
    openGroupLbs[id] = true;
    const d = await api(`/api/groups/${id}/leaderboard`);
    if (!d.length||d.error) {
      el.innerHTML='<div class="gc-lb-list"><div class="empty" style="padding:16px"><p>Nessun membro ancora.</p></div></div>';
      return;
    }
    const medals=['🥇','🥈','🥉'];
    el.innerHTML=`
      <div class="gc-lb-list">
        ${d.map((u,i)=>`
          <div class="gc-lb-row">
            <div class="gc-lb-rank">${medals[i]||('#'+(i+1))}</div>
            <div class="gc-lb-av">
              <canvas id="gclbav_${id}_${u.id}" width="32" height="32"></canvas>
            </div>
            <div class="gc-lb-name">
              <span class="gc-lb-uname">${u.name}</span>
              <span class="gc-lb-username">@${u.username||''}</span>
            </div>
            <div class="gc-lb-co2">🌱 ${parseFloat(u.co2_saved||0).toFixed(1)}</div>
            <div class="gc-lb-pts">⭐ ${u.points||0}</div>
          </div>`).join('')}
      </div>`;
    d.forEach(u=>drawMii(
      {color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a',
       eyes:u.avatar_eyes||'normal',mouth:u.avatar_mouth||'smile',hair:u.avatar_hair||'none'},
      `gclbav_${id}_${u.id}`,32
    ));
  }
}
window.toggleGroupLb = toggleGroupLb;

async function joinGroup(id, btn) {
  const d = await api(`/api/groups/${id}/join`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Sei entrato nel gruppo!','success');
  await loadGroups();
}
window.joinGroup = joinGroup;

async function leaveGroup(id) {
  showConfirm('Esci dal gruppo','Vuoi davvero uscire da questo gruppo?', async()=>{
    const d = await api(`/api/groups/${id}/leave`,'DELETE');
    if (d.error) return showN('❌ '+d.error,'error');
    showN('👋 Sei uscito dal gruppo','info');
    openGroupLbs[id] = false;
    await loadGroups();
  },'👥');
}
window.leaveGroup = leaveGroup;

async function joinGroupByCode() {
  const code = document.getElementById('joinCodeInput')?.value?.trim();
  if (!code) return showN('❌ Inserisci un codice','error');
  const d = await api(`/api/groups/join/${code}`,'POST');
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ Sei entrato in "${d.group?.name||'gruppo'}"!`,'success');
  document.getElementById('joinCodeInput').value='';
  await loadGroups();
}
window.joinGroupByCode = joinGroupByCode;

function toggleGroupForm() {
  const f = document.getElementById('groupForm');
  if (!f) return;
  f.style.display = f.style.display==='none'?'block':'none';
}
window.toggleGroupForm = toggleGroupForm;

async function saveGroup() {
  const name     = document.getElementById('gName').value.trim();
  const desc     = document.getElementById('gDesc').value.trim();
  const isPublic = document.getElementById('gPublic').checked;
  if (!name) return showN('❌ Nome obbligatorio','error');
  const d = await api('/api/groups','POST',{ name,description:desc,is_public:isPublic });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('✅ Gruppo creato!','success');
  toggleGroupForm();
  document.getElementById('gName').value='';
  document.getElementById('gDesc').value='';
  openGroupLbs = {};
  await loadGroups();
}
window.saveGroup = saveGroup;

// ══════════════════════════════════════════
//   INVITE MODAL
// ══════════════════════════════════════════
let currentInviteGroupId = null;

async function openInviteModal(groupId, groupName) {
  currentInviteGroupId = groupId;
  document.getElementById('inviteModalTitle').textContent = `Invita in "${groupName}"`;
  document.getElementById('inviteModal').style.display='flex';

  const followers = await api('/api/followers');
  const listEl    = document.getElementById('inviteFollowerList');
  if (!followers.length||followers.error) {
    listEl.innerHTML='<div class="empty" style="padding:24px"><p>Nessun follower da invitare.</p></div>';
    return;
  }
  listEl.innerHTML = followers.map(u=>`
    <label class="invite-follower-row">
      <input type="checkbox" class="invite-check" value="${u.id}">
      <div class="if-av">
        <canvas id="ifav_${u.id}" width="36" height="36"></canvas>
      </div>
      <div class="if-info">
        <div class="if-name">${u.name}</div>
        <div class="if-user">@${u.username||''}</div>
      </div>
    </label>`).join('');
  followers.forEach(u=>drawMii(
    {color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a',
     eyes:u.avatar_eyes||'normal',mouth:u.avatar_mouth||'smile',hair:u.avatar_hair||'none'},
    `ifav_${u.id}`,36
  ));
}
window.openInviteModal = openInviteModal;

function closeInviteModal() {
  document.getElementById('inviteModal').style.display='none';
  currentInviteGroupId = null;
}
window.closeInviteModal = closeInviteModal;

function selectAllInvite(checked) {
  document.querySelectorAll('.invite-check').forEach(c=>c.checked=checked);
}
window.selectAllInvite = selectAllInvite;

async function sendGroupInvites() {
  const ids = [...document.querySelectorAll('.invite-check:checked')].map(c=>parseInt(c.value));
  if (!ids.length) return showN('❌ Seleziona almeno un utente','error');
  const d = await api(`/api/groups/${currentInviteGroupId}/invite`,'POST',{ follower_ids:ids });
  if (d.error) return showN('❌ '+d.error,'error');
  showN(`✅ Inviti inviati a ${d.sent} utenti!`,'success');
  closeInviteModal();
}
window.sendGroupInvites = sendGroupInvites;
// ══════════════════════════════════════════
//   NOTIFICHE
// ══════════════════════════════════════════
async function loadNotifCount() {
  const d = await api('/api/notifications');
  if (d.error) return;
  const unread = d.filter(n=>!n.is_read).length;
  const dot    = document.getElementById('sbNotifDot');
  const count  = document.getElementById('notifCount');
  if (dot)   dot.style.display   = unread>0?'block':'none';
  if (count) {
    count.style.display  = unread>0?'flex':'none';
    count.textContent    = unread>9?'9+':unread;
  }
}

async function loadNotifiche() {
  const d  = await api('/api/notifications');
  const el = document.getElementById('notifList');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><div class="ei">🔔</div><p>Nessuna notifica.</p></div>';
    return;
  }
  el.innerHTML = d.map(n=>{
    const icons = {
      follow:'👥', badge:'🏅', warn:'⚠️',
      ban:'🚫', unban:'✅', shop:'🛍️',
      group_invite:'👥', info:'ℹ️'
    };
    const typeClass = {
      follow:'ni-follow', badge:'ni-warn', warn:'ni-warn',
      ban:'ni-ban', unban:'ni-unban', shop:'ni-shop',
      group_invite:'ni-group_invite', info:'ni-follow'
    };
    const time = new Date(n.created_at).toLocaleString('it-IT',{
      day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'
    });
    return `
      <div class="notif-item ${n.is_read?'':'unread'}">
        <div class="notif-item-icon ${typeClass[n.type]||'ni-follow'}">
          ${icons[n.type]||'🔔'}
        </div>
        <div class="notif-item-body">
          <div class="notif-item-msg">${n.message}</div>
          <div class="notif-item-time">${time}</div>
        </div>
      </div>`;
  }).join('');
  // mark all read
  await api('/api/notifications/read','POST');
  loadNotifCount();
}

async function markAllRead() {
  await api('/api/notifications/read','POST');
  loadNotifiche();
  showN('✅ Tutte le notifiche segnate come lette');
}
window.markAllRead = markAllRead;

// ══════════════════════════════════════════
//   SHOP — API ROUTES (server-side endpoints)
//   Questi vengono chiamati da loadShop()
// ══════════════════════════════════════════
// GET  /api/shop         → tutti gli item
// POST /api/shop/buy     → acquista { item_id }
// GET  /api/shop/owned   → item posseduti

// Aggiungi nel server.js se non presenti:
// ──────────────────────────────────────────
// app.get('/api/shop', auth, async (req,res)=>{
//   const { rows } = await pool.query('SELECT * FROM shop_items ORDER BY category,cost');
//   res.json(rows);
// });
// app.post('/api/shop/buy', auth, async (req,res)=>{
//   const { item_id } = req.body;
//   const { rows:[item] } = await pool.query('SELECT * FROM shop_items WHERE id=$1',[item_id]);
//   if (!item) return res.status(404).json({ error:'Item non trovato' });
//   const { rows:[user] } = await pool.query('SELECT points FROM users WHERE id=$1',[req.user.id]);
//   if (user.points < item.cost) return res.status(400).json({ error:'Punti insufficienti' });
//   const { rows:exists } = await pool.query(
//     'SELECT 1 FROM user_items WHERE user_id=$1 AND item_id=$2',[req.user.id,item_id]);
//   if (exists.length) return res.status(400).json({ error:'Già posseduto' });
//   await pool.query('INSERT INTO user_items (user_id,item_id) VALUES ($1,$2)',[req.user.id,item_id]);
//   await pool.query('UPDATE users SET points=points-$1 WHERE id=$2',[item.cost,req.user.id]);
//   await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
//     [req.user.id,'shop',`🛍️ Hai acquistato: ${item.name}!`]);
//   res.json({ ok:true });
// });

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdmin() {
  if (!myProfile?.is_admin) return;
  const d  = await api('/api/admin/users');
  const el = document.getElementById('adminUsersTbody');
  if (!el||d.error) return;

  el.innerHTML = d.map(u=>`
    <tr>
      <td>
        <div class="u-info">
          <canvas id="adav_${u.id}" width="36" height="36"
            style="border-radius:8px;flex-shrink:0"></canvas>
          <div>
            <div class="u-name">${u.name}</div>
            <div class="u-email">${u.email}</div>
            <div style="font-size:11px;color:var(--muted)">@${u.username||''}</div>
          </div>
        </div>
      </td>
      <td>
        ${u.is_admin
          ?'<span class="pill pill-yellow">👑 Admin</span>'
          :u.is_banned
            ?'<span class="pill pill-red">🚫 Bannato</span>'
            :u.is_verified
              ?'<span class="pill pill-green">✅ Attivo</span>'
              :'<span class="pill pill-gray">📧 Non verificato</span>'
        }
      </td>
      <td style="color:var(--green);font-weight:700">
        ${parseFloat(u.co2_saved||0).toFixed(1)} kg
      </td>
      <td style="color:var(--yellow);font-weight:700">
        ⭐ ${u.points||0}
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-icon" title="Attività"
            onclick="openUserActsModal(${u.id},'${u.name.replace(/'/g,"\\'")}')">
            <i class="fas fa-list"></i>
          </button>
          ${!u.is_admin?`
            <button class="btn-icon crown" title="Promuovi Admin"
              onclick="adminAction('promote',${u.id},'Promuovi ${u.name} ad Admin?')">
              <i class="fas fa-crown"></i>
            </button>
            <button class="btn-icon ${u.is_banned?'':'ban'}" title="${u.is_banned?'Sbanna':'Banna'}"
              onclick="adminAction('${u.is_banned?'unban':'ban'}',${u.id},'${u.is_banned?'Sbanna':'Banna'} ${u.name.replace(/'/g,"\\'")}?')">
              <i class="fas fa-${u.is_banned?'unlock':'ban'}"></i>
            </button>
            <button class="btn-icon warn" title="Warn"
              onclick="adminWarn(${u.id})">
              <i class="fas fa-exclamation-triangle"></i>
            </button>
            <button class="btn-icon reset" title="Reset CO2"
              onclick="adminAction('resetco2',${u.id},'Resetta CO2 di ${u.name.replace(/'/g,"\\'")}?')">
              <i class="fas fa-redo"></i>
            </button>
            <button class="btn-icon del" title="Elimina"
              onclick="adminAction('delete',${u.id},'ELIMINA definitivamente ${u.name.replace(/'/g,"\\'")}?')">
              <i class="fas fa-trash"></i>
            </button>
          `:''}
        </div>
      </td>
    </tr>`).join('');

  d.forEach(u=>drawMii(
    {color:u.avatar_color||'#16a34a',skin:u.avatar_skin||'#fde68a',
     eyes:u.avatar_eyes||'normal',mouth:u.avatar_mouth||'smile',hair:u.avatar_hair||'none'},
    `adav_${u.id}`,36
  ));
}

function adminAction(action, userId, msg) {
  const icons = {
    ban:'🚫', unban:'✅', delete:'🗑️',
    promote:'👑', resetco2:'🔄', warn:'⚠️'
  };
  showConfirm(
    action.charAt(0).toUpperCase()+action.slice(1),
    msg,
    async()=>{
      const d = await api(`/api/admin/${action}/${userId}`,'POST');
      if (d.error) return showN('❌ '+d.error,'error');
      showN('✅ Azione completata!','success');
      await loadAdmin();
    },
    icons[action]||'❓'
  );
}
window.adminAction = adminAction;

async function adminWarn(userId) {
  const msg = prompt('Motivo del warning:');
  if (!msg) return;
  const d = await api(`/api/admin/warn/${userId}`,'POST',{ message:msg });
  if (d.error) return showN('❌ '+d.error,'error');
  showN('⚠️ Warning inviato!','success');
}
window.adminWarn = adminWarn;

async function openUserActsModal(userId, name) {
  document.getElementById('userActsTitle').textContent = `Attività di ${name}`;
  document.getElementById('userActsModal').style.display = 'flex';
  const d  = await api(`/api/admin/user-activities/${userId}`);
  const el = document.getElementById('userActsBody');
  if (!el) return;
  if (!d.length||d.error) {
    el.innerHTML='<div class="empty"><p>Nessuna attività.</p></div>';
    return;
  }
  const icons={Bici:'🚴',Treno:'🚂',Bus:'🚌',Carpooling:'🚗',Remoto:'🏠',Videocall:'💻'};
  el.innerHTML = d.map(a=>`
    <div class="adm-act-item">
      <div style="font-size:22px">${icons[a.type]||'🌱'}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">${a.type}${a.note?' — '+a.note:''}</div>
        <div style="font-size:11px;color:var(--muted)">
          ${a.km>0?a.km+' km · ':''}
          ${a.hours>0?a.hours+'h · ':''}
          ${new Date(a.date).toLocaleDateString('it-IT')}
        </div>
      </div>
      <span class="tag tag-g">-${a.co2_saved} kg</span>
      <button class="adm-act-del" onclick="adminDeleteAct(${a.id},this)"
        title="Elimina attività">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('');
}
window.openUserActsModal = openUserActsModal;

function closeUserActsModal() {
  document.getElementById('userActsModal').style.display='none';
}
window.closeUserActsModal = closeUserActsModal;

async function adminDeleteAct(actId, btn) {
  const d = await api(`/api/admin/delete-activity/${actId}`,'DELETE');
  if (d.error) return showN('❌ '+d.error,'error');
  btn.closest('.adm-act-item')?.remove();
  showN('🗑️ Attività eliminata','info');
}
window.adminDeleteAct = adminDeleteAct;

// ══════════════════════════════════════════
//   ADMIN — SERVER ROUTES REMINDER
// ══════════════════════════════════════════
// Assicurati che nel server.js ci siano:
//
// app.get('/api/admin/users', auth, adminOnly, async...)
// app.post('/api/admin/ban/:id',   auth, adminOnly, async...)
// app.post('/api/admin/unban/:id', auth, adminOnly, async...)
// app.post('/api/admin/delete/:id',auth, adminOnly, async...)
// app.post('/api/admin/promote/:id',auth,adminOnly, async...)
// app.post('/api/admin/warn/:id',  auth, adminOnly, async...)
// app.post('/api/admin/resetco2/:id',auth,adminOnly,async...)
// app.get('/api/admin/user-activities/:id',auth,adminOnly,async...)
// app.delete('/api/admin/delete-activity/:id',auth,adminOnly,async...)

// ══════════════════════════════════════════
//   NOTIFICATIONS API
// ══════════════════════════════════════════
// app.get('/api/notifications', auth, async (req,res)=>{
//   const { rows } = await pool.query(
//     'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
//     [req.user.id]
//   );
//   res.json(rows);
// });
// app.post('/api/notifications/read', auth, async (req,res)=>{
//   await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1',[req.user.id]);
//   res.json({ ok:true });
// });

// ══════════════════════════════════════════
//   INIT — APP STARTUP
// ══════════════════════════════════════════
async function init() {
  // Auth check al caricamento
  if (token) {
    const d = await api('/api/profile');
    if (d.error) {
      // token scaduto → logout silenzioso
      token = null;
      localStorage.removeItem('ecotoken');
      document.getElementById('authWrap').style.display = 'flex';
      document.getElementById('app').style.display      = 'none';
      return;
    }
    myProfile = d;
    syncMiiState(d);
    document.getElementById('authWrap').style.display = 'none';
    document.getElementById('app').style.display      = 'flex';
    updateSidebar(d);
    await loadDashboard();
    loadNotifCount();
    setInterval(loadNotifCount, 30000);
    if (window.innerWidth<=768)
      document.getElementById('mobNav').style.display='flex';
  } else {
    document.getElementById('authWrap').style.display = 'flex';
    document.getElementById('app').style.display      = 'none';
  }
}

// Chiudi suggerimenti cliccando fuori
document.addEventListener('click', e=>{
  if (!e.target.closest('.inp-group')) {
    document.querySelectorAll('.addr-sugg').forEach(s=>s.innerHTML='');
  }
});

// Chiudi modali con ESC
document.addEventListener('keydown', e=>{
  if (e.key==='Escape') {
    document.getElementById('confirmOverlay').style.display = 'none';
    document.getElementById('userActsModal').style.display  = 'none';
    document.getElementById('inviteModal').style.display    = 'none';
    document.getElementById('tutOverlay').style.display     = 'none';
    closeShopPreview();
    confirmCb = null;
  }
});

// Avvia app
document.addEventListener('DOMContentLoaded', init);

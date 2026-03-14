'use strict';

// ══════════════════════════════════════════
//   GLOBALS
// ══════════════════════════════════════════
let token          = localStorage.getItem('ecotoken') || null;
let myProfile      = null;
let mapInstance    = null;
let mapInitialized = false;
let routeLayer     = null;
let confirmCb      = null;
let allShopItems   = [];
let ownedItems     = [];

let miiState = {
  color: '#16a34a',
  skin:  '#fde68a',
  eyes:  'normal',
  mouth: 'smile',
  hair:  'none'
};

// ══════════════════════════════════════════
//   UTILITY
// ══════════════════════════════════════════
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function showN(msg, type = 'success') {
  const el = document.getElementById('notifToast');
  if (!el) return;
  el.textContent = msg;
  el.className   = `notif-toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

function showConfirm(title, msg, cb, icon = '❓') {
  document.getElementById('confirmTitle').textContent = icon + ' ' + title;
  document.getElementById('confirmMsg').textContent   = msg;
  document.getElementById('confirmOverlay').style.display = 'flex';
  confirmCb = cb;
}
window.confirmYes = function () {
  document.getElementById('confirmOverlay').style.display = 'none';
  if (confirmCb) { confirmCb(); confirmCb = null; }
};
window.confirmNo = function () {
  document.getElementById('confirmOverlay').style.display = 'none';
  confirmCb = null;
};

// ══════════════════════════════════════════
//   API
// ══════════════════════════════════════════
async function api(url, method = 'GET', body = null) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body)  opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) {
      token = null;
      localStorage.removeItem('ecotoken');
      document.getElementById('authWrap').style.display = 'flex';
      document.getElementById('app').style.display      = 'none';
    }
    return d;
  } catch (err) {
    console.error('API error:', err);
    return { error: 'Errore di connessione' };
  }
}

// ══════════════════════════════════════════
//   NAVIGATION
// ══════════════════════════════════════════
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.section === id);
  });

  const titles = {
    dashboard:   ['Dashboard',   'Bentornato! 🌱'],
    activities:  ['Attività',    'Registra le tue azioni eco 🚴'],
    challenges:  ['Sfide',       'Sfida te stesso e gli altri 🏆'],
    leaderboard: ['Classifica',  'Chi salva più CO₂? 🥇'],
    social:      ['Social',      'Condividi la tua eco-journey 💬'],
    shop:        ['Shop',        'Personalizza il tuo avatar 🛍️'],
    profile:     ['Profilo',     'Il tuo profilo eco 🌿'],
    notifiche:   ['Notifiche',   'Le tue notifiche 🔔'],
    admin:       ['Admin',       'Pannello di controllo 👑'],
  };
  const [title, sub] = titles[id] || ['EcoTrack', ''];
  const tEl = document.getElementById('topbarTitle');
  const sEl = document.getElementById('topbarSub');
  if (tEl) tEl.textContent = title;
  if (sEl) sEl.textContent = sub;

  if      (id === 'dashboard')   loadDashboard();
  else if (id === 'activities')  loadActivities();
  else if (id === 'challenges')  loadChallenges();
  else if (id === 'leaderboard') loadLeaderboard();
  else if (id === 'social')      loadSocial();
  else if (id === 'shop')        loadShop();
  else if (id === 'profile')     loadProfile();
  else if (id === 'notifiche')   loadNotifiche();
  else if (id === 'admin')       loadAdmin();

  if (window.innerWidth <= 768)
    document.getElementById('sidebar')?.classList.remove('open');
}
window.showSection = showSection;

function logout() {
  showConfirm('Logout', 'Sei sicuro di voler uscire?', () => {
    token     = null;
    myProfile = null;
    localStorage.removeItem('ecotoken');
    document.getElementById('authWrap').style.display = 'flex';
    document.getElementById('app').style.display      = 'none';
  }, '👋');
}
window.logout = logout;

// ══════════════════════════════════════════
//   AUTH TABS
// ══════════════════════════════════════════
function switchTab(tab) {
  const forms = {
    login:    'loginForm',
    register: 'registerForm',
    forgot:   'forgotForm',
    reset:    'resetForm'
  };
  Object.entries(forms).forEach(([t, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = t === tab ? 'flex' : 'none';
  });
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
}
window.switchTab = switchTab;

// ══════════════════════════════════════════
//   TOGGLE PASSWORD
// ══════════════════════════════════════════
function togglePwd(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isText = el.type === 'text';
  el.type = isText ? 'password' : 'text';
  btn.querySelector('i').className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
}
window.togglePwd = togglePwd;

// ══════════════════════════════════════════
//   LOGIN
// ══════════════════════════════════════════
async function doLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('lErr');
  errEl.textContent = '';
  errEl.style.color = '#ef4444';

  const identifierEl = document.getElementById('lIdentifier')
                    || document.getElementById('lEmail');
  const identifier   = identifierEl?.value?.trim();
  const password     = document.getElementById('lPwd')?.value;

  if (!identifier || !password) {
    errEl.textContent = 'Campi mancanti';
    return;
  }

  const btn = document.querySelector('#loginForm button[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const d = await api('/api/login', 'POST', { identifier, password });

  if (btn) {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Accedi</span>';
  }

  if (d.error) {
    errEl.textContent = d.error;
    if (d.needsVerify) {
      errEl.innerHTML += `<br><button class="link-btn"
        onclick="resendVerify('${identifier}')">📧 Reinvia email verifica</button>`;
    }
    return;
  }

  token = d.token;
  localStorage.setItem('ecotoken', token);
  myProfile = d.user;
  syncMiiState(d.user);

  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('app').style.display      = 'flex';
  updateSidebar(d.user);
  await loadDashboard();
  loadNotifCount();
  setInterval(loadNotifCount, 30000);
  if (window.innerWidth <= 768)
    document.getElementById('mobNav').style.display = 'flex';
}
window.doLogin = doLogin;

// ══════════════════════════════════════════
//   REGISTER
// ══════════════════════════════════════════
function checkPwdStrength(pwd) {
  const has8   = pwd.length >= 8;
  const hasUp  = /[A-Z]/.test(pwd);
  const hasNum = /[0-9]/.test(pwd);
  const hasSym = /[^a-zA-Z0-9]/.test(pwd);
  const set = (id, ok) => {
    const el = document.getElementById(id);
    if (el) el.style.color = ok ? '#16a34a' : '#94a3b8';
  };
  set('r8',  has8);
  set('rUp', hasUp);
  set('rN',  hasNum);
  set('rS',  hasSym);
  return has8 && hasUp && hasNum && hasSym;
}
window.checkPwdStrength = checkPwdStrength;

async function doRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('rErr');
  errEl.textContent = '';
  errEl.style.color = '#ef4444';

  const name     = document.getElementById('rName')?.value?.trim();
  const username = document.getElementById('rUsername')?.value?.trim();
  const email    = document.getElementById('rEmail')?.value?.trim();
  const password = document.getElementById('rPwd')?.value;

  if (!name || !username || !email || !password) {
    errEl.textContent = 'Tutti i campi sono obbligatori';
    return;
  }
  if (!checkPwdStrength(password)) {
    errEl.textContent = 'Password troppo debole';
    return;
  }

  const btn = document.querySelector('#registerForm button[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrazione...'; }

  const d = await api('/api/register', 'POST', { name, username, email, password });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Registrati'; }

  if (d.error) { errEl.textContent = d.error; return; }

  errEl.style.color = '#16a34a';
  errEl.innerHTML   = `✅ Registrazione completata!<br>📧 Controlla <b>${email}</b> per verificare l'account.`;
  ['rName','rUsername','rEmail','rPwd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
window.doRegister = doRegister;

async function resendVerify(email) {
  const d = await api('/api/resend-verify', 'POST', { email });
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('📧 Email di verifica reinviata!', 'success');
}
window.resendVerify = resendVerify;

// ══════════════════════════════════════════
//   FORGOT / RESET PASSWORD
// ══════════════════════════════════════════
async function doForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail')?.value?.trim();
  const errEl = document.getElementById('forgotErr');
  if (!email) { errEl.textContent = 'Inserisci la tua email'; return; }

  const btn = document.querySelector('#forgotForm button[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const d = await api('/api/forgot-password', 'POST', { email });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Invia Link Reset</span>'; }

  if (d.error) { errEl.textContent = d.error; return; }
  errEl.style.color = '#16a34a';
  errEl.textContent = '✅ Email inviata! Controlla la tua casella.';
  document.getElementById('forgotEmail').value = '';
}
window.doForgotPassword = doForgotPassword;

async function doResetPassword(e) {
  e.preventDefault();
  const params   = new URLSearchParams(window.location.search);
  const resetTok = params.get('token');
  const newPwd   = document.getElementById('resetPwd')?.value;
  const errEl    = document.getElementById('resetErr');

  if (!resetTok) { errEl.textContent = 'Token mancante'; return; }
  if (!newPwd)   { errEl.textContent = 'Inserisci la nuova password'; return; }
  if (!checkPwdStrength(newPwd)) { errEl.textContent = 'Password troppo debole'; return; }

  const d = await api('/api/reset-password', 'POST', { token: resetTok, new_password: newPwd });

  if (d.error) { errEl.textContent = d.error; return; }
  errEl.style.color = '#16a34a';
  errEl.textContent = '✅ Password resettata! Ora puoi accedere.';
  setTimeout(() => switchTab('login'), 2000);
}
window.doResetPassword = doResetPassword;

// ══════════════════════════════════════════
//   SIDEBAR + TOPBAR UPDATE
// ══════════════════════════════════════════
function updateSidebar(u) {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('sbName',   u.name  || '');
  set('sbEmail',  u.email || '');
  set('sbPoints', (u.points || 0) + ' pts');
  set('sbCo2',    parseFloat(u.co2_saved || 0).toFixed(1) + ' kg');
  set('topCo2',   parseFloat(u.co2_saved || 0).toFixed(1) + ' kg CO₂');
  set('topPoints',(u.points || 0) + ' pt');

  if (u.is_admin) {
    const btn = document.getElementById('adminNavBtn');
    if (btn) btn.style.display = 'flex';
  }
  drawMii(miiState, 'sbAvatarCanvas', 36);
}

function syncMiiState(u) {
  if (!u) return;
  miiState.color = u.avatar_color || '#16a34a';
  miiState.skin  = u.avatar_skin  || '#fde68a';
  miiState.eyes  = u.avatar_eyes  || 'normal';
  miiState.mouth = u.avatar_mouth || 'smile';
  miiState.hair  = u.avatar_hair  || 'none';
}

// ══════════════════════════════════════════
//   MII DRAW (Canvas)
// ══════════════════════════════════════════
function drawMii(state, canvasId, size = 120) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = size;
  canvas.height = size;
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.38;
  const unit = size / 120;

  ctx.clearRect(0, 0, size, size);

  // sfondo
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = state.color || '#16a34a';
  ctx.fill();

  // testa
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = state.skin || '#fde68a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth   = size * 0.015;
  ctx.stroke();

  // ── CAPELLI ──────────────────────────────
  ctx.save();
  switch (state.hair) {
    case 'short':
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      ctx.fillStyle = '#92400e'; ctx.fill(); break;
    case 'long':
      ctx.beginPath();
      ctx.ellipse(cx, cy, r*1.05, r*1.3, 0, Math.PI*1.1, Math.PI*1.9);
      ctx.fillStyle = '#78350f'; ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      ctx.fillStyle = '#92400e'; ctx.fill(); break;
    case 'curly':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a)*r*0.7, cy - Math.sin(a)*r*0.7 - r*0.2, r*0.25, 0, Math.PI*2);
        ctx.fillStyle = '#d97706'; ctx.fill();
      }
      break;
    case 'bun':
      ctx.beginPath();
      ctx.arc(cx, cy - r*1.15, r*0.35, 0, Math.PI*2);
      ctx.fillStyle = '#92400e'; ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      ctx.fillStyle = '#92400e'; ctx.fill(); break;
    case 'mohawk':
      ctx.beginPath();
      ctx.moveTo(cx - r*0.2, cy - r*0.7);
      ctx.lineTo(cx, cy - r*1.5);
      ctx.lineTo(cx + r*0.2, cy - r*0.7);
      ctx.fillStyle = '#dc2626'; ctx.fill(); break;
    case 'wavy':
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      ctx.fillStyle = '#b45309'; ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx - r*0.8 + i*r*0.5, cy + r*0.6, r*0.2, 0, Math.PI*2);
        ctx.fillStyle = '#b45309'; ctx.fill();
      }
      break;
    case 'cap':
      ctx.beginPath();
      ctx.ellipse(cx, cy - r*0.55, r*1.1, r*0.25, 0, 0, Math.PI*2);
      ctx.fillStyle = '#1d4ed8'; ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.6, r*0.9, Math.PI, 0);
      ctx.fillStyle = '#1d4ed8'; ctx.fill(); break;
    case 'rainbow':
      ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r*(1.05 + i*0.07), Math.PI*1.1, Math.PI*1.9);
        ctx.strokeStyle = c; ctx.lineWidth = size*0.045; ctx.stroke();
      }); break;
    case 'gold':
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      ctx.fillStyle = '#f59e0b'; ctx.fill();
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = size*0.12;
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r*0.95, Math.PI, 0);
      ctx.fillStyle = '#fcd34d'; ctx.fill();
      ctx.shadowBlur = 0; break;
    case 'galaxy':
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      const gGrad = ctx.createLinearGradient(cx-r, cy-r, cx+r, cy);
      gGrad.addColorStop(0, '#4c1d95');
      gGrad.addColorStop(0.5, '#7c3aed');
      gGrad.addColorStop(1, '#ec4899');
      ctx.fillStyle = gGrad; ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(
          cx - r*0.7 + Math.random()*r*1.4,
          cy - r*0.8 + Math.random()*r*0.6,
          size*0.018, 0, Math.PI*2
        );
        ctx.fillStyle = 'white'; ctx.fill();
      }
      break;
    case 'flame':
      ctx.beginPath();
      ctx.arc(cx, cy - r*0.1, r, Math.PI, 0);
      const fGrad = ctx.createLinearGradient(cx, cy-r*1.2, cx, cy-r*0.1);
      fGrad.addColorStop(0, '#fbbf24');
      fGrad.addColorStop(0.5, '#f97316');
      fGrad.addColorStop(1, '#dc2626');
      ctx.fillStyle = fGrad; ctx.fill(); break;
    default: break;
  }
  ctx.restore();

  // ── OCCHI ────────────────────────────────
  const eyeY  = cy - r * 0.12;
  const eyeXL = cx - r * 0.32;
  const eyeXR = cx + r * 0.32;
  const eyeR  = r * 0.13;

  ctx.save();
  switch (state.eyes) {
    case 'happy':
      [eyeXL, eyeXR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eyeY + eyeR*0.5, eyeR*1.1, Math.PI, 0, true);
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2.5; ctx.stroke();
      }); break;
    case 'sleepy':
      [eyeXL, eyeXR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR, 0, Math.PI);
        ctx.fillStyle = '#1e293b'; ctx.fill();
      }); break;
    case 'surprised':
      [eyeXL, eyeXR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR*1.4, 0, Math.PI*2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2; ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR*0.7, 0, Math.PI*2);
        ctx.fillStyle = '#1e293b'; ctx.fill();
      }); break;
    case 'wink':
      ctx.beginPath();
      ctx.arc(eyeXL, eyeY, eyeR, 0, Math.PI*2);
      ctx.fillStyle = '#1e293b'; ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeXR, eyeY + eyeR*0.5, eyeR*1.1, Math.PI, 0, true);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2.5; ctx.stroke();
      break;
    case 'cool':
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(eyeXL - eyeR*1.5, eyeY - eyeR*0.7, eyeR*3, eyeR*1.4, eyeR*0.4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(eyeXR - eyeR*1.5, eyeY - eyeR*0.7, eyeR*3, eyeR*1.4, eyeR*0.4);
      ctx.fill(); break;
    case 'star':
      [eyeXL, eyeXR].forEach(ex => {
        ctx.font = `${eyeR*2.2}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⭐', ex, eyeY);
      }); break;
    case 'heart':
      [eyeXL, eyeXR].forEach(ex => {
        ctx.font = `${eyeR*2.2}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('❤️', ex, eyeY);
      }); break;
    case 'laser':
      [eyeXL, eyeXR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR, 0, Math.PI*2);
        ctx.fillStyle = '#ef4444'; ctx.fill();
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = size*0.1;
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR*0.4, 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.shadowBlur = 0;
      }); break;
    default:
      [eyeXL, eyeXR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR, 0, Math.PI*2);
        ctx.fillStyle = '#1e293b'; ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + eyeR*0.3, eyeY - eyeR*0.3, eyeR*0.3, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
      });
  }
  ctx.restore();

  // ── BOCCA ────────────────────────────────
  const mouthY = cy + r * 0.32;
  ctx.save();
  switch (state.mouth) {
    case 'grin':
      ctx.beginPath();
      ctx.arc(cx, mouthY - r*0.08, r*0.38, 0.15, Math.PI - 0.15);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2.5; ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, mouthY - r*0.08, r*0.38, 0.15, Math.PI - 0.15);
      ctx.lineTo(cx - r*0.37, mouthY - r*0.08);
      ctx.fillStyle = '#fca5a5'; ctx.fill(); break;
    case 'open':
      ctx.beginPath();
      ctx.ellipse(cx, mouthY, r*0.22, r*0.15, 0, 0, Math.PI*2);
      ctx.fillStyle = '#1e293b'; ctx.fill(); break;
    case 'smirk':
      ctx.beginPath();
      ctx.moveTo(cx - r*0.2, mouthY);
      ctx.quadraticCurveTo(cx + r*0.1, mouthY - r*0.1, cx + r*0.3, mouthY - r*0.05);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2.5; ctx.stroke(); break;
    case 'tongue':
      ctx.beginPath();
      ctx.arc(cx, mouthY - r*0.05, r*0.3, 0, Math.PI);
      ctx.fillStyle = '#1e293b'; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + r*0.12, r*0.16, r*0.13, 0, 0, Math.PI*2);
      ctx.fillStyle = '#f87171'; ctx.fill(); break;
    case 'sad':
      ctx.beginPath();
      ctx.arc(cx, mouthY + r*0.25, r*0.32, Math.PI + 0.3, -0.3);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2.5; ctx.stroke(); break;
    case 'rainbow':
      ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(cx, mouthY - r*0.05, r*(0.28 + i*0.04), 0.2, Math.PI - 0.2);
        ctx.strokeStyle = c; ctx.lineWidth = unit*2; ctx.stroke();
      }); break;
    case 'fire':
      ctx.font = `${r*0.55}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🔥', cx, mouthY + r*0.05); break;
    default:
      ctx.beginPath();
      ctx.arc(cx, mouthY - r*0.05, r*0.32, 0.2, Math.PI - 0.2);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = unit*2.5; ctx.stroke();
  }
  ctx.restore();
}

// ══════════════════════════════════════════
//   MII BUILDER HELPERS
// ══════════════════════════════════════════
function pickMii(cat, val, el) {
  const itemId = parseInt(el.dataset.itemId);
  if (itemId && !ownedItems.includes(itemId)) {
    showN('🔒 Acquista questo oggetto nello Shop!', 'warning');
    return;
  }
  miiState[cat] = val;
  document.querySelectorAll(`[data-cat="${cat}"]`).forEach(o => o.classList.remove('active','sel'));
  el.classList.add('active', 'sel');
  drawMii(miiState, 'miiCanvas', 120);
  drawMii(miiState, 'sbAvatarCanvas', 36);
}
window.pickMii = pickMii;

function pickColor(val, el) {
  miiState.color = val;
  el.closest('.color-row')?.querySelectorAll('.color-swatch')
    .forEach(o => o.classList.remove('active','sel'));
  el.classList.add('active', 'sel');
  drawMii(miiState, 'miiCanvas', 120);
  drawMii(miiState, 'sbAvatarCanvas', 36);
}
window.pickColor = pickColor;

function pickSkin(val, el) {
  miiState.skin = val;
  el.closest('.color-row')?.querySelectorAll('.color-swatch')
    .forEach(o => o.classList.remove('active','sel'));
  el.classList.add('active', 'sel');
  drawMii(miiState, 'miiCanvas', 120);
  drawMii(miiState, 'sbAvatarCanvas', 36);
}
window.pickSkin = pickSkin;

// ══════════════════════════════════════════
//   ACTIVITIES TYPE SELECT
// ══════════════════════════════════════════
function selectType(val, btn) {
  document.getElementById('actType').value = val;
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('active','sel'));
  btn.classList.add('active', 'sel');
  onTypeChange(val);
}
window.selectType = selectType;

function onTypeChange(val) {
  const kmG  = document.getElementById('kmGroup');
  const hrG  = document.getElementById('hoursGroup');
  const mapG = document.getElementById('mapGroup');
  const kbTypes  = ['Bici','Treno','Bus','Carpooling'];
  const hrTypes  = ['Remoto','Videocall'];
  const mapTypes = ['Bici','Treno','Bus','Carpooling'];

  if (kmG)  kmG.style.display  = kbTypes.includes(val)  ? 'block' : 'none';
  if (hrG)  hrG.style.display  = hrTypes.includes(val)  ? 'block' : 'none';
  if (mapG) mapG.style.display = mapTypes.includes(val) ? 'block' : 'none';

  if (mapTypes.includes(val)) initMap();
}
window.onTypeChange = onTypeChange;

// ══════════════════════════════════════════
//   DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  const stats = await api('/api/stats');
  if (stats.error) return;

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('co2Total',   parseFloat(stats.co2_saved  || 0).toFixed(1));
  set('co2Week',    parseFloat(stats.co2_week   || 0).toFixed(1));
  set('co2Month',   parseFloat(stats.co2_month  || 0).toFixed(1));
  set('userPoints', stats.points || 0);
  set('topCo2',     parseFloat(stats.co2_saved  || 0).toFixed(1) + ' kg CO₂');
  set('topPoints',  (stats.points || 0) + ' pt');

  const yearly = await api('/api/yearly');
  if (!yearly.error) renderYearlyChart(yearly);

  const acts = await api('/api/activities');
  const el   = document.getElementById('recentActs');
  if (el && !acts.error) {
    if (!acts.length) {
      el.innerHTML = '<div class="empty"><div class="ei">🌱</div><p>Nessuna attività ancora.<br>Inizia a tracciare!</p></div>';
    } else {
      const icons = { Bici:'🚴', Treno:'🚂', Bus:'🚌', Carpooling:'🚗', Remoto:'🏠', Videocall:'💻' };
      el.innerHTML = acts.slice(0, 5).map(a => `
        <div class="act-item">
          <div class="act-icon">${icons[a.type] || '🌱'}</div>
          <div class="act-info">
            <div class="act-type">${a.type}${a.note ? ' — ' + a.note : ''}</div>
            <div class="act-meta">
              ${a.km > 0 ? a.km + ' km · ' : ''}
              ${a.hours > 0 ? a.hours + 'h · ' : ''}
              ${new Date(a.date).toLocaleDateString('it-IT')}
            </div>
          </div>
          <div class="act-co2">-${a.co2_saved} kg</div>
        </div>`).join('');
    }
  }

  const badges = await api('/api/badges');
  const bEl    = document.getElementById('dashBadges');
  if (bEl && !badges.error) {
    const unlocked = badges.filter(b => b.unlocked);
    if (!unlocked.length) {
      bEl.innerHTML = '<div class="empty"><p>Nessun badge ancora 🏅</p></div>';
    } else {
      bEl.innerHTML = unlocked.map(b => `
        <div class="badge-item unlocked" title="${b.name}: ${b.desc}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${b.name}</div>
        </div>`).join('');
    }
  }
}

function renderYearlyChart(data) {
  const canvas = document.getElementById('yearlyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 600;
  canvas.height = canvas.offsetHeight || 200;
  const w = canvas.width, h = canvas.height;
  const pad = { t:20, r:20, b:40, l:50 };

  ctx.clearRect(0, 0, w, h);

  if (!data.length) {
    ctx.fillStyle = '#94a3b8';
    ctx.font      = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nessun dato disponibile', w/2, h/2);
    return;
  }

  const maxCo2 = Math.max(...data.map(d => parseFloat(d.co2)), 1);
  const chartW = w - pad.l - pad.r;
  const chartH = h - pad.t - pad.b;
  const barGap = chartW / data.length;
  const barW   = barGap * 0.6;

  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.lineWidth   = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(p => {
    const y = pad.t + chartH * (1 - p);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((maxCo2 * p).toFixed(1), pad.l - 5, y + 4);
  });

  data.forEach((d, i) => {
    const x    = pad.l + i * barGap + (barGap - barW) / 2;
    const barH = (parseFloat(d.co2) / maxCo2) * chartH;
    const y    = pad.t + chartH - barH;
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(1, '#16a34a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 4);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.month, x + barW/2, h - pad.b + 16);
    if (parseFloat(d.co2) > 0) {
      ctx.fillStyle = '#22c55e';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(parseFloat(d.co2).toFixed(1), x + barW/2, y - 4);
    }
  });
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
async function loadActivities() {
  const acts = await api('/api/activities');
  const el   = document.getElementById('actList');
  if (!el || acts.error) return;

  if (!acts.length) {
    el.innerHTML = '<div class="empty"><div class="ei">🌱</div><p>Nessuna attività.<br>Aggiungine una!</p></div>';
    return;
  }

  const icons = { Bici:'🚴', Treno:'🚂', Bus:'🚌', Carpooling:'🚗', Remoto:'🏠', Videocall:'💻' };
  el.innerHTML = acts.map(a => `
    <div class="act-item">
      <div class="act-icon">${icons[a.type] || '🌱'}</div>
      <div class="act-info">
        <div class="act-type">${a.type}${a.note ? ' — ' + a.note : ''}</div>
        <div class="act-meta">
          ${a.km > 0 ? a.km + ' km · ' : ''}
          ${a.hours > 0 ? a.hours + 'h · ' : ''}
          ${new Date(a.date).toLocaleDateString('it-IT')}
          ${a.from_addr ? '· 📍 ' + a.from_addr : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div class="act-co2">-${a.co2_saved} kg</div>
        <div style="font-size:11px;color:var(--yellow)">+${a.points} pts</div>
      </div>
    </div>`).join('');
}

async function logActivity(e) {
  e.preventDefault();
  const type      = document.getElementById('actType')?.value;
  const km        = document.getElementById('actKm')?.value    || 0;
  const hours     = document.getElementById('actHours')?.value || 0;
  const note      = document.getElementById('actNote')?.value  || '';
  const from_addr = document.getElementById('fromAddr')?.value || '';
  const to_addr   = document.getElementById('toAddr')?.value   || '';

  if (!type) return showN('❌ Seleziona un tipo', 'error');

  const btn = document.querySelector('#actForm button[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const d = await api('/api/activities', 'POST', { type, km, hours, note, from_addr, to_addr });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Registra'; }
  if (d.error) return showN('❌ ' + d.error, 'error');

  showN(`✅ +${d.co2_saved} kg CO₂! +${d.points} punti 🎉`, 'success');
  document.getElementById('actForm')?.reset();
  document.getElementById('actType').value             = '';
  document.getElementById('kmGroup').style.display     = 'none';
  document.getElementById('hoursGroup').style.display  = 'none';
  document.getElementById('mapGroup').style.display    = 'none';
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('active','sel'));

  if (myProfile) {
    myProfile.points   = (myProfile.points   || 0) + d.points;
    myProfile.co2_saved= (parseFloat(myProfile.co2_saved) || 0) + parseFloat(d.co2_saved);
    updateSidebar(myProfile);
  }
  await loadActivities();
}
window.logActivity = logActivity;

// ══════════════════════════════════════════
//   MAPPA (Leaflet + Nominatim)
// ══════════════════════════════════════════
function initMap() {
  if (mapInitialized || !window.L) return;
  mapInitialized = true;
  mapInstance = L.map('map').setView([45.4642, 9.1900], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance);
}

async function searchRoute() {
  const from = document.getElementById('fromAddr')?.value?.trim();
  const to   = document.getElementById('toAddr')?.value?.trim();
  if (!from || !to) return showN('❌ Inserisci partenza e arrivo', 'error');

  const geocode = async q => {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
    );
    const d = await r.json();
    return d[0] ? [parseFloat(d[0].lat), parseFloat(d[0].lon)] : null;
  };

  const [a, b] = await Promise.all([geocode(from), geocode(to)]);
  if (!a) return showN('❌ Partenza non trovata', 'error');
  if (!b) return showN('❌ Arrivo non trovato',   'error');

  if (!mapInitialized) initMap();
  if (routeLayer) mapInstance.removeLayer(routeLayer);

  routeLayer = L.polyline([a, b], { color:'#22c55e', weight:4 }).addTo(mapInstance);
  mapInstance.fitBounds(routeLayer.getBounds(), { padding:[30,30] });

  const R    = 6371;
  const dLat = (b[0]-a[0]) * Math.PI/180;
  const dLon = (b[1]-a[1]) * Math.PI/180;
  const aa   = Math.sin(dLat/2)**2 +
               Math.cos(a[0]*Math.PI/180) * Math.cos(b[0]*Math.PI/180) *
               Math.sin(dLon/2)**2;
  const km   = R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));

  const kmEl = document.getElementById('actKm');
  if (kmEl) kmEl.value = km.toFixed(1);
  showN(`📍 Distanza: ${km.toFixed(1)} km`, 'success');
}
window.searchRoute = searchRoute;

async function getSuggestions(fieldId, query) {
  const sugg = document.getElementById(fieldId + 'Sugg');
  if (!sugg) return;
  if (query.length < 3) { sugg.innerHTML = ''; return; }
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`
    );
    const d = await r.json();
    sugg.innerHTML = d.map(p => `
      <div class="addr-item"
        onclick="selectAddr('${fieldId}','${p.display_name.replace(/'/g, "\\'")}')">
        📍 ${p.display_name}
      </div>`).join('');
  } catch {}
}
window.getSuggestions = getSuggestions;

function selectAddr(fieldId, val) {
  const el   = document.getElementById(fieldId);
  const sugg = document.getElementById(fieldId + 'Sugg');
  if (el)   el.value       = val;
  if (sugg) sugg.innerHTML = '';
}
window.selectAddr = selectAddr;

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
async function loadChallenges() {
  const data = await api('/api/challenges');
  const el   = document.getElementById('challengeList');
  if (!el || data.error) return;

  if (!data.length) {
    el.innerHTML = '<div class="empty"><div class="ei">🏆</div><p>Nessuna sfida.<br>Creane una!</p></div>';
    return;
  }

  el.innerHTML = data.map(c => {
    const end     = c.end_date ? new Date(c.end_date).toLocaleDateString('it-IT') : '∞';
    const expired = c.end_date && new Date(c.end_date) < new Date();
    return `
      <div class="challenge-item ${expired ? 'expired' : ''}">
        <div class="ch-header">
          <div class="ch-title">${c.title}</div>
          ${c.is_public
            ? '<span class="pill pill-green">🌍 Pubblica</span>'
            : '<span class="pill pill-gray">🔒 Privata</span>'}
        </div>
        ${c.description ? `<div class="ch-desc">${c.description}</div>` : ''}
        <div class="ch-meta">
          ${c.co2_target > 0 ? `🎯 Target: <b>${c.co2_target} kg CO₂</b> · ` : ''}
          ${c.points_reward > 0 ? `⭐ Premio: <b>${c.points_reward} pts</b> · ` : ''}
          📅 Scadenza: <b>${end}</b> · 👤 ${c.creator_name || 'Anonimo'}
        </div>
      </div>`;
  }).join('');
}

async function createChallenge(e) {
  e.preventDefault();
  const title         = document.getElementById('chTitle')?.value?.trim();
  const description   = document.getElementById('chDesc')?.value?.trim();
  const co2_target    = document.getElementById('chCo2')?.value    || 0;
  const points_reward = document.getElementById('chPts')?.value    || 0;
  const end_date      = document.getElementById('chDate')?.value   || null;
  const is_public     = document.getElementById('chPublic')?.checked !== false;

  if (!title) return showN('❌ Titolo obbligatorio', 'error');

  const d = await api('/api/challenges', 'POST', {
    title, description, co2_target, points_reward, end_date, is_public
  });
  if (d.error) return showN('❌ ' + d.error, 'error');

  showN('🏆 Sfida creata!', 'success');
  document.getElementById('challengeForm')?.reset();
  await loadChallenges();
}
window.createChallenge = createChallenge;

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLeaderboard() {
  const data = await api('/api/leaderboard');
  const el   = document.getElementById('lbList');
  if (!el || data.error) return;

  if (!data.length) {
    el.innerHTML = '<div class="empty"><p>Nessun utente in classifica.</p></div>';
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = data.map((u, i) => `
    <div class="lb-item ${i < 3 ? 'top' : ''}">
      <div class="lb-rank">${medals[i] || (i + 1)}</div>
      <canvas id="lbav_${u.id}" width="40" height="40"
        style="border-radius:10px;flex-shrink:0"></canvas>
      <div class="lb-info">
        <div class="lb-name">${u.name}</div>
        <div class="lb-user">@${u.username || ''}</div>
      </div>
      <div class="lb-stats">
        <div class="lb-co2">🌱 ${parseFloat(u.co2_saved || 0).toFixed(1)} kg</div>
        <div class="lb-pts">⭐ ${u.points || 0} pts</div>
      </div>
    </div>`).join('');

  data.forEach(u => drawMii(
    { color: u.avatar_color||'#16a34a', skin: u.avatar_skin||'#fde68a',
      eyes:  u.avatar_eyes||'normal',   mouth: u.avatar_mouth||'smile',
      hair:  u.avatar_hair||'none' },
    `lbav_${u.id}`, 40
  ));
}

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return diff + 's fa';
  if (diff < 3600)  return Math.floor(diff / 60) + 'min fa';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h fa';
  return Math.floor(diff / 86400) + 'gg fa';
}

async function loadSocial() {
  const [posts, users] = await Promise.all([
    api('/api/social/posts'),
    api('/api/social/users')
  ]);

  const feed = document.getElementById('socialFeed');
  if (feed && !posts.error) {
    if (!posts.length) {
      feed.innerHTML = '<div class="empty"><div class="ei">💬</div><p>Nessun post ancora.<br>Sii il primo!</p></div>';
    } else {
      feed.innerHTML = posts.map(p => `
        <div class="post-card" id="post_${p.id}">
          <div class="post-header">
            <canvas id="pav_${p.id}" width="40" height="40"
              style="border-radius:10px;flex-shrink:0"></canvas>
            <div class="post-meta">
              <div class="post-author">${p.author_name}</div>
              <div class="post-time">@${p.author_username || ''} · ${timeAgo(new Date(p.created_at))}</div>
            </div>
            ${p.author_id === myProfile?.id
              ? `<button class="btn-icon danger-btn ml-auto" onclick="deletePost(${p.id})">🗑️</button>`
              : ''}
          </div>
          <div class="post-content">${escHtml(p.content)}</div>
          ${p.image_url ? `<img src="${p.image_url}" class="post-img" alt="post" onerror="this.style.display='none'">` : ''}
          <div class="post-actions">
            <button class="btn-like ${p.liked_by_me ? 'liked' : ''}" onclick="toggleLike(${p.id})">
              ${p.liked_by_me ? '❤️' : '🤍'} ${p.likes_count || 0}
            </button>
            <button class="btn-comment" onclick="toggleComments(${p.id})">
              💬 ${p.comments_count || 0}
            </button>
          </div>
          <div class="comments-section" id="comm_${p.id}" style="display:none"></div>
        </div>`).join('');

      posts.forEach(p => drawMii(
        { color: p.avatar_color||'#16a34a', skin: p.avatar_skin||'#fde68a',
          eyes:  p.avatar_eyes||'normal',   mouth: p.avatar_mouth||'smile',
          hair:  p.avatar_hair||'none' },
        `pav_${p.id}`, 40
      ));
    }
  }

  const uList = document.getElementById('userList');
  if (uList && !users.error) {
    if (!users.length) {
      uList.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:10px">Nessun altro utente.</p>';
    } else {
      uList.innerHTML = users.map(u => `
        <div class="user-item">
          <canvas id="uav_${u.id}" width="32" height="32"
            style="border-radius:8px;flex-shrink:0"></canvas>
          <div class="user-info">
            <div class="user-name">${u.name}</div>
            <div class="user-un">@${u.username || ''}</div>
          </div>
          <button class="btn-follow ${u.following ? 'following' : ''}"
            onclick="toggleFollow(${u.id},this)">
            ${u.following ? '✅' : '➕'}
          </button>
        </div>`).join('');

      users.forEach(u => drawMii(
        { color: u.avatar_color||'#16a34a', skin: u.avatar_skin||'#fde68a',
          eyes:  u.avatar_eyes||'normal',   mouth: u.avatar_mouth||'smile',
          hair:  u.avatar_hair||'none' },
        `uav_${u.id}`, 32
      ));
    }
  }
}

async function createPost(e) {
  e.preventDefault();
  const content  = document.getElementById('postContent')?.value?.trim();
  const imageUrl = document.getElementById('postImage')?.value?.trim() || '';
  if (!content) return showN('❌ Scrivi qualcosa!', 'error');

  const btn = document.querySelector('#postForm button[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  const d = await api('/api/social/posts', 'POST', { content, image_url: imageUrl });
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Pubblica'; }
  if (d.error) return showN('❌ ' + d.error, 'error');

  showN('📤 Post pubblicato!', 'success');
  document.getElementById('postContent').value = '';
  document.getElementById('postImage').value   = '';
  await loadSocial();
}
window.createPost = createPost;

async function deletePost(postId) {
  showConfirm('Elimina post', 'Eliminare questo post?', async () => {
    const d = await api(`/api/social/posts/${postId}`, 'DELETE');
    if (d.error) return showN('❌ ' + d.error, 'error');
    showN('🗑️ Post eliminato', 'success');
    await loadSocial();
  }, '🗑️');
}
window.deletePost = deletePost;

async function toggleLike(postId) {
  const d = await api(`/api/social/posts/${postId}/like`, 'POST');
  if (d.error) return showN('❌ ' + d.error, 'error');
  const btn = document.querySelector(`#post_${postId} .btn-like`);
  if (btn) {
    btn.classList.toggle('liked', d.liked);
    btn.textContent = (d.liked ? '❤️' : '🤍') + ' ' + d.likes_count;
  }
}
window.toggleLike = toggleLike;

async function toggleFollow(userId, btn) {
  const d = await api(`/api/social/follow/${userId}`, 'POST');
  if (d.error) return showN('❌ ' + d.error, 'error');
  btn.classList.toggle('following', d.following);
  btn.textContent = d.following ? '✅' : '➕';
  showN(d.following ? '✅ Seguito!' : '➖ Smesso di seguire', 'success');
}
window.toggleFollow = toggleFollow;

async function toggleComments(postId) {
  const el = document.getElementById(`comm_${postId}`);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    const d = await api(`/api/social/posts/${postId}/comments`);
    if (d.error) return;
    el.innerHTML = `
      ${d.map(c => `
        <div class="comment-item">
          <span class="comment-author">${c.author_name}:</span>
          <span class="comment-text">${escHtml(c.content)}</span>
          <span class="comment-time">${timeAgo(new Date(c.created_at))}</span>
          ${c.author_id === myProfile?.id
            ? `<button class="btn-icon danger-btn" onclick="deleteComment(${postId},${c.id})">✕</button>`
            : ''}
        </div>`).join('')}
      <div class="comment-form">
        <input id="ci_${postId}" class="input-sm"
          placeholder="Aggiungi un commento..."
          onkeydown="if(event.key==='Enter'){addComment(${postId});event.preventDefault();}">
        <button class="btn-sm" onclick="addComment(${postId})">💬</button>
      </div>`;
  } else {
    el.style.display = 'none';
  }
}
window.toggleComments = toggleComments;

async function addComment(postId) {
  const el      = document.getElementById(`ci_${postId}`);
  const content = el?.value?.trim();
  if (!content) return;
  const d = await api(`/api/social/posts/${postId}/comments`, 'POST', { content });
  if (d.error) return showN('❌ ' + d.error, 'error');
  el.value = '';
  const cb = document.querySelector(`#post_${postId} .btn-comment`);
  if (cb) cb.textContent = '💬 ' + (d.comments_count || '');
  // ricarica commenti
  document.getElementById(`comm_${postId}`).style.display = 'none';
  await toggleComments(postId);
}
window.addComment = addComment;

async function deleteComment(postId, commentId) {
  const d = await api(`/api/social/comments/${commentId}`, 'DELETE');
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('🗑️ Commento eliminato', 'success');
  document.getElementById(`comm_${postId}`).style.display = 'none';
  await toggleComments(postId);
}
window.deleteComment = deleteComment;

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
async function loadShop() {
  const [items, profile] = await Promise.all([
    api('/api/shop'),
    api('/api/profile')
  ]);
  if (items.error || profile.error) return;

  allShopItems = items;
  ownedItems   = profile.owned_items || [];

  const shopPts = document.getElementById('shopPoints');
  if (shopPts) shopPts.textContent = (profile.points || 0) + ' ⭐';

  const cats = [...new Set(items.map(i => i.category))];
  const el   = document.getElementById('shopGrid');
  if (!el) return;

  const catLabels = {
    hair:'💇 Capelli', eyes:'👀 Occhi',
    mouth:'👄 Bocca',  color:'🎨 Colore', skin:'👤 Pelle'
  };

  el.innerHTML = cats.map(cat => {
    const catItems = items.filter(i => i.category === cat);
    return `
      <div class="shop-cat">
        <h3 class="shop-cat-title">${catLabels[cat] || cat}</h3>
        <div class="shop-items-grid">
          ${catItems.map(item => {
            const owned = ownedItems.includes(item.id);
            return `
              <div class="shop-item ${owned ? 'owned' : ''} ${item.is_rare ? 'rare' : ''}"
                onclick="openShopPreview(${item.id})">
                <div class="shop-item-emoji">${item.emoji}</div>
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-cost">
                  ${owned
                    ? '<span class="owned-badge">✅ Posseduto</span>'
                    : `<span class="pts-badge">⭐ ${item.cost}</span>`}
                </div>
                ${item.is_rare ? '<div class="rare-badge">✨ Raro</div>' : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function openShopPreview(itemId) {
  const item  = allShopItems.find(i => i.id === itemId);
  if (!item) return;
  const owned = ownedItems.includes(item.id);
  const el    = document.getElementById('shopPreview');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `
    <div class="shop-preview-box">
      <button class="preview-close" onclick="closeShopPreview()">✕</button>
      <div class="preview-emoji">${item.emoji}</div>
      <div class="preview-name">${item.name}</div>
      <div class="preview-desc">${item.description || ''}</div>
      <div class="preview-cat">Categoria: <b>${item.category}</b></div>
      ${item.is_rare ? '<div class="preview-rare">✨ Oggetto Raro</div>' : ''}
      <div class="preview-cost">⭐ ${item.cost} punti</div>
      ${owned
        ? '<div class="preview-owned">✅ Già posseduto</div>'
        : `<button class="btn-buy" onclick="buyItem(${item.id})">🛒 Acquista</button>`}
    </div>`;
}
window.openShopPreview = openShopPreview;

function closeShopPreview() {
  const el = document.getElementById('shopPreview');
  if (el) el.style.display = 'none';
}
window.closeShopPreview = closeShopPreview;

async function buyItem(itemId) {
  const item = allShopItems.find(i => i.id === itemId);
  if (!item) return;
  showConfirm('Acquisto', `Acquistare "${item.name}" per ${item.cost} punti?`, async () => {
    const d = await api('/api/shop/buy', 'POST', { item_id: itemId });
    if (d.error) return showN('❌ ' + d.error, 'error');
    showN('🛍️ Acquistato! ' + item.name, 'success');
    closeShopPreview();
    await loadShop();
  }, '🛒');
}
window.buyItem = buyItem;

// ══════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════
function getLevel(pts) {
  if (pts < 100)   return '🌱 Seme';
  if (pts < 300)   return '🌿 Germoglio';
  if (pts < 700)   return '🌳 Albero';
  if (pts < 1500)  return '🌲 Foresta';
  if (pts < 3000)  return '⚡ Fulmine Verde';
  if (pts < 6000)  return '🔥 Fiamma Eco';
  if (pts < 10000) return '💎 Diamante Verde';
  return '👑 Eco Leggenda';
}
window.getLevel = getLevel;

async function loadProfile() {
  const [profile, badges] = await Promise.all([
    api('/api/profile'),
    api('/api/badges')
  ]);
  if (profile.error) return;

  myProfile = profile;
  syncMiiState(profile);

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('profPoints', profile.points || 0);
  set('profCo2',    parseFloat(profile.co2_saved || 0).toFixed(1));
  set('profActs',   profile.total_activities || 0);
  set('profLevel',  getLevel(profile.points || 0));

  // fill edit form
  const name = document.getElementById('editName');
  const user = document.getElementById('editUsername');
  const bio  = document.getElementById('editBio');
  if (name) name.value = profile.name     || '';
  if (user) user.value = profile.username || '';
  if (bio)  bio.value  = profile.bio      || '';

  // XP bar
  const pts   = profile.points || 0;
  const thres = [0,100,300,700,1500,3000,6000,10000];
  const lvIdx = thres.findIndex(t => pts < t) - 1;
  const curr  = thres[Math.max(lvIdx, 0)];
  const next  = thres[Math.min(lvIdx + 1, thres.length - 1)];
  const pct   = next > curr ? Math.round(((pts - curr) / (next - curr)) * 100) : 100;
  const xpBar = document.getElementById('xpBar');
  const xpTxt = document.getElementById('xpText');
  if (xpBar) xpBar.style.width = pct + '%';
  if (xpTxt) xpTxt.textContent = `${pts} / ${next} XP`;

  drawMii(miiState, 'miiCanvas', 120);
  drawMii(miiState, 'sbAvatarCanvas', 36);

  // mark owned/locked in builder
  const owned = profile.owned_items || [];
  ownedItems  = owned;
  document.querySelectorAll('.mii-opt-btn').forEach(o => {
    o.classList.remove('active', 'sel', 'locked');
    const iid = parseInt(o.dataset.itemId);
    if (iid && !owned.includes(iid)) o.classList.add('locked');
    if (miiState[o.dataset.cat] === o.dataset.val) o.classList.add('active','sel');
  });

  // badges
  const bEl = document.getElementById('badgeList');
  if (bEl && !badges.error) {
    bEl.innerHTML = badges.map(b => `
      <div class="badge-item ${b.unlocked ? 'unlocked' : 'locked'}"
        title="${b.name}: ${b.desc}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
        ${!b.unlocked ? '<div class="badge-lock">🔒</div>' : ''}
      </div>`).join('');
  }
}

async function saveAvatar() {
  const btn = document.getElementById('saveAvatarBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  const d = await api('/api/profile/avatar', 'PUT', {
    color: miiState.color,
    skin:  miiState.skin,
    eyes:  miiState.eyes,
    mouth: miiState.mouth,
    hair:  miiState.hair
  });
  if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salva Avatar'; }
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('✅ Avatar salvato!', 'success');
  if (myProfile) updateSidebar({ ...myProfile, ...miiState });
}
window.saveAvatar = saveAvatar;

async function saveProfile(e) {
  e.preventDefault();
  const name     = document.getElementById('editName')?.value?.trim();
  const username = document.getElementById('editUsername')?.value?.trim();
  const bio      = document.getElementById('editBio')?.value?.trim() || '';
  if (!name || !username) return showN('❌ Nome e username obbligatori', 'error');
  const d = await api('/api/profile', 'PUT', { name, username, bio });
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('✅ Profilo aggiornato!', 'success');
  myProfile = { ...myProfile, name, username, bio };
  updateSidebar(myProfile);
}
window.saveProfile = saveProfile;

async function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('pwdCurrent')?.value;
  const newPwd  = document.getElementById('pwdNew')?.value;
  const confirm = document.getElementById('pwdConfirm')?.value;
  if (newPwd !== confirm) return showN('❌ Le password non coincidono', 'error');
  if (!checkPwdStrength(newPwd)) return showN('❌ Password troppo debole', 'error');
  const d = await api('/api/profile/password', 'PUT', {
    current_password: current,
    new_password:     newPwd
  });
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('🔐 Password aggiornata!', 'success');
  document.getElementById('pwdForm')?.reset();
}
window.changePassword = changePassword;

// ══════════════════════════════════════════
//   NOTIFICHE
// ══════════════════════════════════════════
async function loadNotifCount() {
  const d  = await api('/api/notifications/count');
  const el = document.getElementById('notifBadge');
  if (!el || d.error) return;
  el.textContent   = d.count || '';
  el.style.display = d.count > 0 ? 'inline-flex' : 'none';

  const cnt = document.getElementById('notifCount');
  if (cnt) {
    cnt.textContent   = d.count || '';
    cnt.style.display = d.count > 0 ? 'flex' : 'none';
  }
}

async function loadNotifiche() {
  const data = await api('/api/notifications');
  const el   = document.getElementById('notifList');
  if (!el || data.error) return;

  if (!data.length) {
    el.innerHTML = '<div class="empty"><div class="ei">🔔</div><p>Nessuna notifica.</p></div>';
    return;
  }

  el.innerHTML = data.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markRead(${n.id},this)">
      <div class="notif-icon">${n.icon || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${timeAgo(new Date(n.created_at))}</div>
      </div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`).join('');

  api('/api/notifications/read-all', 'POST');
  loadNotifCount();
}

async function markRead(id, el) {
  await api(`/api/notifications/${id}/read`, 'POST');
  el?.classList.remove('unread');
  el?.querySelector('.notif-dot')?.remove();
  loadNotifCount();
}
window.markRead = markRead;

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdmin() {
  if (!myProfile?.is_admin) {
    const el = document.getElementById('admin');
    if (el) el.innerHTML = '<div class="empty"><div class="ei">🚫</div><p>Accesso negato.</p></div>';
    return;
  }

  const [users, stats, activities] = await Promise.all([
    api('/api/admin/users'),
    api('/api/admin/stats'),
    api('/api/admin/activities')
  ]);

  const sEl = document.getElementById('adminStats');
  if (sEl && !stats.error) {
    sEl.innerHTML = `
      <div class="admin-stat-card">
        <div class="asc-val">${stats.total_users || 0}</div>
        <div class="asc-label">👤 Utenti</div>
      </div>
      <div class="admin-stat-card">
        <div class="asc-val">${stats.total_activities || 0}</div>
        <div class="asc-label">🌱 Attività</div>
      </div>
      <div class="admin-stat-card">
        <div class="asc-val">${parseFloat(stats.total_co2 || 0).toFixed(1)}</div>
        <div class="asc-label">☁️ kg CO₂</div>
      </div>
      <div class="admin-stat-card">
        <div class="asc-val">${stats.total_posts || 0}</div>
        <div class="asc-label">💬 Post</div>
      </div>`;
  }

  const uEl = document.getElementById('adminUsers');
  if (uEl && !users.error) {
    uEl.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Utente</th><th>Email</th><th>Punti</th>
            <th>CO₂</th><th>Ruolo</th><th>Verif.</th><th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><b>${u.name}</b><br><span style="color:var(--muted);font-size:12px">@${u.username||''}</span></td>
              <td>${u.email}</td>
              <td>⭐ ${u.points || 0}</td>
              <td>🌱 ${parseFloat(u.co2_saved || 0).toFixed(1)} kg</td>
              <td>${u.is_admin
                ? '<span class="pill pill-gold">👑 Admin</span>'
                : '<span class="pill pill-gray">👤 User</span>'}</td>
              <td>${u.verified
                ? '<span class="pill pill-green">✅</span>'
                : '<span class="pill pill-red">❌</span>'}</td>
              <td class="admin-actions">
                <button class="btn-sm"
                  onclick="adminEditUser(${u.id},'${u.name}','${u.username||''}',${u.points||0},${u.is_admin?1:0})">
                  ✏️
                </button>
                <button class="btn-sm btn-danger"
                  onclick="adminDeleteUser(${u.id},'${u.name}')">
                  🗑️
                </button>
                ${!u.verified
                  ? `<button class="btn-sm btn-green" onclick="adminVerifyUser(${u.id})">📧</button>`
                  : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  const aEl = document.getElementById('adminActivities');
  if (aEl && !activities.error) {
    aEl.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Utente</th><th>Tipo</th><th>Km/Ore</th>
            <th>CO₂</th><th>Punti</th><th>Data</th><th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          ${activities.map(a => `
            <tr>
              <td>${a.user_name || '?'}</td>
              <td>${a.type}</td>
              <td>${a.km > 0 ? a.km + ' km' : ''}${a.hours > 0 ? a.hours + 'h' : ''}</td>
              <td>-${a.co2_saved} kg</td>
              <td>+${a.points}</td>
              <td>${new Date(a.date).toLocaleDateString('it-IT')}</td>
              <td>
                <button class="btn-sm btn-danger"
                  onclick="adminDeleteActivity(${a.id})">🗑️</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
}

function adminEditUser(id, name, username, points, isAdmin) {
  showConfirm('Modifica Utente', `Modificare ${name}?`, () => {
    const newName  = prompt('Nome:', name)        || name;
    const newUser  = prompt('Username:', username) || username;
    const newPts   = parseInt(prompt('Punti:', points) || points, 10);
    const newAdmin = confirm('Ruolo Admin?');
    api(`/api/admin/users/${id}`, 'PUT', {
      name: newName, username: newUser, points: newPts, is_admin: newAdmin
    }).then(d => {
      if (d.error) return showN('❌ ' + d.error, 'error');
      showN('✅ Utente aggiornato!', 'success');
      loadAdmin();
    });
  }, '✏️');
}
window.adminEditUser = adminEditUser;

function adminDeleteUser(id, name) {
  showConfirm('Elimina Utente', `Eliminare definitivamente "${name}"?`, async () => {
    const d = await api(`/api/admin/users/${id}`, 'DELETE');
    if (d.error) return showN('❌ ' + d.error, 'error');
    showN('🗑️ Utente eliminato', 'success');
    loadAdmin();
  }, '🗑️');
}
window.adminDeleteUser = adminDeleteUser;

async function adminVerifyUser(id) {
  const d = await api(`/api/admin/users/${id}/verify`, 'POST');
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('✅ Utente verificato!', 'success');
  loadAdmin();
}
window.adminVerifyUser = adminVerifyUser;

function adminDeleteActivity(id) {
  showConfirm('Elimina Attività', 'Eliminare questa attività?', async () => {
    const d = await api(`/api/admin/activities/${id}`, 'DELETE');
    if (d.error) return showN('❌ ' + d.error, 'error');
    showN('🗑️ Attività eliminata', 'success');
    loadAdmin();
  }, '🗑️');
}
window.adminDeleteActivity = adminDeleteActivity;

// ══════════════════════════════════════════
//   MOBILE NAV
// ══════════════════════════════════════════
function toggleMobNav() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const isOpen   = sidebar?.classList.toggle('open');
  if (overlay) overlay.style.display = isOpen ? 'block' : 'none';
}
window.toggleMobNav = toggleMobNav;

// ══════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });

  // bind forms (già gestiti via onsubmit nell'HTML, ma doppia sicurezza)
  const binds = [
    ['loginForm',     doLogin],
    ['registerForm',  doRegister],
    ['actForm',       logActivity],
    ['postForm',      createPost],
    ['challengeForm', createChallenge],
    ['profileForm',   saveProfile],
    ['pwdForm',       changePassword],
    ['forgotForm',    doForgotPassword],
    ['resetForm',     doResetPassword],
  ];
  binds.forEach(([id, fn]) => {
    document.getElementById(id)?.addEventListener('submit', fn);
  });

  document.getElementById('sidebarOverlay')
    ?.addEventListener('click', toggleMobNav);

  // check token salvato
  if (token) {
    const d = await api('/api/profile');
    if (!d.error) {
      myProfile = d;
      syncMiiState(d);
      document.getElementById('authWrap').style.display = 'none';
      document.getElementById('app').style.display      = 'flex';
      updateSidebar(d);
      await loadDashboard();
      loadNotifCount();
      setInterval(loadNotifCount, 30000);
      if (window.innerWidth <= 768)
        document.getElementById('mobNav').style.display = 'flex';
    } else {
      token = null;
      localStorage.removeItem('ecotoken');
    }
  }

  // reset-password via URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('token') && params.get('action') === 'reset') {
    switchTab('reset');
    return;
  }

  switchTab('login');
});
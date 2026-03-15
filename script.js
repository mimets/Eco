'use strict';

// ══════════════════════════════════════════
//   GLOBALS
// ══════════════════════════════════════════
let token = localStorage.getItem('ecotoken') || null;
let myProfile = null;
let mapInstance = null;
let mapInitialized = false;
let routeLayer = null;
let confirmCb = null;
let allShopItems = [];
let ownedItems = [];

let miiState = {
  color: '#10b981',
  skin: '#fde68a',
  eyes: 'normal',
  mouth: 'smile',
  hair: 'none'
};

// ══════════════════════════════════════════
//   UTILITY
// ══════════════════════════════════════════
function showN(msg, type = 'success') {
  const el = document.getElementById('notifToast');
  if (!el) return;
  el.textContent = msg;
  el.className = `notification-toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

function showConfirm(title, msg, cb, icon = '❓') {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmModal').style.display = 'flex';
  confirmCb = cb;
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCb = null;
}

window.confirmYes = function() {
  closeConfirm();
  if (confirmCb) {
    confirmCb();
    confirmCb = null;
  }
};

window.confirmNo = closeConfirm;

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
//   PASSWORD STRENGTH
// ══════════════════════════════════════════
function checkPwdStrength(pwd) {
  const has8 = pwd.length >= 8;
  const hasUp = /[A-Z]/.test(pwd);
  const hasNum = /[0-9]/.test(pwd);
  const hasSym = /[^a-zA-Z0-9]/.test(pwd);
  
  const setStrength = (id, ok) => {
    const el = document.getElementById(id);
    if (el) {
      if (ok) {
        el.classList.add('valid');
        el.style.color = '#10b981';
      } else {
        el.classList.remove('valid');
        el.style.color = '#6b7280';
      }
    }
  };
  
  setStrength('strengthLength', has8);
  setStrength('strengthUpper', hasUp);
  setStrength('strengthNumber', hasNum);
  setStrength('strengthSymbol', hasSym);
  
  setStrength('resetStrengthLength', has8);
  setStrength('resetStrengthUpper', hasUp);
  setStrength('resetStrengthNumber', hasNum);
  setStrength('resetStrengthSymbol', hasSym);
  
  return has8 && hasUp && hasNum && hasSym;
}
window.checkPwdStrength = checkPwdStrength;

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
    if (body) opts.body = JSON.stringify(body);
    
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    
    if (r.status === 401) {
      token = null;
      localStorage.removeItem('ecotoken');
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display = 'none';
    }
    return d;
  } catch (err) {
    console.error('API error:', err);
    return { error: 'Errore di connessione' };
  }
}

// ══════════════════════════════════════════
//   TAB NAVIGATION
// ══════════════════════════════════════════
function switchTab(tab) {
  // Nascondi tutti i form di auth
  const forms = ['loginForm', 'registerForm', 'forgotForm', 'resetForm'];
  forms.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  // Mostra il form corretto
  if (tab === 'login') document.getElementById('loginForm').style.display = 'flex';
  if (tab === 'register') document.getElementById('registerForm').style.display = 'flex';
  if (tab === 'forgot') document.getElementById('forgotForm').style.display = 'flex';
  if (tab === 'reset') document.getElementById('resetForm').style.display = 'flex';
  
  // Aggiorna tabs
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(tab));
  });
}
window.switchTab = switchTab;

function showSection(section) {
  // Nascondi tutte le sezioni
  document.querySelectorAll('.tab-pane').forEach(s => s.classList.remove('active'));
  
  // Mostra la sezione richiesta
  const sec = document.getElementById(section);
  if (sec) sec.classList.add('active');
  
  // Aggiorna nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    if (n.getAttribute('onclick')?.includes(section)) {
      n.classList.add('active');
    }
  });
  
  // Carica dati in base alla sezione
  if (section === 'dashboard') loadDashboard();
  if (section === 'activities') loadActivities();
  if (section === 'challenges') loadChallenges();
  if (section === 'leaderboard') loadLeaderboard();
  if (section === 'social') loadSocial();
  if (section === 'shop') loadShop();
  if (section === 'profile') loadProfile();
  if (section === 'notifiche') loadNotifications();
  if (section === 'admin' && myProfile?.is_admin) loadAdmin();
}
window.showSection = showSection;

// ══════════════════════════════════════════
//   LOGIN
// ══════════════════════════════════════════
async function doLogin(e) {
  e.preventDefault();
  
  const identifier = document.getElementById('loginIdentifier')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  
  if (!identifier || !password) {
    showN('Inserisci email/username e password', 'error');
    return;
  }
  
  const btn = document.getElementById('loginBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';
  }
  
  const d = await api('/api/login', 'POST', { identifier, password });
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Accedi</span>';
  }
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  token = d.token;
  localStorage.setItem('ecotoken', token);
  myProfile = d.user;
  
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  
  updateSidebar(d.user);
  await loadDashboard();
  loadNotifCount();
  
  // Mostra tutorial se primo login
  if (!d.user.tutorial_done) {
    setTimeout(showTutorial, 500);
  }
}
window.doLogin = doLogin;

// ══════════════════════════════════════════
//   REGISTER
// ══════════════════════════════════════════
async function doRegister(e) {
  e.preventDefault();
  
  const name = document.getElementById('registerName')?.value?.trim();
  const username = document.getElementById('registerUsername')?.value?.trim();
  const email = document.getElementById('registerEmail')?.value?.trim();
  const password = document.getElementById('registerPassword')?.value;
  
  if (!name || !username || !email || !password) {
    showN('Tutti i campi sono obbligatori', 'error');
    return;
  }
  
  if (!checkPwdStrength(password)) {
    showN('Password troppo debole', 'error');
    return;
  }
  
  const btn = document.getElementById('registerBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrazione...';
  }
  
  const d = await api('/api/register', 'POST', { name, username, email, password });
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i><span>Registrati</span>';
  }
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('✅ Registrazione completata! Ora puoi accedere.', 'success');
  switchTab('login');
}
window.doRegister = doRegister;

// ══════════════════════════════════════════
//   FORGOT PASSWORD
// ══════════════════════════════════════════
async function doForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail')?.value?.trim();
  
  if (!email) {
    showN('Inserisci la tua email', 'error');
    return;
  }
  
  const d = await api('/api/forgot-password', 'POST', { email });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('📧 Email inviata! Controlla la tua casella', 'success');
  setTimeout(() => switchTab('login'), 2000);
}
window.doForgotPassword = doForgotPassword;

// ══════════════════════════════════════════
//   RESET PASSWORD
// ══════════════════════════════════════════
async function doResetPassword(e) {
  e.preventDefault();
  
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('token');
  const newPassword = document.getElementById('resetPassword')?.value;
  
  if (!resetToken) {
    showN('Token non valido', 'error');
    return;
  }
  
  if (!newPassword) {
    showN('Inserisci la nuova password', 'error');
    return;
  }
  
  if (!checkPwdStrength(newPassword)) {
    showN('Password troppo debole', 'error');
    return;
  }
  
  const d = await api('/api/reset-password', 'POST', { 
    token: resetToken, 
    new_password: newPassword 
  });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('✅ Password resettata! Ora puoi accedere', 'success');
  setTimeout(() => switchTab('login'), 2000);
}
window.doResetPassword = doResetPassword;

// ══════════════════════════════════════════
//   LOGOUT
// ══════════════════════════════════════════
function logout() {
  showConfirm('Logout', 'Sei sicuro di voler uscire?', () => {
    token = null;
    myProfile = null;
    localStorage.removeItem('ecotoken');
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
    switchTab('login');
  }, '👋');
}
window.logout = logout;

// ══════════════════════════════════════════
//   SIDEBAR UPDATE
// ══════════════════════════════════════════
function updateSidebar(u) {
  document.getElementById('sidebarName').textContent = u.name || u.username || 'Utente';
  document.getElementById('sidebarEmail').textContent = u.email || '';
  document.getElementById('sidebarPoints').textContent = u.points || 0;
  document.getElementById('sidebarCo2').textContent = (u.co2_saved || 0).toFixed(1);
  
  document.getElementById('topbarCo2').textContent = (u.co2_saved || 0).toFixed(1) + ' kg';
  document.getElementById('topbarPoints').textContent = (u.points || 0) + ' pt';
  
  if (u.is_admin) {
    document.getElementById('adminNavItem').style.display = 'flex';
  }
  
  syncMiiState(u);
  drawMii(miiState, 'sidebarAvatar', 40);
}

function syncMiiState(u) {
  if (!u) return;
  miiState.color = u.avatar_color || '#10b981';
  miiState.skin = u.avatar_skin || '#fde68a';
  miiState.eyes = u.avatar_eyes || 'normal';
  miiState.mouth = u.avatar_mouth || 'smile';
  miiState.hair = u.avatar_hair || 'none';
}

// ══════════════════════════════════════════
//   MII DRAW
// ══════════════════════════════════════════
function drawMii(state, canvasId, size = 120) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  
  ctx.clearRect(0, 0, size, size);
  
  // Sfondo
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = state.color || '#10b981';
  ctx.fill();
  
  // Testa
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = state.skin || '#fde68a';
  ctx.fill();
  
  // Occhi
  const eyeY = cy - r * 0.1;
  const eyeXOffset = r * 0.2;
  const eyeSize = r * 0.12;
  
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(cx - eyeXOffset, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeXOffset, eyeY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  
  // Bocca
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.2, r * 0.15, 0, Math.PI);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = size * 0.02;
  ctx.stroke();
}
window.drawMii = drawMii;

// ══════════════════════════════════════════
//   AVATAR BUILDER
// ══════════════════════════════════════════
function pickColor(color, el) {
  miiState.color = color;
  document.querySelectorAll('#bgColors .color-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200);
  drawMii(miiState, 'sidebarAvatar', 40);
}
window.pickColor = pickColor;

function pickSkin(color, el) {
  miiState.skin = color;
  document.querySelectorAll('#skinColors .color-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200);
  drawMii(miiState, 'sidebarAvatar', 40);
}
window.pickSkin = pickSkin;

function pickMii(cat, val, el) {
  miiState[cat] = val;
  document.querySelectorAll(`[onclick*="pickMii('${cat}'"]`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200);
  drawMii(miiState, 'sidebarAvatar', 40);
}
window.pickMii = pickMii;

async function saveAvatar() {
  const d = await api('/api/profile/avatar', 'PUT', {
    color: miiState.color,
    skin: miiState.skin,
    eyes: miiState.eyes,
    mouth: miiState.mouth,
    hair: miiState.hair
  });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('✅ Avatar salvato!', 'success');
}
window.saveAvatar = saveAvatar;

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
let currentActivityType = null;

function selectType(type, btn) {
  currentActivityType = type;
  document.getElementById('actType').value = type;
  
  document.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const rates = {
    Bici: { t: 'k', co2: 0, pts: 5 },
    Treno: { t: 'k', co2: 0.04, pts: 2 },
    Bus: { t: 'k', co2: 0.08, pts: 1.5 },
    Carpooling: { t: 'k', co2: 0.06, pts: 3 },
    Remoto: { t: 'h', co2: 0.5, pts: 10 },
    Videocall: { t: 'h', co2: 0.1, pts: 8 }
  };
  
  const kbTypes = ['Bici', 'Treno', 'Bus', 'Carpooling'];
  const hrTypes = ['Remoto', 'Videocall'];
  
  document.getElementById('kmGroup').style.display = kbTypes.includes(type) ? 'block' : 'none';
  document.getElementById('hoursGroup').style.display = hrTypes.includes(type) ? 'block' : 'none';
  document.getElementById('mapSection').style.display = kbTypes.includes(type) ? 'block' : 'none';
  
  document.getElementById('saveActivityBtn').disabled = false;
  updPreview();
  
  if (kbTypes.includes(type) && !mapInitialized) {
    initMap();
  }
}
window.selectType = selectType;

function updPreview() {
  const rates = {
    Bici: { t: 'k', co2: 0, pts: 5 },
    Treno: { t: 'k', co2: 0.04, pts: 2 },
    Bus: { t: 'k', co2: 0.08, pts: 1.5 },
    Carpooling: { t: 'k', co2: 0.06, pts: 3 },
    Remoto: { t: 'h', co2: 0.5, pts: 10 },
    Videocall: { t: 'h', co2: 0.1, pts: 8 }
  };
  
  if (!currentActivityType) return;
  
  const rate = rates[currentActivityType];
  const km = parseFloat(document.getElementById('actKm')?.value) || 0;
  const hours = parseFloat(document.getElementById('actHours')?.value) || 0;
  const val = rate.t === 'k' ? km : hours;
  
  const co2 = (val * rate.co2).toFixed(2);
  const pts = Math.round(val * rate.pts);
  
  document.getElementById('pCO2').textContent = co2 + ' kg';
  document.getElementById('pPts').textContent = pts + ' pt';
  document.getElementById('activitySummary').style.display = 'flex';
}
window.updPreview = updPreview;

async function saveAct() {
  const rates = {
    Bici: { t: 'k', co2: 0, pts: 5 },
    Treno: { t: 'k', co2: 0.04, pts: 2 },
    Bus: { t: 'k', co2: 0.08, pts: 1.5 },
    Carpooling: { t: 'k', co2: 0.06, pts: 3 },
    Remoto: { t: 'h', co2: 0.5, pts: 10 },
    Videocall: { t: 'h', co2: 0.1, pts: 8 }
  };
  
  const type = currentActivityType;
  if (!type) {
    showN('Seleziona un tipo di attività', 'error');
    return;
  }
  
  const rate = rates[type];
  const km = parseFloat(document.getElementById('actKm')?.value) || 0;
  const hours = parseFloat(document.getElementById('actHours')?.value) || 0;
  const note = document.getElementById('actNote')?.value || '';
  const fromAddr = document.getElementById('fromAddr')?.value || '';
  const toAddr = document.getElementById('toAddr')?.value || '';
  
  if (rate.t === 'k' && km === 0) {
    showN('Inserisci la distanza', 'error');
    return;
  }
  
  if (rate.t === 'h' && hours === 0) {
    showN('Inserisci le ore', 'error');
    return;
  }
  
  const d = await api('/api/activities', 'POST', {
    type,
    km,
    hours,
    note,
    from_addr: fromAddr,
    to_addr: toAddr
  });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN(`✅ +${d.co2_saved} kg CO₂! +${d.points} punti`, 'success');
  
  // Reset form
  document.getElementById('actType').value = '';
  document.getElementById('actKm').value = '';
  document.getElementById('actHours').value = '';
  document.getElementById('actNote').value = '';
  document.getElementById('fromAddr').value = '';
  document.getElementById('toAddr').value = '';
  document.getElementById('activitySummary').style.display = 'none';
  document.getElementById('saveActivityBtn').disabled = true;
  
  document.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
  currentActivityType = null;
  
  // Aggiorna liste
  loadActivities();
  loadDashboard();
}
window.saveAct = saveAct;

async function loadActivities() {
  const acts = await api('/api/activities');
  if (acts.error) return;
  
  const container = document.getElementById('actList');
  if (!container) return;
  
  if (!acts.length) {
    container.innerHTML = '<div class="empty-state">Nessuna attività registrata</div>';
    return;
  }
  
  const icons = {
    Bici: '🚴', Treno: '🚂', Bus: '🚌',
    Carpooling: '🚗', Remoto: '🏠', Videocall: '💻'
  };
  
  container.innerHTML = acts.map(a => `
    <div class="activity-item">
      <div class="activity-item-icon">${icons[a.type] || '🌱'}</div>
      <div class="activity-item-content">
        <div class="activity-item-title">${a.type}</div>
        <div class="activity-item-meta">
          ${a.km > 0 ? a.km + ' km' : ''}
          ${a.hours > 0 ? a.hours + ' ore' : ''}
          ${a.note ? ' · ' + a.note : ''}
        </div>
      </div>
      <div class="activity-item-stats">
        <div class="activity-item-co2">-${a.co2_saved} kg</div>
        <div class="activity-item-points">+${a.points} pt</div>
      </div>
    </div>
  `).join('');
}
window.loadActivities = loadActivities;

// ══════════════════════════════════════════
//   DASHBOARD
// ══════════════════════════════════════════
async function loadDashboard() {
  const stats = await api('/api/stats');
  if (stats.error) return;
  
  document.getElementById('dashboardTotalCo2').textContent = (stats.co2_saved || 0).toFixed(1);
  document.getElementById('dashboardWeekCo2').textContent = (stats.co2_week || 0).toFixed(1);
  document.getElementById('dashboardMonthCo2').textContent = (stats.co2_month || 0).toFixed(1);
  document.getElementById('dashboardPoints').textContent = stats.points || 0;
  
  // Attività recenti
  const acts = await api('/api/activities');
  if (!acts.error && acts.length) {
    const recentActs = acts.slice(0, 3);
    const icons = { Bici: '🚴', Treno: '🚂', Bus: '🚌', Carpooling: '🚗', Remoto: '🏠', Videocall: '💻' };
    
    document.getElementById('recentActivities').innerHTML = recentActs.map(a => `
      <div class="activity-item">
        <div class="activity-item-icon">${icons[a.type] || '🌱'}</div>
        <div class="activity-item-content">
          <div class="activity-item-title">${a.type}</div>
          <div class="activity-item-meta">${new Date(a.date).toLocaleDateString('it-IT')}</div>
        </div>
        <div class="activity-item-stats">
          <div class="activity-item-co2">-${a.co2_saved} kg</div>
        </div>
      </div>
    `).join('');
  }
  
  // Grafico annuale
  const yearly = await api('/api/yearly');
  if (!yearly.error && yearly.length) {
    renderYearlyChart(yearly);
  }
}
window.loadDashboard = loadDashboard;

function renderYearlyChart(data) {
  const canvas = document.getElementById('yearlyChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const values = new Array(12).fill(0);
  
  data.forEach(d => {
    const monthIndex = parseInt(d.month_num) - 1;
    values[monthIndex] = parseFloat(d.co2) || 0;
  });
  
  const max = Math.max(...values, 1);
  const width = canvas.width;
  const height = canvas.height;
  const barWidth = (width - 60) / 12;
  
  ctx.clearRect(0, 0, width, height);
  
  values.forEach((val, i) => {
    const barHeight = (val / max) * (height - 40);
    const x = 30 + i * barWidth;
    const y = height - 20 - barHeight;
    
    ctx.fillStyle = '#10b981';
    ctx.fillRect(x, y, barWidth - 4, barHeight);
    
    ctx.fillStyle = '#4b5563';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(months[i], x + (barWidth - 4) / 2, height - 5);
  });
}

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLeaderboard() {
  const data = await api('/api/leaderboard');
  if (data.error) return;
  
  const container = document.getElementById('lbList');
  if (!container) return;
  
  container.innerHTML = data.map((u, i) => `
    <div class="leaderboard-item">
      <div class="leaderboard-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">
        ${i + 1}
      </div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${u.name}</div>
        <div class="leaderboard-username">@${u.username || ''}</div>
      </div>
      <div class="leaderboard-stats">
        <div class="leaderboard-co2">🌱 ${(u.co2_saved || 0).toFixed(1)} kg</div>
        <div class="leaderboard-points">⭐ ${u.points || 0} pt</div>
      </div>
    </div>
  `).join('');
}
window.loadLeaderboard = loadLeaderboard;

// ══════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════
async function loadProfile() {
  const profile = await api('/api/profile');
  if (profile.error) return;
  
  myProfile = profile;
  
  document.getElementById('editName').value = profile.name || '';
  document.getElementById('editUsername').value = profile.username || '';
  document.getElementById('editBio').value = profile.bio || '';
  
  document.getElementById('profPoints').textContent = profile.points || 0;
  document.getElementById('profCo2').textContent = (profile.co2_saved || 0).toFixed(1);
  document.getElementById('profActs').textContent = profile.total_activities || 0;
  
  // XP e livello
  const pts = profile.points || 0;
  const level = Math.floor(pts / 100) + 1;
  const nextLevel = level * 100;
  const progress = ((pts % 100) / 100) * 100;
  
  document.getElementById('profLevel').textContent = `Livello ${level}`;
  document.getElementById('xpText').textContent = `${pts}/${nextLevel} XP`;
  document.getElementById('xpBar').style.width = progress + '%';
  
  // Badge
  const badges = await api('/api/badges');
  if (!badges.error) {
    const container = document.getElementById('badgeList');
    container.innerHTML = badges.map(b => `
      <div class="badge-item ${b.unlocked ? 'unlocked' : 'locked'}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>
    `).join('');
  }
  
  // Avatar
  syncMiiState(profile);
  drawMii(miiState, 'miiCanvas', 200);
  drawMii(miiState, 'sidebarAvatar', 40);
}
window.loadProfile = loadProfile;

async function saveProfile() {
  const name = document.getElementById('editName')?.value?.trim();
  const username = document.getElementById('editUsername')?.value?.trim();
  const bio = document.getElementById('editBio')?.value?.trim();
  
  if (!name || !username) {
    showN('Nome e username obbligatori', 'error');
    return;
  }
  
  const d = await api('/api/profile', 'PUT', { name, username, bio });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('✅ Profilo aggiornato!', 'success');
  myProfile = { ...myProfile, name, username, bio };
  updateSidebar(myProfile);
}
window.saveProfile = saveProfile;

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
async function loadNotifications() {
  const notifs = await api('/api/notifications');
  if (notifs.error) return;
  
  const container = document.getElementById('notifList');
  if (!container) return;
  
  if (!notifs.length) {
    container.innerHTML = '<div class="empty-state">Nessuna notifica</div>';
    return;
  }
  
  container.innerHTML = notifs.map(n => `
    <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
      <div class="notification-icon">🔔</div>
      <div class="notification-content">
        <div class="notification-message">${n.message}</div>
        <div class="notification-time">${new Date(n.created_at).toLocaleString('it-IT')}</div>
      </div>
    </div>
  `).join('');
}
window.loadNotifications = loadNotifications;

async function loadNotifCount() {
  const d = await api('/api/notifications/count');
  if (d.error) return;
  
  const count = d.count || 0;
  const badge = document.getElementById('notificationsBadge');
  const topBadge = document.getElementById('topbarNotifBadge');
  
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline';
    topBadge.textContent = count;
    topBadge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
    topBadge.style.display = 'none';
  }
}
window.loadNotifCount = loadNotifCount;

async function markRead(id) {
  await api(`/api/notifications/${id}/read`, 'POST');
  loadNotifications();
  loadNotifCount();
}
window.markRead = markRead;

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
async function loadChallenges() {
  const data = await api('/api/challenges');
  if (data.error) return;
  
  const container = document.getElementById('chList');
  if (!container) return;
  
  if (!data.length) {
    container.innerHTML = '<div class="empty-state">Nessuna sfida attiva</div>';
    return;
  }
  
  container.innerHTML = data.map(c => `
    <div class="challenge-item">
      <h4>${c.title}</h4>
      <p>${c.description || ''}</p>
      <div class="challenge-meta">
        <span>🎯 ${c.co2_target} kg CO₂</span>
        <span>⭐ ${c.points_reward} pt</span>
        <span>📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>
      </div>
    </div>
  `).join('');
}
window.loadChallenges = loadChallenges;

async function createChallenge() {
  const title = document.getElementById('chTitle')?.value?.trim();
  const desc = document.getElementById('chDesc')?.value?.trim();
  const co2 = parseFloat(document.getElementById('chCo2')?.value) || 0;
  const pts = parseInt(document.getElementById('chPts')?.value) || 0;
  const date = document.getElementById('chDate')?.value;
  const isPublic = document.getElementById('chPublic')?.checked;
  
  if (!title) {
    showN('Titolo obbligatorio', 'error');
    return;
  }
  
  const d = await api('/api/challenges', 'POST', {
    title,
    description: desc,
    co2_target: co2,
    points_reward: pts,
    end_date: date,
    is_public: isPublic
  });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('🏆 Sfida creata!', 'success');
  document.getElementById('challengeForm')?.reset();
  loadChallenges();
}
window.createChallenge = createChallenge;

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
async function loadShop() {
  const items = await api('/api/shop');
  if (items.error) return;
  
  allShopItems = items;
  const profile = await api('/api/profile');
  ownedItems = profile.owned_items || [];
  
  document.getElementById('shopPoints').textContent = (profile.points || 0) + ' pt';
  
  renderShop('all');
}
window.loadShop = loadShop;

function filterShop(category) {
  document.querySelectorAll('.shop-category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(category) || category === 'all');
  });
  renderShop(category);
}
window.filterShop = filterShop;

function renderShop(category) {
  const container = document.getElementById('shopGrid');
  if (!container) return;
  
  let items = allShopItems;
  if (category !== 'all') {
    items = items.filter(i => i.category === category);
  }
  
  container.innerHTML = items.map(item => {
    const owned = ownedItems.includes(item.id);
    return `
      <div class="shop-item ${owned ? 'owned' : ''} ${item.is_rare ? 'rare' : ''}" onclick="openShopPreview(${item.id})">
        <div class="shop-item-emoji">${item.emoji}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-price">⭐ ${item.cost}</div>
        ${item.is_rare ? '<div class="shop-item-badge">✨ Raro</div>' : ''}
        ${owned ? '<div class="owned-badge">✅</div>' : ''}
      </div>
    `;
  }).join('');
}

function openShopPreview(itemId) {
  const item = allShopItems.find(i => i.id === itemId);
  if (!item) return;
  
  const owned = ownedItems.includes(item.id);
  const content = document.getElementById('shopPreviewContent');
  
  content.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">${item.emoji}</div>
      <h3>${item.name}</h3>
      <p style="margin: 1rem 0;">${item.description || ''}</p>
      <p><strong>Costo: ⭐ ${item.cost}</strong></p>
      ${item.is_rare ? '<p style="color: var(--warning-500);">✨ Oggetto raro</p>' : ''}
      ${owned ? 
        '<p style="color: var(--success-500);">✅ Già posseduto</p>' : 
        `<button class="btn btn-primary" onclick="buyItem(${item.id})">Acquista</button>`
      }
    </div>
  `;
  
  document.getElementById('shopPreviewModal').style.display = 'flex';
}
window.openShopPreview = openShopPreview;

function closeShopPreview() {
  document.getElementById('shopPreviewModal').style.display = 'none';
}
window.closeShopPreview = closeShopPreview;

async function buyItem(itemId) {
  const d = await api('/api/shop/buy', 'POST', { item_id: itemId });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('✅ Oggetto acquistato!', 'success');
  closeShopPreview();
  loadShop();
}
window.buyItem = buyItem;

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
async function loadSocial() {
  const posts = await api('/api/social/posts');
  if (posts.error) return;
  
  const feed = document.getElementById('socialFeed');
  feed.innerHTML = posts.map(p => `
    <div class="post-card">
      <div class="post-header">
        <strong>${p.author_name}</strong>
        <small>@${p.author_username}</small>
        <small>${new Date(p.created_at).toLocaleDateString('it-IT')}</small>
      </div>
      <div class="post-content">${p.content}</div>
      ${p.image_url ? `<img src="${p.image_url}" class="post-image">` : ''}
      <div class="post-actions">
        <button class="post-like ${p.liked_by_me ? 'liked' : ''}" onclick="toggleLike(${p.id})">
          ❤️ ${p.likes_count || 0}
        </button>
        <button class="post-comment" onclick="toggleComments(${p.id})">
          💬 ${p.comments_count || 0}
        </button>
      </div>
      <div id="comments-${p.id}" class="comments-section" style="display: none;"></div>
    </div>
  `).join('');
  
  const users = await api('/api/social/users');
  if (!users.error) {
    const userList = document.getElementById('userList');
    userList.innerHTML = users.map(u => `
      <div class="user-item">
        <span><strong>${u.name}</strong> @${u.username}</span>
        <button class="btn-sm ${u.following ? 'btn-secondary' : 'btn-primary'}" onclick="toggleFollow(${u.id})">
          ${u.following ? 'Seguito' : 'Segui'}
        </button>
      </div>
    `).join('');
  }
}
window.loadSocial = loadSocial;

async function createPost() {
  const content = document.getElementById('postContent')?.value?.trim();
  const image = document.getElementById('postImage')?.value?.trim();
  
  if (!content) {
    showN('Scrivi qualcosa', 'error');
    return;
  }
  
  const d = await api('/api/social/posts', 'POST', { content, image_url: image });
  
  if (d.error) {
    showN(d.error, 'error');
    return;
  }
  
  showN('📝 Post pubblicato!', 'success');
  document.getElementById('postContent').value = '';
  document.getElementById('postImage').value = '';
  loadSocial();
}
window.createPost = createPost;

async function toggleLike(postId) {
  const d = await api(`/api/social/posts/${postId}/like`, 'POST');
  if (!d.error) loadSocial();
}
window.toggleLike = toggleLike;

async function toggleFollow(userId) {
  const d = await api(`/api/social/follow/${userId}`, 'POST');
  if (!d.error) loadSocial();
}
window.toggleFollow = toggleFollow;

// ══════════════════════════════════════════
//   MAP
// ══════════════════════════════════════════
function initMap() {
  if (mapInitialized || !document.getElementById('map')) return;
  
  mapInstance = L.map('map').setView([41.9028, 12.4964], 6);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance);
  
  mapInitialized = true;
}
window.initMap = initMap;

function setMapLayer(layer) {
  if (!mapInstance) return;
  
  document.querySelectorAll('.map-layer-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`mapLayer${layer.charAt(0).toUpperCase() + layer.slice(1)}`).classList.add('active');
  
  // Cambia layer
  mapInstance.eachLayer(l => {
    if (l instanceof L.TileLayer) mapInstance.removeLayer(l);
  });
  
  if (layer === 'street') {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
  } else if (layer === 'satellite') {
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(mapInstance);
  } else if (layer === 'transport') {
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png').addTo(mapInstance);
  }
}
window.setMapLayer = setMapLayer;

function getUserLocation() {
  if (!navigator.geolocation) {
    showN('Geolocalizzazione non supportata', 'error');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      mapInstance.setView([latitude, longitude], 13);
      L.marker([latitude, longitude]).addTo(mapInstance)
        .bindPopup('La tua posizione').openPopup();
    },
    () => showN('Impossibile ottenere la posizione', 'error')
  );
}
window.getUserLocation = getUserLocation;

async function searchRoute() {
  const from = document.getElementById('fromAddr')?.value?.trim();
  const to = document.getElementById('toAddr')?.value?.trim();
  
  if (!from || !to) {
    showN('Inserisci partenza e arrivo', 'error');
    return;
  }
  
  // Geocoding con Nominatim
  const geocode = async (query) => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
    const data = await r.json();
    return data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
  };
  
  const fromCoords = await geocode(from);
  const toCoords = await geocode(to);
  
  if (!fromCoords || !toCoords) {
    showN('Indirizzo non trovato', 'error');
    return;
  }
  
  if (routeLayer) mapInstance.removeControl(routeLayer);
  
  routeLayer = L.Routing.control({
    waypoints: [
      L.latLng(fromCoords[0], fromCoords[1]),
      L.latLng(toCoords[0], toCoords[1])
    ],
    routeWhileDragging: true,
    showAlternatives: true,
    fitSelectedRoutes: true,
    lineOptions: { styles: [{ color: '#10b981', weight: 4 }] }
  }).addTo(mapInstance);
  
  routeLayer.on('routesfound', (e) => {
    const route = e.routes[0];
    const distance = route.summary.totalDistance / 1000; // km
    document.getElementById('actKm').value = distance.toFixed(1);
    updPreview();
  });
}
window.searchRoute = searchRoute;

async function getSuggestions(fieldId, query) {
  if (query.length < 3) return;
  
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
  const data = await r.json();
  
  const suggDiv = document.getElementById(fieldId + 'Sugg');
  if (!suggDiv) return;
  
  suggDiv.innerHTML = data.map(place => `
    <div class="addr-item" onclick="selectAddr('${fieldId}', '${place.display_name}')">
      📍 ${place.display_name}
    </div>
  `).join('');
}
window.getSuggestions = getSuggestions;

function selectAddr(fieldId, addr) {
  document.getElementById(fieldId).value = addr;
  document.getElementById(fieldId + 'Sugg').innerHTML = '';
}
window.selectAddr = selectAddr;

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
async function loadAdmin() {
  if (!myProfile?.is_admin) return;
  
  const stats = await api('/api/admin/stats');
  if (!stats.error) {
    document.getElementById('adminStats').innerHTML = `
      <div class="admin-stat-card">
        <div class="admin-stat-value">${stats.total_users || 0}</div>
        <div class="admin-stat-label">Utenti</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-value">${stats.total_activities || 0}</div>
        <div class="admin-stat-label">Attività</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-value">${(stats.total_co2 || 0).toFixed(1)}</div>
        <div class="admin-stat-label">kg CO₂</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-value">${stats.total_posts || 0}</div>
        <div class="admin-stat-label">Post</div>
      </div>
    `;
  }
  
  const users = await api('/api/admin/users');
  if (!users.error) {
    document.getElementById('adminTbody').innerHTML = users.map(u => `
      <tr>
        <td>${u.name} <br><small>@${u.username}</small></td>
        <td>${u.email}</td>
        <td>${u.points || 0}</td>
        <td>${(u.co2_saved || 0).toFixed(1)}</td>
        <td><span class="pill ${u.is_admin ? 'pill-admin' : u.is_banned ? 'pill-banned' : 'pill-user'}">
          ${u.is_admin ? 'Admin' : u.is_banned ? 'Bannato' : 'Utente'}
        </span></td>
        <td class="admin-actions">
          <button class="admin-btn" onclick="adminEditUser(${u.id})">✏️</button>
          <button class="admin-btn admin-btn-danger" onclick="adminDeleteUser(${u.id})">🗑️</button>
          ${u.is_banned ? 
            `<button class="admin-btn" onclick="adminUnbanUser(${u.id})">🔓</button>` :
            `<button class="admin-btn admin-btn-danger" onclick="adminBanUser(${u.id})">🔨</button>`
          }
        </td>
      </tr>
    `).join('');
  }
}
window.loadAdmin = loadAdmin;

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.style.display = 'none');
  document.getElementById(`admin${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`).style.display = 'block';
  
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
}
window.switchAdminTab = switchAdminTab;

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
let tutorialStep = 1;

function showTutorial() {
  document.getElementById('tutorialOverlay').style.display = 'flex';
  tutorialStep = 1;
  updateTutorial();
}
window.showTutorial = showTutorial;

function closeTutorial() {
  document.getElementById('tutorialOverlay').style.display = 'none';
  api('/api/tutorial/complete', 'POST');
}
window.closeTutorial = closeTutorial;

function nextTutorialStep() {
  if (tutorialStep < 5) {
    tutorialStep++;
    updateTutorial();
  } else {
    closeTutorial();
  }
}
window.nextTutorialStep = nextTutorialStep;

function prevTutorialStep() {
  if (tutorialStep > 1) {
    tutorialStep--;
    updateTutorial();
  }
}
window.prevTutorialStep = prevTutorialStep;

function updateTutorial() {
  document.querySelectorAll('.tutorial-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`[data-step="${tutorialStep}"]`).classList.add('active');
  
  document.querySelectorAll('.tutorial-dot').forEach((d, i) => {
    d.classList.toggle('active', i === tutorialStep - 1);
  });
  
  document.getElementById('tutorialPrevBtn').style.opacity = tutorialStep === 1 ? '0.5' : '1';
  document.getElementById('tutorialPrevBtn').style.pointerEvents = tutorialStep === 1 ? 'none' : 'auto';
  document.getElementById('tutorialNextBtn').textContent = tutorialStep === 5 ? 'Inizia!' : 'Avanti →';
}
window.updateTutorial = updateTutorial;

// ══════════════════════════════════════════
//   MOBILE
// ══════════════════════════════════════════
function toggleMobNav() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').style.display = 
    document.getElementById('sidebar').classList.contains('open') ? 'block' : 'none';
}
window.toggleMobNav = toggleMobNav;

// ══════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Controlla se c'è un token salvato
  if (token) {
    const profile = await api('/api/profile');
    if (!profile.error) {
      myProfile = profile;
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'flex';
      updateSidebar(profile);
      await loadDashboard();
      loadNotifCount();
      setInterval(loadNotifCount, 30000);
      
      if (!profile.tutorial_done) {
        setTimeout(showTutorial, 500);
      }
    } else {
      token = null;
      localStorage.removeItem('ecotoken');
    }
  }
  
  // Controlla reset password
  const params = new URLSearchParams(window.location.search);
  if (params.get('token') && params.get('action') === 'reset') {
    switchTab('reset');
  }
  
  switchTab('login');
});
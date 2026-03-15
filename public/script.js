'use strict';

// ═══════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════
let token       = localStorage.getItem('ecotoken') || null;
let myProfile   = null;
let mapInstance = null;
let mapInitialized = false;
let routingControl = null;
let currentActivityType = null;
let allShopItems = [];
let currentShopCategory = 'all';
let tutorialStep = 1;

window.confirmCallback = null;

let miiState = {
  color: '#16a34a',
  skin:  '#fde68a',
  eyes:  'normal',
  mouth: 'smile',
  hair:  'none'
};

const CO2_RATES = {
  'Bici':       { type: 'km',    co2: 0,    points: 5   },
  'Treno':      { type: 'km',    co2: 0.04, points: 2   },
  'Bus':        { type: 'km',    co2: 0.08, points: 1.5 },
  'Carpooling': { type: 'km',    co2: 0.06, points: 3   },
  'Remoto':     { type: 'hours', co2: 0.5,  points: 10  },
  'Videocall':  { type: 'hours', co2: 0.1,  points: 8   }
};

const ACTIVITY_ICONS = {
  'Bici': '🚴', 'Treno': '🚂', 'Bus': '🚌',
  'Carpooling': '🚗', 'Remoto': '🏠', 'Videocall': '💻'
};

const BG_COLORS = [
  '#16a34a','#22c55e','#3b82f6','#6366f1','#8b5cf6',
  '#ec4899','#ef4444','#f59e0b','#06b6d4','#14b8a6',
  '#84cc16','#f97316','#1e293b','#64748b','#ffffff'
];

const SKIN_COLORS = [
  '#fde68a','#fcd34d','#f6ad55','#ed8936',
  '#c05621','#7b341e','#fef3c7','#ffe4e6'
];

const HAIR_OPTIONS  = ['none','short','long','curly','spiky','bun'];
const EYE_OPTIONS   = ['normal','happy','sleepy','surprised','wink','cool','star','heart'];
const MOUTH_OPTIONS = ['smile','grin','open','smirk','sad','rainbow'];

// ═══════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════
function showNotification(message, type = 'success') {
  const toast = document.getElementById('notifToast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `notification-toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}
window.showNotification = showNotification;

function showConfirm(title, message, callback, icon = '❓') {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = message;
  document.body.appendChild(modal);
  modal.style.cssText = 'display:flex!important;position:fixed!important;inset:0!important;background:rgba(0,0,0,.5)!important;z-index:999999!important;align-items:center!important;justify-content:center!important;';
  window.confirmCallback = callback;
}
window.showConfirm = showConfirm;

function closeConfirm() {
  const modal = document.getElementById('confirmModal');
  modal.style.display = 'none';
  window.confirmCallback = null;
}
window.closeConfirm = closeConfirm;

window.confirmAction = function () {
  const cb = window.confirmCallback;
  closeConfirm();
  if (cb) cb();
};

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  const icon = btn.querySelector('i');
  if (icon) icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}
window.togglePassword = togglePassword;

function checkPasswordStrength(pw) {
  const ok = {
    length: pw.length >= 8,
    upper:  /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^a-zA-Z0-9]/.test(pw)
  };
  const map = {
    strengthLength: ok.length, strengthUpper: ok.upper,
    strengthNumber: ok.number, strengthSymbol: ok.symbol,
    resetStrengthLength: ok.length, resetStrengthUpper: ok.upper,
    resetStrengthNumber: ok.number, resetStrengthSymbol: ok.symbol
  };
  Object.entries(map).forEach(([id, valid]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.color = valid ? '#16a34a' : '#94a3b8';
  });
  return ok.length && ok.upper && ok.number && ok.symbol;
}
window.checkPasswordStrength = checkPasswordStrength;

async function apiRequest(endpoint, method = 'GET', body = null) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(endpoint, opts);
    const data = await res.json();
    if (res.status === 401) {
      token = null;
      localStorage.removeItem('ecotoken');
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display  = 'none';
      showNotification('Sessione scaduta, effettua di nuovo il login', 'error');
    }
    return data;
  } catch (err) {
    console.error('API error:', err);
    return { error: 'Errore di connessione' };
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'adesso';
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
function switchAuthTab(tab) {
  ['loginForm','registerForm','forgotForm','resetForm'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  const map = { login: 'loginForm', register: 'registerForm', forgot: 'forgotForm', reset: 'resetForm' };
  if (map[tab]) document.getElementById(map[tab]).style.display = 'flex';

  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active',
      (tab === 'login'    && t.textContent.toLowerCase().includes('acced')) ||
      (tab === 'register' && t.textContent.toLowerCase().includes('regist'))
    );
  });
}
window.switchAuthTab = switchAuthTab;

async function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('loginIdentifier')?.value.trim();
  const password   = document.getElementById('loginPassword')?.value;
  if (!identifier || !password) { showNotification('Inserisci email/username e password', 'error'); return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accesso...';

  const data = await apiRequest('/api/login', 'POST', { identifier, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Accedi';

  if (data.error) { showNotification(data.error, 'error'); return; }

  token     = data.token;
  myProfile = data.user;
  localStorage.setItem('ecotoken', token);

  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display  = 'flex';

  updateSidebar(data.user);
  syncMiiState(data.user);
  await loadDashboard();
  await loadNotificationCount();

  if (!data.user.tutorial_done) setTimeout(() => showTutorial(), 800);
  setInterval(loadNotificationCount, 30000);

  showNotification(`Bentornato ${data.user.name || data.user.username}! 🌱`, 'success');
}
window.handleLogin = handleLogin;

async function handleRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('registerName')?.value.trim();
  const username = document.getElementById('registerUsername')?.value.trim();
  const email    = document.getElementById('registerEmail')?.value.trim();
  const password = document.getElementById('registerPassword')?.value;

  if (!name || !username || !email || !password) {
    showNotification('Tutti i campi sono obbligatori', 'error'); return;
  }
  if (!checkPasswordStrength(password)) {
    showNotification('La password non è abbastanza sicura', 'error'); return;
  }

  const btn = document.getElementById('registerBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrazione...';

  const data = await apiRequest('/api/register', 'POST', { name, username, email, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-user-plus"></i> Registrati';

  if (data.error) { showNotification(data.error, 'error'); return; }

  showNotification('✅ Registrazione completata! Controlla la tua email.', 'success');
  switchAuthTab('login');
}
window.handleRegister = handleRegister;

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail')?.value.trim();
  if (!email) { showNotification('Inserisci la tua email', 'error'); return; }
  await apiRequest('/api/forgot-password', 'POST', { email });
  showNotification('📧 Se l\'email esiste, riceverai il link di reset a breve.', 'success');
  setTimeout(() => switchAuthTab('login'), 3000);
}
window.handleForgotPassword = handleForgotPassword;

async function handleResetPassword(e) {
  e.preventDefault();
  const params   = new URLSearchParams(window.location.search);
  const tok      = params.get('token');
  const newPw    = document.getElementById('resetPassword')?.value;
  if (!tok)  { showNotification('Token non valido', 'error'); return; }
  if (!newPw) { showNotification('Inserisci la nuova password', 'error'); return; }
  if (!checkPasswordStrength(newPw)) { showNotification('Password non abbastanza sicura', 'error'); return; }

  const data = await apiRequest('/api/reset-password', 'POST', { token: tok, new_password: newPw });
  if (data.error) { showNotification(data.error, 'error'); return; }
  showNotification('✅ Password aggiornata!', 'success');
  setTimeout(() => switchAuthTab('login'), 2000);
}
window.handleResetPassword = handleResetPassword;

function logout() {
  showConfirm('Logout', 'Sei sicuro di voler uscire?', () => {
    token = null; myProfile = null;
    localStorage.removeItem('ecotoken');
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('appContainer').style.display  = 'none';
    switchAuthTab('login');
    showNotification('Arrivederci! 👋', 'info');
  }, '👋');
}
window.logout = logout;

// ═══════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════
function updateSidebar(user) {
  document.getElementById('sidebarName').textContent   = user.name || user.username || 'Utente';
  document.getElementById('sidebarEmail').textContent  = user.email || '';
  document.getElementById('sidebarPoints').textContent = user.points || 0;
  document.getElementById('sidebarCo2').textContent    = parseFloat(user.co2_saved || 0).toFixed(1);
  document.getElementById('topbarCo2').textContent     = parseFloat(user.co2_saved || 0).toFixed(1) + ' kg';
  document.getElementById('topbarPoints').textContent  = (user.points || 0) + ' pt';

  const adminNav = document.getElementById('adminNavItem');
  if (adminNav) adminNav.style.display = user.is_admin ? 'flex' : 'none';

  drawMii(miiState, 'sidebarAvatar', 48);
  const soc = document.getElementById('socialAvatar');
  if (soc) drawMii(miiState, 'socialAvatar', 36);
}
window.updateSidebar = updateSidebar;

// ═══════════════════════════════════════════
// SECTION NAVIGATION
// ═══════════════════════════════════════════
async function showSection(section) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick')?.includes(`'${section}'`));
  });

  const target = document.getElementById(section);
  if (target) target.classList.add('active');

  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay').style.display = 'none';

  switch (section) {
    case 'dashboard':   await loadDashboard();    break;
    case 'activities':  await loadActivities(); break;
    case 'challenges':  await loadChallenges();   break;
    case 'leaderboard': await loadLeaderboard();  break;
    case 'social':      await loadSocial();        break;
    case 'shop':        await loadShop();          break;
    case 'avatar':      await loadAvatarSection(); break;
    case 'profile':     await loadProfile();       break;
    case 'notifiche':   await loadNotifications(); break;
    case 'teams':       await loadTeams(); break;
    case 'admin':       if (myProfile?.is_admin) await loadAdminPanel(); break;
  }
}
window.showSection = showSection;

function toggleMobileNav() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}
window.toggleMobileNav = toggleMobileNav;

// ═══════════════════════════════════════════
// DASHBOARD — Promise.all per velocità
// ═══════════════════════════════════════════
async function loadDashboard() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  document.getElementById('dashGreeting').textContent =
    `${greet}, ${myProfile?.name || 'utente'}! Continua così 💪`;

  // Carica tutto in parallelo
  const [stats, activities, yearly, badges] = await Promise.all([
    apiRequest('/api/stats'),
    apiRequest('/api/activities'),
    apiRequest('/api/yearly'),
    apiRequest('/api/badges'),
  ]);

  if (!stats.error) {
    document.getElementById('dashboardTotalCo2').textContent  = parseFloat(stats.co2_saved || 0).toFixed(1);
    document.getElementById('dashboardWeekCo2').textContent   = parseFloat(stats.co2_week  || 0).toFixed(1);
    document.getElementById('dashboardMonthCo2').textContent  = parseFloat(stats.co2_month || 0).toFixed(1);
    document.getElementById('dashboardPoints').textContent    = stats.points || 0;
  }

  const rc = document.getElementById('recentActivities');
  if (!activities.error && activities.length > 0) {
    rc.innerHTML = activities.slice(0, 5).map(a => `
      <div class="activity-item">
        <span class="act-icon">${ACTIVITY_ICONS[a.type] || '🌱'}</span>
        <div class="act-info">
          <strong>${escapeHtml(a.type)}</strong>
          <small>${a.km ? a.km + ' km' : ''}${a.hours ? a.hours + ' ore' : ''}${a.note ? ' · ' + escapeHtml(a.note) : ''}</small>
        </div>
        <div class="act-meta">
          <div class="act-co2">-${a.co2_saved} kg</div>
          <div class="act-pts">+${a.points} pt</div>
        </div>
      </div>
    `).join('');
  } else {
    rc.innerHTML = `<div class="empty-state"><span>🌱</span><p>Nessuna attività ancora</p></div>`;
  }

  if (!yearly.error && yearly.length > 0) renderYearlyChart(yearly);
  else renderEmptyChart();

  const rb = document.getElementById('recentBadges');
  if (!badges.error) {
    const unlocked = badges.filter(b => b.unlocked).slice(0, 4);
    rb.innerHTML = unlocked.length
      ? unlocked.map(b => `<div class="badge-item unlocked"><span>${b.icon}</span><strong>${escapeHtml(b.name)}</strong></div>`).join('')
      : `<div class="empty-state"><span>🔒</span><p>Nessun badge ancora</p></div>`;
  }
}

// ═══════════════════════════════════════════
// CHART
// ═══════════════════════════════════════════
function renderYearlyChart(data) {
  const canvas = document.getElementById('yearlyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 600;
  canvas.height = canvas.offsetHeight || 200;

  const values = new Array(12).fill(0);
  data.forEach(item => {
    const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const idx = months.indexOf(item.month);
    if (idx >= 0) values[idx] = parseFloat(item.co2) || 0;
  });

  const max = Math.max(...values, 1);
  const W = canvas.width, H = canvas.height;
  const bw = (W - 60) / 12;
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(40, H - 30); ctx.lineTo(W - 10, H - 30); ctx.stroke();

  values.forEach((v, i) => {
    const bh = (v / max) * (H - 70);
    const x  = 45 + i * bw;
    const y  = H - 35 - bh;
    const g  = ctx.createLinearGradient(0, y, 0, H - 35);
    g.addColorStop(0, '#16a34a'); g.addColorStop(1, '#86efac');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, bw - 6, bh, 4);
    } else {
      ctx.fillRect(x, y, bw - 6, bh);
    }
    ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(months[i], x + (bw - 6) / 2, H - 15);
    if (v > 0) {
      ctx.fillStyle = '#16a34a'; ctx.font = 'bold 9px Inter,sans-serif';
      ctx.fillText(v.toFixed(1), x + (bw - 6) / 2, y - 5);
    }
  });
}

function renderEmptyChart() {
  const canvas = document.getElementById('yearlyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 200;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#94a3b8'; ctx.font = '13px Inter,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Nessun dato — registra attività per vedere il grafico', canvas.width / 2, canvas.height / 2);
}

// ═══════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════
function selectActivityType(type, btn) {
  currentActivityType = type;
  document.getElementById('actType').value = type;
  document.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const rate = CO2_RATES[type];
  document.getElementById('kmGroup').style.display    = rate.type === 'km'    ? 'block' : 'none';
  document.getElementById('hoursGroup').style.display = rate.type === 'hours' ? 'block' : 'none';
  document.getElementById('saveActivityBtn').disabled = false;
  updateActivityPreview();

  // FIX MAPPA: mostra il container prima di inizializzare Leaflet
  const mapSection = document.getElementById('mapSection');
  if (rate.type === 'km') {
    mapSection.style.display = 'block';
    // requestAnimationFrame garantisce che il DOM sia visibile prima di init
    requestAnimationFrame(() => {
      if (!mapInitialized) {
        initMap();
      } else {
        mapInstance?.invalidateSize();
      }
    });
  } else {
    mapSection.style.display = 'none';
  }
}
window.selectActivityType = selectActivityType;

function updateActivityPreview() {
  if (!currentActivityType) return;
  const rate  = CO2_RATES[currentActivityType];
  const km    = parseFloat(document.getElementById('actKm')?.value)    || 0;
  const hours = parseFloat(document.getElementById('actHours')?.value) || 0;
  const value = rate.type === 'km' ? km : hours;
  const co2   = (value * rate.co2).toFixed(2);
  const pts   = Math.round(value * rate.points);
  document.getElementById('pCO2').textContent = co2 + ' kg';
  document.getElementById('pPts').textContent = pts + ' pt';
  document.getElementById('activitySummary').style.display = 'flex';
}
window.updateActivityPreview = updateActivityPreview;

async function saveActivity() {
  if (!currentActivityType) { showNotification('Seleziona un tipo di attività', 'error'); return; }
  const rate  = CO2_RATES[currentActivityType];
  const km    = parseFloat(document.getElementById('actKm')?.value)    || 0;
  const hours = parseFloat(document.getElementById('actHours')?.value) || 0;

  if (rate.type === 'km'    && km    <= 0) { showNotification('Inserisci la distanza', 'error'); return; }
  if (rate.type === 'hours' && hours <= 0) { showNotification('Inserisci le ore', 'error'); return; }

  const btn = document.getElementById('saveActivityBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

  const data = await apiRequest('/api/activities', 'POST', {
    type: currentActivityType, km, hours,
    note:      document.getElementById('actNote')?.value    || '',
    from_addr: document.getElementById('fromAddr')?.value   || '',
    to_addr:   document.getElementById('toAddr')?.value     || ''
  });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-save"></i> Salva attività';

  if (data.error) { showNotification(data.error, 'error'); return; }

  showNotification(`✅ Attività salvata! +${data.co2_saved} kg CO₂, +${data.points} pt`, 'success');

  ['actKm','actHours','actNote','fromAddr','toAddr'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('activitySummary').style.display = 'none';
  document.getElementById('saveActivityBtn').disabled = true;
  document.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
  currentActivityType = null;

  if (myProfile) {
    myProfile.points    = (myProfile.points    || 0) + data.points;
    myProfile.co2_saved = (myProfile.co2_saved || 0) + data.co2_saved;
    updateSidebar(myProfile);
  }
  await loadActivities();
}
window.saveActivity = saveActivity;

async function loadActivities() {
  const data = await apiRequest('/api/activities');
  const container = document.getElementById('actList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>🌱</span><p>Nessuna attività registrata</p></div>`;
    return;
  }
  container.innerHTML = data.map(a => `
    <div class="activity-item">
      <span class="act-icon">${ACTIVITY_ICONS[a.type] || '🌱'}</span>
      <div class="act-info">
        <strong>${escapeHtml(a.type)}</strong>
        <small>${a.km ? a.km + ' km' : ''}${a.hours ? a.hours + ' ore' : ''}${a.note ? ' · ' + escapeHtml(a.note) : ''} · ${timeAgo(a.date)}</small>
      </div>
      <div class="act-meta">
        <div class="act-co2">-${a.co2_saved} kg</div>
        <div class="act-pts">+${a.points} pt</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════
// MAP — FIX COMPLETO MAPPA BIANCA
// ═══════════════════════════════════════════
function initMap() {
  if (mapInitialized) {
    mapInstance?.invalidateSize();
    return;
  }
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') return;

  // Assicurati che il container abbia dimensioni reali prima di init
  const rect = mapEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    // Riprova dopo un breve delay se il container non è ancora visibile
    setTimeout(initMap, 100);
    return;
  }

  mapInstance = L.map('map', { zoomControl: true }).setView([41.9028, 12.4964], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(mapInstance);

  mapInitialized = true;
  // Doppio invalidateSize: uno immediato e uno dopo il rendering
  mapInstance.invalidateSize();
  setTimeout(() => mapInstance.invalidateSize(), 250);
}
window.initMap = initMap;

async function searchAddress(fieldId, query) {
  if (query.length < 3) { document.getElementById(fieldId + 'Sugg').innerHTML = ''; return; }
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
    const data = await res.json();
    const sugg = document.getElementById(fieldId + 'Sugg');
    sugg.innerHTML = data.map(p => `
      <div class="addr-item" onclick="selectAddress('${fieldId}', ${JSON.stringify(p.display_name)})">${escapeHtml(p.display_name)}</div>
    `).join('');
  } catch {}
}
window.searchAddress = searchAddress;

function selectAddress(fieldId, address) {
  document.getElementById(fieldId).value = address;
  document.getElementById(fieldId + 'Sugg').innerHTML = '';
}
window.selectAddress = selectAddress;

function getUserLocation() {
  if (!navigator.geolocation) { showNotification('Geolocalizzazione non supportata', 'error'); return; }
  showNotification('Rilevamento posizione...', 'info');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    if (mapInstance) { mapInstance.setView([lat, lon], 13); L.marker([lat, lon]).addTo(mapInstance).bindPopup('Tu sei qui').openPopup(); }
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
      .then(r => r.json())
      .then(d => { if (d.display_name) document.getElementById('fromAddr').value = d.display_name; })
      .catch(() => {});
    showNotification('Posizione rilevata!', 'success');
  }, err => {
    const msgs = { 1: 'Permesso negato', 2: 'Posizione non disponibile', 3: 'Timeout' };
    showNotification(msgs[err.code] || 'Errore geolocalizzazione', 'error');
  });
}
window.getUserLocation = getUserLocation;

async function calculateRoute() {
  const from = document.getElementById('fromAddr')?.value.trim();
  const to   = document.getElementById('toAddr')?.value.trim();
  if (!from || !to) { showNotification('Inserisci partenza e destinazione', 'error'); return; }
  showNotification('Calcolo percorso...', 'info');
  try {
    const [fRes, tRes] = await Promise.all([
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(from)}&format=json&limit=1`).then(r => r.json()),
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(to)}&format=json&limit=1`).then(r => r.json())
    ]);
    if (!fRes[0]) { showNotification('Partenza non trovata', 'error'); return; }
    if (!tRes[0]) { showNotification('Destinazione non trovata', 'error'); return; }

    if (routingControl) { mapInstance.removeControl(routingControl); routingControl = null; }

    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(parseFloat(fRes[0].lat), parseFloat(fRes[0].lon)),
        L.latLng(parseFloat(tRes[0].lat), parseFloat(tRes[0].lon))
      ],
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: true,
      lineOptions: { styles: [{ color: '#16a34a', weight: 5 }] },
      createMarker: () => null
    }).addTo(mapInstance);

    routingControl.on('routesfound', e => {
      const km = (e.routes[0].summary.totalDistance / 1000).toFixed(1);
      document.getElementById('actKm').value = km;
      updateActivityPreview();
      showNotification(`📍 Distanza: ${km} km`, 'success');
    });

    routingControl.on('routingerror', () => {
      showNotification('Percorso non trovato tra questi indirizzi', 'error');
    });
  } catch (err) {
    showNotification('Errore nel calcolo del percorso', 'error');
  }
}
window.calculateRoute = calculateRoute;

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
async function loadLeaderboard() {
  const data = await apiRequest('/api/leaderboard');
  const container = document.getElementById('lbList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>🏆</span><p>Nessun utente in classifica</p></div>`;
    return;
  }
  container.innerHTML = data.map((u, i) => {
    const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
    const medals = ['🥇','🥈','🥉'];
    return `
      <div class="leaderboard-item">
        <div class="lb-rank ${rankClass}">${medals[i] || i + 1}</div>
        <div class="lb-info">
          <strong>${escapeHtml(u.name || u.username)}</strong>
          <small>@${escapeHtml(u.username || '')}</small>
        </div>
        <div class="lb-stats">
          <span class="lb-co2">🌱 ${parseFloat(u.co2_saved || 0).toFixed(1)} kg</span>
          <span class="lb-pts">⭐ ${u.points || 0} pt</span>
        </div>
      </div>
    `;
  }).join('');
}
window.loadLeaderboard = loadLeaderboard;

// ═══════════════════════════════════════════
// CHALLENGES
// ═══════════════════════════════════════════
async function loadChallenges() {
  const data = await apiRequest('/api/challenges');
  const container = document.getElementById('chList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>🏆</span><p>Nessuna sfida attiva</p></div>`;
    return;
  }
  container.innerHTML = data.map(c => {
    const expired = c.end_date && new Date(c.end_date) < new Date();
    return `
      <div class="challenge-item">
        <div class="challenge-header">
          <span class="challenge-title">${escapeHtml(c.title)}</span>
          <span class="challenge-badge ${c.is_public ? 'public' : 'private'}">${c.is_public ? '🌍 Pubblica' : '🔒 Privata'}</span>
        </div>
        <p class="challenge-desc">${escapeHtml(c.description || 'Nessuna descrizione')}</p>
        <div class="challenge-meta">
          <span>🎯 ${c.co2_target} kg CO₂</span>
          <span>⭐ ${c.points_reward} pt</span>
          ${c.end_date ? `<span>📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>` : ''}
          ${expired ? '<span style="color:#ef4444;">⏰ Scaduta</span>' : ''}
          <span>👤 ${escapeHtml(c.creator_name || 'Anonimo')}</span>
        </div>
      </div>
    `;
  }).join('');
}
window.loadChallenges = loadChallenges;

async function createChallenge() {
  const title    = document.getElementById('chTitle')?.value.trim();
  const desc     = document.getElementById('chDesc')?.value.trim();
  const co2      = parseFloat(document.getElementById('chCo2')?.value)  || 0;
  const pts      = parseInt(document.getElementById('chPts')?.value)    || 0;
  const endDate  = document.getElementById('chDate')?.value;
  const isPublic = document.getElementById('chPublic')?.checked ?? true;

  if (!title)   { showNotification('Inserisci un titolo', 'error'); return; }
  if (co2 <= 0) { showNotification('Inserisci un target CO₂ valido', 'error'); return; }
  if (!endDate) { showNotification('Seleziona una data di scadenza', 'error'); return; }

  const data = await apiRequest('/api/challenges', 'POST', {
    title, description: desc, co2_target: co2, points_reward: pts, end_date: endDate, is_public: isPublic
  });
  if (data.error) { showNotification(data.error, 'error'); return; }

  showNotification('✅ Sfida creata!', 'success');
  ['chTitle','chDesc','chCo2','chPts','chDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('chPublic').checked = true;
  await loadChallenges();
}
window.createChallenge = createChallenge;

// ═══════════════════════════════════════════
// SOCIAL
// ═══════════════════════════════════════════
async function loadSocial() {
  await Promise.all([loadPosts(), loadUsers()]);
}

async function loadPosts() {
  const data = await apiRequest('/api/social/posts');
  const container = document.getElementById('postsList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>📭</span><p>Nessun post ancora</p></div>`;
    return;
  }
  container.innerHTML = data.map(p => {
    const canDelete = myProfile && (p.user_id === myProfile.id || myProfile.is_admin);
    return `
      <div class="post-card" id="post-${p.id}">
        <div class="post-header">
          <canvas width="36" height="36" style="border-radius:50%;" id="postAvatar${p.id}"></canvas>
          <div class="post-author">
            <strong>${escapeHtml(p.author_name || 'Utente')}</strong>
            <small>@${escapeHtml(p.author_username || '')} · ${timeAgo(p.created_at)}</small>
          </div>
        </div>
        <div class="post-body">${escapeHtml(p.content)}</div>
        ${p.image_url ? `<img class="post-image" src="${escapeHtml(p.image_url)}" alt="immagine post" onerror="this.style.display='none'">` : ''}
        <div class="post-actions">
          <button class="post-action-btn ${p.liked_by_me ? 'liked' : ''}" onclick="toggleLike(${p.id}, this)">
            <i class="fas fa-heart"></i> <span class="like-count">${p.likes_count || 0}</span>
          </button>
          <button class="post-action-btn" onclick="toggleComments(${p.id})">
            <i class="fas fa-comment"></i> <span class="comment-count">${p.comments_count || 0}</span>
          </button>
          ${canDelete ? `<button class="post-action-btn post-delete" onclick="deletePost(${p.id})"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        <div class="comments-section" id="comments-${p.id}" style="display:none;">
          <div id="commentsList-${p.id}"></div>
          <div class="comment-input-row">
            <input type="text" placeholder="Scrivi un commento..." id="commentInput-${p.id}" onkeydown="if(event.key==='Enter') addComment(${p.id})" />
            <button class="btn-sm green" onclick="addComment(${p.id})"><i class="fas fa-paper-plane"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  data.forEach(p => {
    const canvas = document.getElementById(`postAvatar${p.id}`);
    if (canvas) {
      drawMii({
        color: p.avatar_color || '#16a34a', skin: p.avatar_skin || '#fde68a',
        eyes:  p.avatar_eyes  || 'normal',  mouth: p.avatar_mouth || 'smile', hair: p.avatar_hair || 'none'
      }, `postAvatar${p.id}`, 36);
    }
  });
}

async function createPost() {
  const content = document.getElementById('postContent')?.value.trim();
  if (!content) { showNotification('Scrivi qualcosa!', 'error'); return; }
  if (content.length > 1000) { showNotification('Post troppo lungo (max 1000 caratteri)', 'error'); return; }
  const data = await apiRequest('/api/social/posts', 'POST', { content });
  if (data.error) { showNotification(data.error, 'error'); return; }
  document.getElementById('postContent').value = '';
  showNotification('✅ Post pubblicato!', 'success');
  await loadPosts();
}
window.createPost = createPost;

async function deletePost(id) {
  showConfirm('Elimina post', 'Sei sicuro di voler eliminare questo post?', async () => {
    const data = await apiRequest(`/api/social/posts/${id}`, 'DELETE');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('Post eliminato', 'success');
    await loadPosts();
  }, '🗑️');
}
window.deletePost = deletePost;

async function toggleLike(postId, btn) {
  const data = await apiRequest(`/api/social/posts/${postId}/like`, 'POST');
  if (data.error) return;
  btn.classList.toggle('liked', data.liked);
  btn.querySelector('.like-count').textContent = data.likes_count;
}
window.toggleLike = toggleLike;

async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (!section) return;
  const visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : 'block';
  if (!visible) await loadComments(postId);
}
window.toggleComments = toggleComments;

async function loadComments(postId) {
  const data = await apiRequest(`/api/social/posts/${postId}/comments`);
  const container = document.getElementById(`commentsList-${postId}`);
  if (!container) return;
  if (!data.length) { container.innerHTML = '<p style="color:#94a3b8;font-size:12px;padding:6px 0;">Nessun commento ancora</p>'; return; }
  container.innerHTML = data.map(c => `
    <div class="comment-item">
      <span class="comment-author">${escapeHtml(c.author_name)}:</span>
      <span>${escapeHtml(c.content)}</span>
      ${(myProfile && (c.author_id === myProfile.id || myProfile.is_admin))
        ? `<button class="btn-sm red" style="margin-left:auto;padding:2px 7px;" onclick="deleteComment(${c.id}, ${postId})"><i class="fas fa-times"></i></button>`
        : ''}
    </div>
  `).join('');
}

async function addComment(postId) {
  const input   = document.getElementById(`commentInput-${postId}`);
  const content = input?.value.trim();
  if (!content) return;
  const data = await apiRequest(`/api/social/posts/${postId}/comments`, 'POST', { content });
  if (data.error) { showNotification(data.error, 'error'); return; }
  input.value = '';
  await loadComments(postId);
  const cc = document.querySelector(`#post-${postId} .comment-count`);
  if (cc) cc.textContent = data.comments_count;
}
window.addComment = addComment;

async function deleteComment(commentId, postId) {
  const data = await apiRequest(`/api/social/comments/${commentId}`, 'DELETE');
  if (data.error) { showNotification(data.error, 'error'); return; }
  await loadComments(postId);
}
window.deleteComment = deleteComment;

async function loadUsers() {
  const data = await apiRequest('/api/social/users');
  const container = document.getElementById('usersList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>👥</span><p>Nessun utente</p></div>`;
    return;
  }
  container.innerHTML = data.map(u => `
    <div class="user-card">
      <canvas width="36" height="36" style="border-radius:50%;" id="userAv${u.id}"></canvas>
      <div class="user-card-info">
        <strong>${escapeHtml(u.name || u.username)}</strong>
        <small>⭐ ${u.points || 0} pt · 🌱 ${parseFloat(u.co2_saved || 0).toFixed(1)} kg</small>
      </div>
      <button class="btn-sm ${u.following ? 'red' : 'green'}" onclick="toggleFollow(${u.id}, this)">
        ${u.following ? 'Segui già' : '+ Segui'}
      </button>
    </div>
  `).join('');

  data.forEach(u => {
    drawMii({ color: u.avatar_color||'#16a34a', skin: u.avatar_skin||'#fde68a', eyes: u.avatar_eyes||'normal', mouth: u.avatar_mouth||'smile', hair: u.avatar_hair||'none' }, `userAv${u.id}`, 36);
  });
}

async function toggleFollow(userId, btn) {
  const data = await apiRequest(`/api/social/follow/${userId}`, 'POST');
  if (data.error) { showNotification(data.error, 'error'); return; }
  btn.className = `btn-sm ${data.following ? 'red' : 'green'}`;
  btn.textContent = data.following ? 'Segui già' : '+ Segui';
  showNotification(data.following ? '👥 Stai seguendo!' : 'Non segui più', data.following ? 'success' : 'info');
}
window.toggleFollow = toggleFollow;

// ═══════════════════════════════════════════
// SHOP
// ═══════════════════════════════════════════
async function loadShop() {
  const [items, profile] = await Promise.all([
    apiRequest('/api/shop'),
    apiRequest('/api/profile')
  ]);
  if (items.error) return;
  allShopItems = items;
  document.getElementById('shopPoints').textContent = profile.points || 0;
  if (profile.owned_items !== undefined) {
    myProfile = { ...myProfile, ...profile };
  }
  renderShop();
}

function filterShop(cat, btn) {
  currentShopCategory = cat;
  document.querySelectorAll('.shop-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderShop();
}
window.filterShop = filterShop;

function renderShop() {
  const container = document.getElementById('shopGrid');
  if (!container) return;
  const owned = myProfile?.owned_items || [];
  const filtered = currentShopCategory === 'all'
    ? allShopItems
    : allShopItems.filter(i => i.category === currentShopCategory);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><span>🛍️</span><p>Nessun oggetto in questa categoria</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const isOwned = owned.includes(item.id);
    return `
      <div class="shop-item ${isOwned ? 'owned' : ''} ${item.is_rare ? 'rare' : ''}" onclick="buyItem(${item.id})">
        ${item.is_rare ? '<span class="rare-badge">✨ Raro</span>' : ''}
        ${isOwned    ? '<span class="owned-badge">✅ Posseduto</span>' : ''}
        <div class="shop-item-emoji">${item.emoji || '🎁'}</div>
        <div class="shop-item-name">${escapeHtml(item.name)}</div>
        <div class="shop-item-desc">${escapeHtml(item.description || '')}</div>
        <div class="shop-item-cost ${item.cost === 0 ? 'free' : ''}">
          ${item.cost === 0 ? 'Gratis' : `⭐ ${item.cost} pt`}
        </div>
      </div>
    `;
  }).join('');
}

async function buyItem(itemId) {
  const owned = myProfile?.owned_items || [];
  if (owned.includes(itemId)) { showNotification('Hai già questo oggetto!', 'info'); return; }

  const item = allShopItems.find(i => i.id === itemId);
  if (!item) return;

  showConfirm(
    `Acquista ${item.name}`,
    `Costo: ⭐ ${item.cost} punti. Confermi?`,
    async () => {
      const data = await apiRequest('/api/shop/buy', 'POST', { item_id: itemId });
      if (data.error) { showNotification(data.error, 'error'); return; }
      showNotification(`✅ Acquistato: ${item.name}!`, 'success');
      if (myProfile) {
        myProfile.points      = data.new_points;
        myProfile.owned_items = data.owned_items;
        updateSidebar(myProfile);
      }
      document.getElementById('shopPoints').textContent = data.new_points;
      renderShop();
    }, '🛍️'
  );
}
window.buyItem = buyItem;

// ═══════════════════════════════════════════
// AVATAR
// ═══════════════════════════════════════════
function syncMiiState(user) {
  if (!user) return;
  miiState.color = user.avatar_color || '#16a34a';
  miiState.skin  = user.avatar_skin  || '#fde68a';
  miiState.eyes  = user.avatar_eyes  || 'normal';
  miiState.mouth = user.avatar_mouth || 'smile';
  miiState.hair  = user.avatar_hair  || 'none';
  drawMii(miiState, 'sidebarAvatar', 48);
  if (document.getElementById('miiCanvas')) drawMii(miiState, 'miiCanvas', 200);
}

function drawMii(state, canvasId, size = 120) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = size;
  canvas.height = size;
  const cx = size / 2, cy = size / 2;
  const hr = size * 0.33;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = state.color || '#16a34a';
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  if (state.hair === 'long') {
    ctx.beginPath();
    ctx.ellipse(cx, cy + hr * 0.6, hr * 0.75, hr * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (state.hair === 'bun') {
    ctx.beginPath();
    ctx.arc(cx, cy - hr * 1.1, hr * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, hr, 0, Math.PI * 2);
  ctx.fillStyle = state.skin || '#fde68a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#1f2937';
  if (state.hair === 'short') {
    ctx.beginPath();
    ctx.arc(cx, cy - hr * 0.5, hr * 0.85, Math.PI, 0);
    ctx.fill();
  } else if (state.hair === 'curly') {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * hr * 0.35, cy - hr * 0.85, hr * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (state.hair === 'spiky') {
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * hr * 0.22, cy - hr * 0.7);
      ctx.lineTo(cx + i * hr * 0.22 - hr * 0.12, cy - hr * 1.15);
      ctx.lineTo(cx + i * hr * 0.22 + hr * 0.12, cy - hr * 1.15);
      ctx.closePath();
      ctx.fill();
    }
  }

  const eyeY = cy - hr * 0.1;
  const eyeX = hr * 0.28;
  const eyeS = hr * 0.11;
  ctx.fillStyle = '#1f2937';

  if (state.eyes === 'happy') {
    [-1, 1].forEach(dir => { ctx.beginPath(); ctx.arc(cx + dir * eyeX, eyeY, eyeS, Math.PI, 0); ctx.fill(); });
  } else if (state.eyes === 'sleepy') {
    [-1, 1].forEach(dir => { ctx.beginPath(); ctx.arc(cx + dir * eyeX, eyeY, eyeS, 0, Math.PI); ctx.fill(); });
  } else if (state.eyes === 'surprised') {
    [-1, 1].forEach(dir => { ctx.beginPath(); ctx.arc(cx + dir * eyeX, eyeY, eyeS * 1.4, 0, Math.PI * 2); ctx.fill(); });
  } else if (state.eyes === 'wink') {
    ctx.beginPath(); ctx.arc(cx - eyeX, eyeY, eyeS, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = size * 0.025;
    ctx.beginPath(); ctx.moveTo(cx + eyeX - eyeS, eyeY); ctx.lineTo(cx + eyeX + eyeS, eyeY); ctx.stroke();
  } else if (state.eyes === 'cool') {
    [-1, 1].forEach(dir => { ctx.beginPath(); ctx.ellipse(cx + dir * eyeX, eyeY, eyeS * 1.5, eyeS * 0.7, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#64748b';
    ctx.fillRect(cx - eyeX * 1.6, eyeY - eyeS * 1.2, eyeX * 3.2, eyeS * 0.6);
  } else if (state.eyes === 'star') {
    ctx.fillStyle = '#f59e0b';
    [-1, 1].forEach(dir => drawStar(ctx, cx + dir * eyeX, eyeY, 5, eyeS * 1.2, eyeS * 0.5));
  } else if (state.eyes === 'heart') {
    ctx.fillStyle = '#ef4444';
    [-1, 1].forEach(dir => drawHeart(ctx, cx + dir * eyeX, eyeY, eyeS * 1.1));
  } else {
    [-1, 1].forEach(dir => {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.arc(cx + dir * eyeX, eyeY, eyeS, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx + dir * eyeX - eyeS * 0.3, eyeY - eyeS * 0.3, eyeS * 0.3, 0, Math.PI * 2); ctx.fill();
    });
  }

  const mouthY = cy + hr * 0.35;
  const mouthR = hr * 0.22;
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth   = size * 0.025;

  if (state.mouth === 'grin') {
    ctx.beginPath(); ctx.arc(cx, mouthY, mouthR, 0, Math.PI);
    ctx.fillStyle = '#ef4444'; ctx.fill(); ctx.strokeStyle = '#1f2937'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - mouthR + 2, mouthY - 2, mouthR * 2 - 4, 6);
  } else if (state.mouth === 'open') {
    ctx.beginPath(); ctx.ellipse(cx, mouthY, mouthR * 0.7, mouthR * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; ctx.fill(); ctx.stroke();
  } else if (state.mouth === 'smirk') {
    ctx.beginPath();
    ctx.moveTo(cx - mouthR * 0.3, mouthY);
    ctx.quadraticCurveTo(cx + mouthR * 0.3, mouthY - 4, cx + mouthR * 0.7, mouthY - 8);
    ctx.stroke();
  } else if (state.mouth === 'sad') {
    ctx.beginPath(); ctx.arc(cx, mouthY + mouthR * 0.6, mouthR, Math.PI, 0); ctx.stroke();
  } else if (state.mouth === 'rainbow') {
    ['#ef4444','#f59e0b','#22c55e','#3b82f6','#8b5cf6'].forEach((color, i) => {
      ctx.strokeStyle = color; ctx.lineWidth = size * 0.018;
      ctx.beginPath(); ctx.arc(cx, mouthY, mouthR + i * 3, 0, Math.PI); ctx.stroke();
    });
  } else {
    ctx.beginPath(); ctx.arc(cx, mouthY, mouthR, 0, Math.PI); ctx.stroke();
  }
}

function drawStar(ctx, cx, cy, points, r, ir) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a  = (i * Math.PI) / points - Math.PI / 2;
    const rd = i % 2 === 0 ? r : ir;
    i === 0 ? ctx.moveTo(cx + rd * Math.cos(a), cy + rd * Math.sin(a))
            : ctx.lineTo(cx + rd * Math.cos(a), cy + rd * Math.sin(a));
  }
  ctx.closePath(); ctx.fill();
}

function drawHeart(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx - size * 1.2, cy - size * 0.5, cx - size * 2, cy + size * 1.2, cx, cy + size * 2);
  ctx.bezierCurveTo(cx + size * 2, cy + size * 1.2, cx + size * 1.2, cy - size * 0.5, cx, cy + size * 0.3);
  ctx.fill();
}

async function loadAvatarSection() {
  const profile = await apiRequest('/api/profile');
  if (!profile.error) { myProfile = { ...myProfile, ...profile }; syncMiiState(profile); }

  const colorOpts = document.getElementById('colorOptions');
  if (colorOpts) {
    colorOpts.innerHTML = BG_COLORS.map(c => `
      <div class="color-swatch ${miiState.color === c ? 'selected' : ''}"
           style="background:${c};border:2px solid ${c === '#ffffff' ? '#e2e8f0' : 'transparent'};"
           onclick="setAvatarColor('${c}', this)"></div>
    `).join('');
  }

  const skinOpts = document.getElementById('skinOptions');
  if (skinOpts) {
    skinOpts.innerHTML = SKIN_COLORS.map(c => `
      <div class="color-swatch ${miiState.skin === c ? 'selected' : ''}"
           style="background:${c};"
           onclick="setAvatarSkin('${c}', this)"></div>
    `).join('');
  }

  const hairOpts = document.getElementById('hairOptions');
  if (hairOpts) {
    hairOpts.innerHTML = HAIR_OPTIONS.map(h => `
      <button class="option-btn ${miiState.hair === h ? 'selected' : ''}" onclick="setAvatarHair('${h}', this)">
        ${h === 'none' ? '🚫 Nessuno' : h === 'short' ? '💇 Corti' : h === 'long' ? '💁 Lunghi' : h === 'curly' ? '🦱 Ricci' : h === 'spiky' ? '⚡ Spiky' : '🎀 Bun'}
      </button>
    `).join('');
  }

  const eyeOpts = document.getElementById('eyeOptions');
  if (eyeOpts) {
    eyeOpts.innerHTML = EYE_OPTIONS.map(e => `
      <button class="option-btn ${miiState.eyes === e ? 'selected' : ''}" onclick="setAvatarEyes('${e}', this)">
        ${e === 'normal' ? '😐 Normali' : e === 'happy' ? '😊 Felici' : e === 'sleepy' ? '😴 Assonnati' : e === 'surprised' ? '😲 Sorpresi' : e === 'wink' ? '😉 Occhiolino' : e === 'cool' ? '😎 Cool' : e === 'star' ? '⭐ Stella' : '❤️ Cuore'}
      </button>
    `).join('');
  }

  const mouthOpts = document.getElementById('mouthOptions');
  if (mouthOpts) {
    mouthOpts.innerHTML = MOUTH_OPTIONS.map(m => `
      <button class="option-btn ${miiState.mouth === m ? 'selected' : ''}" onclick="setAvatarMouth('${m}', this)">
        ${m === 'smile' ? '😊 Sorriso' : m === 'grin' ? '😁 Ghigno' : m === 'open' ? '😮 Aperta' : m === 'smirk' ? '😏 Smorfia' : m === 'sad' ? '😢 Triste' : '🌈 Arcobaleno'}
      </button>
    `).join('');
  }

  drawMii(miiState, 'miiCanvas', 200);
}

function setAvatarColor(color, el) {
  miiState.color = color;
  document.querySelectorAll('#colorOptions .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200); drawMii(miiState, 'sidebarAvatar', 48);
}
window.setAvatarColor = setAvatarColor;

function setAvatarSkin(skin, el) {
  miiState.skin = skin;
  document.querySelectorAll('#skinOptions .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200); drawMii(miiState, 'sidebarAvatar', 48);
}
window.setAvatarSkin = setAvatarSkin;

function setAvatarHair(hair, el) {
  miiState.hair = hair;
  document.querySelectorAll('#hairOptions .option-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200); drawMii(miiState, 'sidebarAvatar', 48);
}
window.setAvatarHair = setAvatarHair;

function setAvatarEyes(eyes, el) {
  miiState.eyes = eyes;
  document.querySelectorAll('#eyeOptions .option-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200); drawMii(miiState, 'sidebarAvatar', 48);
}
window.setAvatarEyes = setAvatarEyes;

function setAvatarMouth(mouth, el) {
  miiState.mouth = mouth;
  document.querySelectorAll('#mouthOptions .option-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  drawMii(miiState, 'miiCanvas', 200); drawMii(miiState, 'sidebarAvatar', 48);
}
window.setAvatarMouth = setAvatarMouth;

async function saveAvatar() {
  const data = await apiRequest('/api/profile/avatar', 'PUT', {
    color: miiState.color, skin: miiState.skin,
    eyes:  miiState.eyes,  mouth: miiState.mouth, hair: miiState.hair
  });
  if (data.error) { showNotification(data.error, 'error'); return; }
  if (myProfile) {
    myProfile.avatar_color = miiState.color; myProfile.avatar_skin  = miiState.skin;
    myProfile.avatar_eyes  = miiState.eyes;  myProfile.avatar_mouth = miiState.mouth;
    myProfile.avatar_hair  = miiState.hair;
  }
  showNotification('✅ Avatar salvato!', 'success');
  drawMii(miiState, 'sidebarAvatar', 48);
}
window.saveAvatar = saveAvatar;

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════
async function loadProfile() {
  const profile = await apiRequest('/api/profile');
  if (profile.error) { showNotification(profile.error, 'error'); return; }
  myProfile = profile;

  document.getElementById('editName').value     = profile.name     || '';
  document.getElementById('editUsername').value = profile.username || '';
  document.getElementById('editBio').value      = profile.bio      || '';
  document.getElementById('profPoints').textContent = profile.points || 0;
  document.getElementById('profCo2').textContent    = parseFloat(profile.co2_saved || 0).toFixed(1);
  document.getElementById('profActs').textContent   = profile.total_activities || 0;

  const pts  = profile.points || 0;
  const lvl  = Math.floor(pts / 100) + 1;
  const next = lvl * 100;
  const pct  = ((pts % 100) / 100) * 100;
  document.getElementById('profLevel').textContent = `Livello ${lvl} 🌱`;
  document.getElementById('xpText').textContent    = `${pts}/${next} XP`;
  document.getElementById('xpBar').style.width     = pct + '%';

  syncMiiState(profile);
  await loadBadges();
}
window.loadProfile = loadProfile;

async function loadBadges() {
  const badges = await apiRequest('/api/badges');
  const container = document.getElementById('badgeList');
  if (!container || badges.error) return;
  container.innerHTML = badges.map(b => `
    <div class="badge-item ${b.unlocked ? 'unlocked' : 'locked'}" title="${escapeHtml(b.desc)}">
      <span>${b.icon}</span>
      <strong>${escapeHtml(b.name)}</strong>
    </div>
  `).join('');
}

async function saveProfile() {
  const name     = document.getElementById('editName')?.value.trim();
  const username = document.getElementById('editUsername')?.value.trim();
  const bio      = document.getElementById('editBio')?.value.trim();
  if (!name || !username) { showNotification('Nome e username obbligatori', 'error'); return; }
  const data = await apiRequest('/api/profile', 'PUT', { name, username, bio });
  if (data.error) { showNotification(data.error, 'error'); return; }
  if (myProfile) { myProfile.name = name; myProfile.username = username; myProfile.bio = bio; updateSidebar(myProfile); }
  showNotification('✅ Profilo aggiornato!', 'success');
}
window.saveProfile = saveProfile;

async function changePassword() {
  const cur = document.getElementById('currentPw')?.value;
  const nw  = document.getElementById('newPw')?.value;
  if (!cur || !nw) { showNotification('Inserisci entrambe le password', 'error'); return; }
  if (!checkPasswordStrength(nw)) { showNotification('La nuova password non è abbastanza sicura', 'error'); return; }
  const data = await apiRequest('/api/profile/password', 'PUT', { current_password: cur, new_password: nw });
  if (data.error) { showNotification(data.error, 'error'); return; }
  document.getElementById('currentPw').value = '';
  document.getElementById('newPw').value = '';
  showNotification('✅ Password aggiornata!', 'success');
}
window.changePassword = changePassword;

// ═══════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════
async function loadNotifications() {
  const data = await apiRequest('/api/notifications');
  const container = document.getElementById('notifList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>🔔</span><p>Nessuna notifica</p></div>`;
    return;
  }
  container.innerHTML = data.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id}, this)">
      <span class="notif-icon">${n.icon || '🔔'}</span>
      <div class="notif-body">
        <p>${escapeHtml(n.message)}</p>
        <small>${timeAgo(n.created_at)}</small>
      </div>
      ${!n.is_read ? '<div class="notif-dot"></div>' : ''}
    </div>
  `).join('');
  await loadNotificationCount();
}
window.loadNotifications = loadNotifications;

async function loadNotificationCount() {
  const data = await apiRequest('/api/notifications/count');
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (!data.error && data.count > 0) {
    badge.textContent = data.count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

async function markRead(id, el) {
  await apiRequest(`/api/notifications/${id}/read`, 'POST');
  el.classList.remove('unread');
  el.querySelector('.notif-dot')?.remove();
  await loadNotificationCount();
}
window.markRead = markRead;

async function markAllRead() {
  await apiRequest('/api/notifications/read-all', 'POST');
  showNotification('✅ Tutte le notifiche lette', 'success');
  await loadNotifications();
}
window.markAllRead = markAllRead;

// ═══════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════
async function loadAdminPanel() {
  const stats = await apiRequest('/api/admin/stats');
  if (!stats.error) {
    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card green"><div class="stat-card-icon">👥</div><div class="stat-card-body"><span class="stat-card-value">${stats.total_users}</span><span class="stat-card-label">Utenti</span></div></div>
      <div class="stat-card blue"><div class="stat-card-icon">🌿</div><div class="stat-card-body"><span class="stat-card-value">${stats.total_activities}</span><span class="stat-card-label">Attività</span></div></div>
      <div class="stat-card purple"><div class="stat-card-icon">🌍</div><div class="stat-card-body"><span class="stat-card-value">${parseFloat(stats.total_co2).toFixed(1)}</span><span class="stat-card-label">kg CO₂ totali</span></div></div>
      <div class="stat-card yellow"><div class="stat-card-icon">📝</div><div class="stat-card-body"><span class="stat-card-value">${stats.total_posts}</span><span class="stat-card-label">Post</span></div></div>
    `;
  }
  await loadAdminUsers();
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.admin-tab[onclick*="${tab}"]`)?.classList.add('active');
  document.getElementById(`adminTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add('active');
  if (tab === 'users')      loadAdminUsers();
  if (tab === 'activities') loadAdminActivities();
  if (tab === 'posts')      loadAdminPosts();
}
window.switchAdminTab = switchAdminTab;

async function loadAdminUsers() {
  const data = await apiRequest('/api/admin/users');
  const tbody = document.getElementById('adminUsersList');
  if (!tbody || data.error) return;
  tbody.innerHTML = data.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.name || '-')}</td>
      <td>@${escapeHtml(u.username || '-')}</td>
      <td style="font-size:12px;">${escapeHtml(u.email)}</td>
      <td>${u.points || 0}</td>
      <td>${parseFloat(u.co2_saved || 0).toFixed(1)}</td>
      <td>${u.activity_count || 0}</td>
      <td><span class="badge-admin ${u.is_admin ? 'admin' : 'user'}">${u.is_admin ? '👑 Admin' : '👤 User'}</span></td>
      <td><span class="badge-admin ${u.is_banned ? 'banned' : 'active'}">${u.is_banned ? '🔨 Bannato' : '✅ Attivo'}</span></td>
      <td>
        <div class="admin-actions">
          <button class="btn-sm" onclick="openEditUser(${u.id})">✏️</button>
          ${!u.is_banned
            ? `<button class="btn-sm red" onclick="openBanModal(${u.id})">🔨 Ban</button>`
            : `<button class="btn-sm green" onclick="unbanUser(${u.id})">✅ Unban</button>`
          }
          ${u.id !== myProfile?.id ? `<button class="btn-sm red" onclick="deleteUser(${u.id})">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadAdminActivities() {
  const data = await apiRequest('/api/admin/activities');
  const tbody = document.getElementById('adminActivitiesList');
  if (!tbody || data.error) return;
  tbody.innerHTML = data.map(a => `
    <tr>
      <td>${a.id}</td>
      <td>${escapeHtml(a.user_name || '-')}</td>
      <td>${ACTIVITY_ICONS[a.type] || ''} ${escapeHtml(a.type)}</td>
      <td>${a.km || 0}</td>
      <td>${a.hours || 0}</td>
      <td>${a.co2_saved || 0}</td>
      <td>${a.points || 0}</td>
      <td style="font-size:12px;">${new Date(a.date).toLocaleDateString('it-IT')}</td>
      <td><button class="btn-sm red" onclick="deleteActivity(${a.id})">🗑️ Elimina</button></td>
    </tr>
  `).join('');
}

async function loadAdminPosts() {
  const data = await apiRequest('/api/admin/posts');
  const tbody = document.getElementById('adminPostsList');
  if (!tbody || data.error) return;
  tbody.innerHTML = data.map(p => {
    const likes = typeof p.likes === 'string' ? JSON.parse(p.likes) : (p.likes || []);
    return `
      <tr>
        <td>${p.id}</td>
        <td>${escapeHtml(p.author_name || '-')}</td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.content)}</td>
        <td>❤️ ${likes.length}</td>
        <td style="font-size:12px;">${new Date(p.created_at).toLocaleDateString('it-IT')}</td>
        <td><button class="btn-sm red" onclick="adminDeletePost(${p.id})">🗑️ Elimina</button></td>
      </tr>
    `;
  }).join('');
}

async function openEditUser(id) {
  const data = await apiRequest('/api/admin/users');
  const u = data.find(x => x.id === id);
  if (!u) return;
  document.getElementById('editUserId').value        = id;
  document.getElementById('editUserName').value      = u.name || '';
  document.getElementById('editUserUsername').value  = u.username || '';
  document.getElementById('editUserPoints').value    = u.points || 0;
  document.getElementById('editUserIsAdmin').checked = u.is_admin || false;
  document.getElementById('editUserModal').style.display = 'flex';
}
window.openEditUser = openEditUser;

function closeEditUserModal() { document.getElementById('editUserModal').style.display = 'none'; }
window.closeEditUserModal = closeEditUserModal;

async function confirmEditUser() {
  const id       = document.getElementById('editUserId').value;
  const name     = document.getElementById('editUserName').value.trim();
  const username = document.getElementById('editUserUsername').value.trim();
  const points   = parseInt(document.getElementById('editUserPoints').value) || 0;
  const isAdmin  = document.getElementById('editUserIsAdmin').checked;
  if (!name || !username) { showNotification('Nome e username obbligatori', 'error'); return; }
  const data = await apiRequest(`/api/admin/users/${id}`, 'PUT', { name, username, points, is_admin: isAdmin });
  if (data.error) { showNotification(data.error, 'error'); return; }
  closeEditUserModal();
  showNotification('✅ Utente aggiornato!', 'success');
  await loadAdminUsers();
}
window.confirmEditUser = confirmEditUser;

function openBanModal(userId) {
  document.getElementById('banUserId').value = userId;
  document.getElementById('banDays').value   = '';
  document.getElementById('banReason').value = '';
  document.getElementById('banModal').style.display = 'flex';
}
window.openBanModal = openBanModal;

function closeBanModal() { document.getElementById('banModal').style.display = 'none'; }
window.closeBanModal = closeBanModal;

async function confirmBan() {
  const id     = document.getElementById('banUserId').value;
  const days   = parseInt(document.getElementById('banDays').value) || 0;
  const reason = document.getElementById('banReason').value.trim() || 'Violazione regole';
  const data = await apiRequest(`/api/admin/users/${id}/ban`, 'POST', { days: days || null, reason });
  if (data.error) { showNotification(data.error, 'error'); return; }
  closeBanModal();
  showNotification('🔨 Utente bannato', 'success');
  await loadAdminUsers();
}
window.confirmBan = confirmBan;

async function unbanUser(id) {
  showConfirm('Rimuovi ban', 'Sei sicuro di voler rimuovere il ban?', async () => {
    const data = await apiRequest(`/api/admin/users/${id}/unban`, 'POST');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('✅ Ban rimosso!', 'success');
    await loadAdminUsers();
  }, '✅');
}
window.unbanUser = unbanUser;

async function deleteUser(id) {
  const users = await apiRequest('/api/admin/users');
  const u = Array.isArray(users) ? users.find(x => x.id === id) : null;
  const name = u ? u.name : 'questo utente';
  showConfirm('Elimina utente', `Eliminare ${escapeHtml(name)}? Azione irreversibile.`, async () => {
    const data = await apiRequest(`/api/admin/users/${id}`, 'DELETE');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('✅ Utente eliminato', 'success');
    await loadAdminUsers();
  }, '🗑️');
}
window.deleteUser = deleteUser;

async function deleteActivity(id) {
  showConfirm('Elimina attività', 'Eliminare questa attività? I punti verranno rimossi dall\'utente.', async () => {
    const data = await apiRequest(`/api/admin/activities/${id}`, 'DELETE');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('✅ Attività eliminata', 'success');
    await loadAdminActivities();
  }, '🗑️');
}
window.deleteActivity = deleteActivity;

async function adminDeletePost(id) {
  showConfirm('Elimina post', 'Eliminare questo post?', async () => {
    const data = await apiRequest(`/api/admin/posts/${id}`, 'DELETE');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('✅ Post eliminato', 'success');
    await loadAdminPosts();
  }, '🗑️');
}
window.adminDeletePost = adminDeletePost;


// ═══════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════
let currentTeamId = null;
let teamMessagesInterval = null;

async function loadTeams() {
  const [data, lb] = await Promise.all([
    apiRequest('/api/teams'),
    apiRequest('/api/teams/leaderboard/global')
  ]);
  const leaderboard = document.getElementById('teamsLeaderboard');
  if (leaderboard && !lb.error) {
    leaderboard.innerHTML = lb.length ? lb.map((t, i) => `
      <div class="leaderboard-item" onclick="openTeam(${t.id})" style="cursor:pointer;">
        <div class="lb-rank ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${['🥇','🥈','🥉'][i]||i+1}</div>
        <div class="lb-info"><strong>${escapeHtml(t.name)}</strong><small>${t.member_count} membri</small></div>
        <div class="lb-stats">
          <span class="lb-co2">🌱 ${parseFloat(t.total_co2).toFixed(1)} kg</span>
          <span class="lb-pts">⭐ ${t.total_points} pt</span>
        </div>
      </div>`).join('') : '<div class="empty-state"><span>🏆</span><p>Nessun team</p></div>';
  }
  const container = document.getElementById('teamsList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = `<div class="empty-state"><span>👥</span><p>Non sei in nessun team.<br>Creane uno o unisciti con un codice!</p></div>`;
    return;
  }
  container.innerHTML = data.map(t => `
    <div class="team-card" onclick="openTeam(${t.id})">
      <div class="team-card-color" style="background:${escapeHtml(t.avatar_color)};height:8px;border-radius:8px 8px 0 0;"></div>
      <div class="team-card-body">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${escapeHtml(t.name)}</strong>
          <span class="team-role-badge ${t.role==='admin'?'admin':'member'}">${t.role==='admin'?'👑 Admin':'👤 Membro'}</span>
        </div>
        <small style="color:#64748b;">${escapeHtml(t.description||'')}</small>
        <div class="team-card-stats">
          <span>👥 ${t.member_count} membri</span>
          <span>🌱 ${parseFloat(t.total_co2||0).toFixed(1)} kg CO₂</span>
          <span>⭐ ${t.total_points||0} pt</span>
        </div>
      </div>
    </div>`).join('');
}
window.loadTeams = loadTeams;

async function createTeam() {
  const name  = document.getElementById('teamName')?.value.trim();
  const desc  = document.getElementById('teamDesc')?.value.trim();
  const color = document.getElementById('teamColor')?.value || '#16a34a';
  if (!name) { showNotification('Inserisci un nome per il team', 'error'); return; }
  const data = await apiRequest('/api/teams', 'POST', { name, description: desc, avatar_color: color });
  if (data.error) { showNotification(data.error, 'error'); return; }
  showNotification('✅ Team creato!', 'success');
  document.getElementById('teamName').value = '';
  document.getElementById('teamDesc').value = '';
  await loadTeams();
}
window.createTeam = createTeam;

async function joinTeam() {
  const code = document.getElementById('teamInviteCode')?.value.trim();
  if (!code) { showNotification('Inserisci il codice invito', 'error'); return; }
  const data = await apiRequest('/api/teams/join', 'POST', { invite_code: code });
  if (data.error) { showNotification(data.error, 'error'); return; }
  showNotification(`✅ Sei entrato nel team ${data.team.name}!`, 'success');
  document.getElementById('teamInviteCode').value = '';
  await loadTeams();
}
window.joinTeam = joinTeam;

async function openTeam(teamId) {
  currentTeamId = teamId;
  const data = await apiRequest(`/api/teams/${teamId}`);
  if (data.error) { showNotification(data.error, 'error'); return; }

  document.getElementById('teamDetailName').textContent = data.name;
  document.getElementById('teamDetailDesc').textContent = data.description || '';
  document.getElementById('teamDetailCo2').textContent  = parseFloat(data.stats.total_co2||0).toFixed(1);
  document.getElementById('teamDetailPts').textContent  = data.stats.total_points || 0;
  document.getElementById('teamDetailMembers').textContent = data.stats.member_count || 0;

  const inviteLink = `${window.location.origin}?join=${data.invite_code}`;
  document.getElementById('teamInviteLink').value = inviteLink;

  const leaveBtn = document.getElementById('teamLeaveBtn');
  if (data.my_role === 'admin') {
    leaveBtn.textContent = '🗑️ Elimina team';
    leaveBtn.onclick = () => deleteTeam(teamId, data.name);
  } else {
    leaveBtn.textContent = '🚪 Lascia team';
    leaveBtn.onclick = () => leaveTeam(teamId);
  }

  const membersEl = document.getElementById('teamMembersList');
  membersEl.innerHTML = data.members.map(m => `
    <div class="user-card">
      <canvas width="36" height="36" style="border-radius:50%;" id="tmAv${m.id}"></canvas>
      <div class="user-card-info">
        <strong>${escapeHtml(m.name)} ${m.role==='admin'?'👑':''}</strong>
        <small>🌱 ${parseFloat(m.co2_saved||0).toFixed(1)} kg · ⭐ ${m.points||0} pt</small>
      </div>
    </div>`).join('');
  data.members.forEach(m => drawMii({
    color: m.avatar_color||'#16a34a', skin: m.avatar_skin||'#fde68a',
    eyes: m.avatar_eyes||'normal', mouth: m.avatar_mouth||'smile', hair: m.avatar_hair||'none'
  }, `tmAv${m.id}`, 36));

  await loadTeamChallenges(teamId);
  await loadTeamMessages(teamId);
  if (teamMessagesInterval) clearInterval(teamMessagesInterval);
  teamMessagesInterval = setInterval(() => loadTeamMessages(teamId), 5000);

  document.getElementById('teamsListView').style.display = 'none';
  document.getElementById('teamDetailView').style.display = 'block';
}
window.openTeam = openTeam;

function backToTeams() {
  if (teamMessagesInterval) { clearInterval(teamMessagesInterval); teamMessagesInterval = null; }
  currentTeamId = null;
  document.getElementById('teamsListView').style.display = 'block';
  document.getElementById('teamDetailView').style.display = 'none';
}
window.backToTeams = backToTeams;

async function loadTeamMessages(teamId) {
  const data = await apiRequest(`/api/teams/${teamId}/messages`);
  const container = document.getElementById('teamChat');
  if (!container || data.error) return;
  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
  container.innerHTML = data.length ? data.map(m => `
    <div class="team-message ${m.user_id === myProfile?.id ? 'mine' : ''}">
      <canvas width="28" height="28" style="border-radius:50%;flex-shrink:0;" id="chatAv${m.id}"></canvas>
      <div class="team-message-body">
        <span class="team-message-author">${escapeHtml(m.author_name)}</span>
        <p class="team-message-text">${escapeHtml(m.content)}</p>
        <span class="team-message-time">${timeAgo(m.created_at)}</span>
      </div>
    </div>`).join('') : '<div class="empty-state"><span>💬</span><p>Nessun messaggio</p></div>';
  data.forEach(m => drawMii({
    color: m.avatar_color||'#16a34a', skin: m.avatar_skin||'#fde68a',
    eyes: m.avatar_eyes||'normal', mouth: m.avatar_mouth||'smile', hair: m.avatar_hair||'none'
  }, `chatAv${m.id}`, 28));
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

async function sendTeamMessage() {
  if (!currentTeamId) return;
  const input = document.getElementById('teamChatInput');
  const content = input?.value.trim();
  if (!content) return;
  const data = await apiRequest(`/api/teams/${currentTeamId}/messages`, 'POST', { content });
  if (data.error) { showNotification(data.error, 'error'); return; }
  input.value = '';
  await loadTeamMessages(currentTeamId);
}
window.sendTeamMessage = sendTeamMessage;

async function loadTeamChallenges(teamId) {
  const data = await apiRequest(`/api/teams/${teamId}/challenges`);
  const container = document.getElementById('teamChallengesList');
  if (!container) return;
  if (data.error || !data.length) {
    container.innerHTML = '<div class="empty-state"><span>🏆</span><p>Nessuna sfida del team</p></div>'; return;
  }
  container.innerHTML = data.map(c => {
    const expired = c.end_date && new Date(c.end_date) < new Date();
    return `<div class="challenge-item">
      <div class="challenge-header">
        <span class="challenge-title">${escapeHtml(c.title)}</span>
        ${expired ? '<span style="color:#ef4444;font-size:12px;">⏰ Scaduta</span>' : ''}
      </div>
      <p class="challenge-desc">${escapeHtml(c.description||'')}</p>
      <div class="challenge-meta">
        <span>🎯 ${c.co2_target} kg CO₂</span>
        <span>⭐ ${c.points_reward} pt</span>
        ${c.end_date ? `<span>📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function createTeamChallenge() {
  if (!currentTeamId) return;
  const title   = document.getElementById('teamChTitle')?.value.trim();
  const desc    = document.getElementById('teamChDesc')?.value.trim();
  const co2     = parseFloat(document.getElementById('teamChCo2')?.value) || 0;
  const pts     = parseInt(document.getElementById('teamChPts')?.value) || 0;
  const endDate = document.getElementById('teamChDate')?.value;
  if (!title)   { showNotification('Titolo obbligatorio', 'error'); return; }
  if (!endDate) { showNotification('Data scadenza obbligatoria', 'error'); return; }
  const data = await apiRequest(`/api/teams/${currentTeamId}/challenges`, 'POST',
    { title, description: desc, co2_target: co2, points_reward: pts, end_date: endDate });
  if (data.error) { showNotification(data.error, 'error'); return; }
  showNotification('✅ Sfida creata!', 'success');
  ['teamChTitle','teamChDesc','teamChCo2','teamChPts','teamChDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  await loadTeamChallenges(currentTeamId);
}
window.createTeamChallenge = createTeamChallenge;

function copyInviteLink() {
  const link = document.getElementById('teamInviteLink')?.value;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => showNotification('✅ Link copiato!', 'success'));
}
window.copyInviteLink = copyInviteLink;

async function leaveTeam(teamId) {
  showConfirm('Lascia team', 'Sei sicuro di voler lasciare il team?', async () => {
    const data = await apiRequest(`/api/teams/${teamId}/leave`, 'DELETE');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('Hai lasciato il team', 'info');
    backToTeams(); await loadTeams();
  }, '🚪');
}
window.leaveTeam = leaveTeam;

async function deleteTeam(teamId, name) {
  showConfirm('Elimina team', `Eliminare "${escapeHtml(name)}"? Azione irreversibile.`, async () => {
    const data = await apiRequest(`/api/teams/${teamId}`, 'DELETE');
    if (data.error) { showNotification(data.error, 'error'); return; }
    showNotification('Team eliminato', 'success');
    backToTeams(); await loadTeams();
  }, '🗑️');
}
window.deleteTeam = deleteTeam;

// ═══════════════════════════════════════════
// TUTORIAL
// ═══════════════════════════════════════════
const TUTORIAL_STEPS = [
  { emoji: '🌱', title: 'Benvenuto su EcoTrack!', text: 'Traccia le tue attività green e riduci la tua impronta di CO₂ ogni giorno.' },
  { emoji: '🚴', title: 'Registra attività',      text: 'Vai su Attività e scegli come ti sei spostato: bici, treno, bus o lavoro remoto.' },
  { emoji: '⭐', title: 'Guadagna punti',          text: 'Ogni attività ti dà punti e CO₂ risparmiata. Scala la classifica globale!' },
  { emoji: '🛍️', title: 'Personalizza il tuo Avatar', text: 'Usa i punti per acquistare oggetti nel Negozio e personalizza il tuo Mii!' },
  { emoji: '🏆', title: 'Sfide e Social',          text: 'Crea sfide, segui altri utenti e condividi i tuoi progressi nel feed Social.' },
];

function showTutorial() {
  tutorialStep = 1;
  renderTutorialStep();
  document.getElementById('tutorialModal').style.display = 'flex';
}
window.showTutorial = showTutorial;

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep - 1];
  document.getElementById('tutorialContent').innerHTML = `
    <div class="tutorial-step">
      <div class="tutorial-emoji">${step.emoji}</div>
      <h3>${escapeHtml(step.title)}</h3>
      <p>${escapeHtml(step.text)}</p>
    </div>
  `;
  const dots = document.getElementById('tutorialDots');
  dots.innerHTML = TUTORIAL_STEPS.map((_, i) => `
    <div class="tutorial-dot ${i + 1 === tutorialStep ? 'active' : ''}"></div>
  `).join('');
  const nextBtn = document.getElementById('tutorialNext');
  nextBtn.textContent = tutorialStep === TUTORIAL_STEPS.length ? '🎉 Inizia!' : 'Avanti →';
}

async function nextTutorialStep() {
  if (tutorialStep < TUTORIAL_STEPS.length) {
    tutorialStep++;
    renderTutorialStep();
  } else {
    await skipTutorial();
  }
}
window.nextTutorialStep = nextTutorialStep;

async function skipTutorial() {
  document.getElementById('tutorialModal').style.display = 'none';
  await apiRequest('/api/tutorial/complete', 'POST');
  if (myProfile) myProfile.tutorial_done = true;
}
window.skipTutorial = skipTutorial;

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'reset' && params.get('token')) {
    switchAuthTab('reset');
  }
  // Auto-join team da link invito
  const joinCode = params.get('join');
  if (joinCode && token) {
    const joinData = await apiRequest('/api/teams/join', 'POST', { invite_code: joinCode });
    if (!joinData.error) showNotification(`✅ Sei entrato nel team ${joinData.team?.name||''}!`, 'success');
  }

  if (params.get('verified') === '1') {
    showNotification('✅ Email verificata! Ora puoi accedere.', 'success');
  }

  if (token) {
    const data = await apiRequest('/api/profile');
    if (!data.error) {
      myProfile = data;
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display  = 'flex';
      updateSidebar(data);
      syncMiiState(data);
      await loadDashboard();
      await loadNotificationCount();
      setInterval(loadNotificationCount, 30000);
    } else {
      token = null;
      localStorage.removeItem('ecotoken');
    }
  }

  // Chiudi modal cliccando fuori
  document.getElementById('confirmModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) closeConfirm();
  });
  document.getElementById('banModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('banModal')) closeBanModal();
  });
  document.getElementById('editUserModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('editUserModal')) closeEditUserModal();
  });
});
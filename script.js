let token = localStorage.getItem('ecotoken');
let currentAct = null;
let currentStep = 1;
const TOTAL_STEPS = 4;

const RATES = {
  Remoto:    { type: 'hours', co2: 0.5,  pts: 10 },
  Treno:     { type: 'km',    co2: 0.04, pts: 2  },
  Bici:      { type: 'km',    co2: 0,    pts: 5  },
  Bus:       { type: 'km',    co2: 0.08, pts: 1.5},
  Carpooling:{ type: 'km',    co2: 0.06, pts: 3  },
  Videocall: { type: 'hours', co2: 0.1,  pts: 8  }
};

const ICONS = { Remoto:'🏠', Treno:'🚂', Bici:'🚴', Bus:'🚌', Carpooling:'🚗', Videocall:'💻' };

// ── TUTORIAL ────────────────────────────────────

function showTutorial() {
  document.getElementById('tutorial').style.display = 'flex';
  goStep(1);
}

function skipTutorial() {
  document.getElementById('tutorial').style.display = 'none';
  localStorage.setItem('tutorialDone', '1');
}

function goStep(n) {
  currentStep = n;
  document.querySelectorAll('.tutorial-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`[data-step="${n}"]`).classList.add('active');
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === n - 1));
  document.getElementById('tutPrev').style.opacity = n === 1 ? '0' : '1';
  document.getElementById('tutNext').textContent = n === TOTAL_STEPS ? '🚀 Inizia!' : 'Avanti →';
}

function nextStep() {
  if (currentStep === TOTAL_STEPS) { skipTutorial(); return; }
  goStep(currentStep + 1);
}

function prevStep() {
  if (currentStep > 1) goStep(currentStep - 1);
}

// ── AUTH ─────────────────────────────────────────

function switchAuth(tab) {
  document.getElementById('loginForm').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
}

function togglePw(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function checkPw() {
  const v = document.getElementById('regPassword').value;
  const set = (id, ok) => {
    const el = document.getElementById(id);
    el.classList.toggle('ok', ok);
  };
  set('c1', v.length >= 8);
  set('c2', /[A-Z]/.test(v));
  set('c3', /\d/.test(v));
  set('c4', /[!@#$%^&*]/.test(v));
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return setErr('loginError', 'Compila tutti i campi');
  const data = await post('/api/login', { email, password });
  if (data.error) return setErr('loginError', data.error);
  token = data.token;
  localStorage.setItem('ecotoken', token);
  enterDashboard(data.user);
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!name || !email || !password) return setErr('regError', 'Compila tutti i campi');
  const data = await post('/api/register', { name, email, password });
  if (data.error) return setErr('regError', data.error);
  token = data.token;
  localStorage.setItem('ecotoken', token);
  enterDashboard(data.user);
}

function setErr(id, msg) {
  document.getElementById(id).textContent = msg;
  setTimeout(() => document.getElementById(id).textContent = '', 4000);
}

function logout() {
  localStorage.removeItem('ecotoken');
  location.reload();
}

function enterDashboard(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';
  document.getElementById('mobileNav').style.display = 'flex';
  document.getElementById('userName').textContent = user.name || user.email;
  document.getElementById('userEmail2').textContent = user.email || '';
  document.getElementById('userAvatar').textContent = (user.name || user.email || 'U')[0].toUpperCase();
  loadAll();
  if (!localStorage.getItem('tutorialDone')) showTutorial();
}

// ── API ──────────────────────────────────────────

async function api(url, method = 'GET', body = null) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

// ── LOAD ALL ─────────────────────────────────────

function loadAll() {
  loadStats();
  loadActivities();
  loadBadges();
  loadLeaderboard();
  loadYearly();
  loadChallenges();
}

// ── STATS ────────────────────────────────────────

async function loadStats() {
  const d = await api('/api/stats');
  animateNumber('statCO2Week', parseFloat(d.co2_week || 0), 1);
  animateNumber('statPoints', parseInt(d.points || 0), 0);
  animateNumber('statActivities', parseInt(d.total_activities || 0), 0);
}

function animateNumber(id, target, decimals) {
  const el = document.getElementById(id);
  const start = 0;
  const duration = 800;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + (target - start) * ease;
    el.textContent = current.toFixed(decimals);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ── ACTIVITIES ───────────────────────────────────

function selectAct(type, btn) {
  currentAct = type;
  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const r = RATES[type];
  document.getElementById('actForm').style.display = 'block';
  document.getElementById('actFormTitle').textContent = `${ICONS[type]} Stai registrando: ${type}`;
  document.getElementById('kmRow').style.display = r.type === 'km' ? 'block' : 'none';
  document.getElementById('hoursRow').style.display = r.type === 'hours' ? 'block' : 'none';
  document.getElementById('carpoolRow').style.display = type === 'Carpooling' ? 'block' : 'none';
  document.getElementById('inKm').value = '';
  document.getElementById('inHours').value = '';
  document.getElementById('inNote').value = '';
  updatePreview();
}

function updatePreview() {
  if (!currentAct) return;
  const r = RATES[currentAct];
  const km = parseFloat(document.getElementById('inKm').value) || 0;
  const hours = parseFloat(document.getElementById('inHours').value) || 0;
  const val = r.type === 'km' ? km : hours;
  const co2 = (val * r.co2).toFixed(2);
  const pts = Math.round(val * r.pts);
  document.getElementById('previewCO2').textContent = co2;
  document.getElementById('previewPts').textContent = pts;
}

document.addEventListener('DOMContentLoaded', () => {
  ['inKm','inHours'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
  });
});

function cancelAct() {
  document.getElementById('actForm').style.display = 'none';
  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  currentAct = null;
}

async function saveActivity() {
  const km = parseFloat(document.getElementById('inKm').value) || 0;
  const hours = parseFloat(document.getElementById('inHours').value) || 0;
  const note = document.getElementById('inNote').value;
  const carsharing_with = document.getElementById('inCarpool').value;
  const r = RATES[currentAct];

  if (r.type === 'km' && km === 0) return showNotif('⚠️ Inserisci i km!', 'error');
  if (r.type === 'hours' && hours === 0) return showNotif('⚠️ Inserisci le ore!', 'error');

  const data = await api('/api/activity', 'POST', { type: currentAct, km, hours, note, carsharing_with });
  if (data.error) return showNotif('❌ ' + data.error, 'error');

  showNotif(`✅ +${data.points} punti! 🌱 ${data.co2_saved}kg CO₂ salvata`, 'success');
  cancelAct();
  loadAll();
}

async function loadActivities() {
  const acts = await api('/api/activities');
  const html = acts.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🌱</div><p>Nessuna attività ancora.<br>Inizia a tracciare il tuo impatto!</p></div>`
    : acts.map(a => `
      <div class="activity-item">
        <div class="act-emoji">${ICONS[a.type] || '📌'}</div>
        <div class="act-info">
          <div class="act-title">${a.type}</div>
          <div class="act-meta">${a.km > 0 ? a.km + ' km' : ''}${a.km > 0 && a.hours > 0 ? ' · ' : ''}${a.hours > 0 ? a.hours + ' ore' : ''}</div>
          ${a.note ? `<div class="act-note">📝 ${a.note}</div>` : ''}
          <div class="act-date">${new Date(a.date).toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' })}</div>
        </div>
        <div class="act-stats">
          <span class="tag-co2">-${a.co2_saved} kg</span>
          <span class="tag-pts">+${a.points} pt</span>
        </div>
      </div>
    `).join('');

  document.getElementById('recentList').innerHTML = html;
  document.getElementById('allActivities').innerHTML = html;
}

// ── BADGES ───────────────────────────────────────

async function loadBadges() {
  const badges = await api('/api/badges');
  const unlocked = badges.filter(b => b.unlocked).length;
  document.getElementById('statBadges').textContent = unlocked;
  document.getElementById('badgeGrid').innerHTML = badges.map(b => `
    <div class="badge-item ${b.unlocked ? 'unlocked' : 'locked'}">
      <div class="badge-emoji">${b.icon}</div>
      <div class="badge-info">
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>
    </div>
  `).join('');
}

// ── CHALLENGES ───────────────────────────────────

function toggleNewChallenge() {
  const f = document.getElementById('newChallengeForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function createChallenge() {
  const data = await api('/api/challenges', 'POST', {
    title: document.getElementById('chTitle').value,
    description: document.getElementById('chDesc').value,
    co2_target: parseFloat(document.getElementById('chTarget').value),
    points_reward: parseInt(document.getElementById('chPoints').value),
    end_date: document.getElementById('chEndDate').value,
    is_public: document.getElementById('chPublic').checked
  });
  if (data.error) return showNotif('❌ ' + data.error, 'error');
  showNotif('🚀 Sfida creata!', 'success');
  document.getElementById('newChallengeForm').style.display = 'none';
  loadChallenges();
}

async function loadChallenges() {
  const list = await api('/api/challenges');
  document.getElementById('challengeList').innerHTML = list.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🔥</div><p>Nessuna sfida.<br>Creane una per motivare il team!</p></div>`
    : list.map(c => `
      <div class="challenge-item">
        <div class="ch-icon">🚀</div>
        <div class="ch-info">
          <h4>${c.title} ${c.is_public ? '🌍' : '🔒'}</h4>
          <p>${c.description || ''}</p>
          <div class="ch-meta">
            <span>🎯 ${c.co2_target} kg CO₂</span>
            <span>🏆 ${c.points_reward} pt</span>
            <span>📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>
          </div>
        </div>
      </div>
    `).join('');
}

// ── LEADERBOARD ──────────────────────────────────

async function loadLeaderboard() {
  const board = await api('/api/leaderboard');
  document.getElementById('leaderboardList').innerHTML = `<div class="lb-list">${
    board.map((u, i) => `
      <div class="lb-item ${i < 3 ? 'rank-' + (i + 1) : ''}">
        <span class="lb-rank">${['🥇','🥈','🥉'][i] || `#${u.rank}`}</span>
        <div class="lb-avatar">${u.name[0].toUpperCase()}</div>
        <span class="lb-name">${u.name}</span>
        <span class="lb-co2">${parseFloat(u.co2_saved).toFixed(1)} kg</span>
        <span class="lb-pts">${u.points} pt</span>
      </div>
    `).join('')
  }</div>`;
}

// ── YEARLY ───────────────────────────────────────

async function loadYearly() {
  const data = await api('/api/yearly');
  const maxCo2 = Math.max(...data.map(d => d.co2), 1);
  document.getElementById('yearlyList').innerHTML = data.length === 0
    ? `<div class="empty-state"><div class="empty-icon">📅</div><p>Nessun dato per quest'anno ancora.</p></div>`
    : data.map(m => `
      <div class="yearly-item">
        <span class="yr-month">${m.month}</span>
        <div class="yr-bar">
          <div class="yr-fill" style="width: ${Math.round((m.co2 / maxCo2) * 100)}%"></div>
        </div>
        <span class="yr-co2">${parseFloat(m.co2).toFixed(1)} kg</span>
        <span class="yr-pts">${m.points} pt</span>
      </div>
    `).join('');
}

// ── TABS ─────────────────────────────────────────

const PAGE_TITLES = {
  dashboard: ['Dashboard', 'Ecco il tuo impatto questa settimana.'],
  log: ['Log Attività', 'Registra le tue attività green.'],
  challenges: ['Sfide', 'Partecipa e crea sfide per il team.'],
  leaderboard: ['Classifica', 'Come te la cavi nel team?'],
  yearly: ['Riepilogo Annuale', 'Il tuo andamento nel 2026.']
};

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.sn-btn, .mn-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const [title, sub] = PAGE_TITLES[tab] || ['', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;
}

// ── NOTIFICATIONS ────────────────────────────────

function showNotif(msg, type = 'success') {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.className = `notif ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ── INIT ─────────────────────────────────────────

window.onload = () => {
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('dashboard').style.display = 'flex';
      document.getElementById('mobileNav').style.display = 'flex';
      document.getElementById('userName').textContent = payload.email;
      document.getElementById('userEmail2').textContent = payload.email;
      document.getElementById('userAvatar').textContent = payload.email[0].toUpperCase();
      loadAll();
    } catch { localStorage.removeItem('ecotoken'); }
  }
};

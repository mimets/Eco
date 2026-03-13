let token = localStorage.getItem('token');
let currentActivity = null;

// ─── AUTH ────────────────────────────────────────

function switchAuth(tab) {
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0) === (tab === 'login'));
  });
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.error) return document.getElementById('loginError').textContent = data.error;
  token = data.token;
  localStorage.setItem('token', token);
  enterDashboard(data.user);
}

async function doRegister() {
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (data.error) return document.getElementById('regError').textContent = data.error;
  token = data.token;
  localStorage.setItem('token', token);
  enterDashboard(data.user);
}

// Criteri password live
document.addEventListener('DOMContentLoaded', () => {
  const pw = document.getElementById('regPassword');
  if (pw) pw.addEventListener('input', () => {
    const v = pw.value;
    const check = (id, ok) => {
      document.getElementById(id).textContent = (ok ? '✓ ' : '✗ ') + document.getElementById(id).textContent.slice(2);
      document.getElementById(id).style.color = ok ? '#28a745' : '#dc3545';
    };
    check('c1', v.length >= 8);
    check('c2', /[A-Z]/.test(v));
    check('c3', /\d/.test(v));
    check('c4', /[!@#$%^&*]/.test(v));
  });
});

function logout() {
  localStorage.removeItem('token');
  location.reload();
}

function enterDashboard(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('userName').textContent = user.name || user.email;
  loadAll();
}

// ─── LOAD ALL ────────────────────────────────────

async function loadAll() {
  loadStats();
  loadActivities();
  loadBadges();
  loadLeaderboard();
  loadYearly();
  loadChallenges();
}

async function api(url, method = 'GET', body = null) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

// ─── STATS ───────────────────────────────────────

async function loadStats() {
  const data = await api('/api/stats');
  document.getElementById('statCO2Week').textContent = parseFloat(data.co2_week || 0).toFixed(1) + ' kg';
  document.getElementById('statPoints').textContent = data.points || 0;
  document.getElementById('statActivities').textContent = data.total_activities || 0;
}

// ─── ACTIVITIES ──────────────────────────────────

const ACTIVITY_ICONS = {
  'Remoto': '🏠', 'Treno': '🚂', 'Bici': '🚴',
  'Bus': '🚌', 'Carpooling': '🚗', 'Videocall': '💻'
};

function selectActivity(type) {
  currentActivity = type;
  document.getElementById('activityForm').style.display = 'block';
  document.getElementById('activityFormTitle').textContent = `${ACTIVITY_ICONS[type]} ${type}`;

  const needsKm = ['Treno','Bici','Bus','Carpooling'].includes(type);
  const needsHours = ['Remoto','Videocall'].includes(type);
  const needsCarpool = type === 'Carpooling';

  document.getElementById('kmField').style.display = needsKm ? 'block' : 'none';
  document.getElementById('hoursField').style.display = needsHours ? 'block' : 'none';
  document.getElementById('carpoolField').style.display = needsCarpool ? 'block' : 'none';

  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  event.target.classList.add('selected');
}

function cancelActivity() {
  document.getElementById('activityForm').style.display = 'none';
  currentActivity = null;
}

async function saveActivity() {
  const km = parseFloat(document.getElementById('inputKm').value) || 0;
  const hours = parseFloat(document.getElementById('inputHours').value) || 0;
  const note = document.getElementById('inputNote').value;
  const carsharing_with = document.getElementById('inputCarpool').value;

  if (!currentActivity) return;
  if (['Treno','Bici','Bus','Carpooling'].includes(currentActivity) && km === 0)
    return showNotif('Inserisci i km!', 'error');
  if (['Remoto','Videocall'].includes(currentActivity) && hours === 0)
    return showNotif('Inserisci le ore!', 'error');

  const data = await api('/api/activity', 'POST', {
    type: currentActivity, km, hours, note, carsharing_with
  });

  if (data.error) return showNotif(data.error, 'error');

  showNotif(`✅ +${data.points} punti! 🌱 ${data.co2_saved}kg CO₂`, 'success');
  cancelActivity();
  loadAll();
}

async function loadActivities() {
  const activities = await api('/api/activities');
  const list = document.getElementById('recentList');
  list.innerHTML = activities.length === 0
    ? '<p class="empty">Nessuna attività ancora</p>'
    : activities.map(a => `
      <div class="activity-item">
        <div class="activity-icon">${ACTIVITY_ICONS[a.type] || '📌'}</div>
        <div class="activity-info">
          <div class="activity-title">${a.type}</div>
          <div class="activity-meta">
            ${a.km > 0 ? `${a.km}km · ` : ''}
            ${a.hours > 0 ? `${a.hours}h · ` : ''}
            <span class="co2-tag">-${a.co2_saved}kg CO₂</span>
            <span class="points-tag">+${a.points}pt</span>
          </div>
          ${a.note ? `<div class="activity-note">📝 ${a.note}</div>` : ''}
          <div class="activity-date">${new Date(a.date).toLocaleDateString('it-IT')}</div>
        </div>
      </div>
    `).join('');
}

// ─── BADGES ──────────────────────────────────────

async function loadBadges() {
  const badges = await api('/api/badges');
  const grid = document.getElementById('badgeGrid');
  const unlocked = badges.filter(b => b.unlocked).length;
  document.getElementById('statBadges').textContent = unlocked;
  grid.innerHTML = badges.map(b => `
    <div class="badge-card ${b.unlocked ? 'unlocked' : 'locked'}">
      <div class="badge-icon">${b.icon}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');
}

// ─── CHALLENGES ──────────────────────────────────

function showNewChallenge() {
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
  if (data.error) return showNotif(data.error, 'error');
  showNotif('✅ Sfida creata!', 'success');
  document.getElementById('newChallengeForm').style.display = 'none';
  loadChallenges();
}

async function loadChallenges() {
  const challenges = await api('/api/challenges');
  document.getElementById('challengeList').innerHTML = challenges.map(c => `
    <div class="challenge-item">
      <div class="challenge-icon">🚀</div>
      <div class="challenge-info">
        <h4>${c.title} ${c.is_public ? '🌍' : '🔒'}</h4>
        <p>${c.description}</p>
        <div class="challenge-meta">
          🎯 Target: ${c.co2_target}kg CO₂ · 
          🏆 Reward: ${c.points_reward}pt · 
          📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}
        </div>
      </div>
    </div>
  `).join('') || '<p class="empty">Nessuna sfida</p>';
}

// ─── LEADERBOARD ─────────────────────────────────

async function loadLeaderboard() {
  const board = await api('/api/leaderboard');
  document.getElementById('leaderboardList').innerHTML = board.map((u, i) => `
    <div class="leaderboard-item ${i < 3 ? 'top-' + (i + 1) : ''}">
      <span class="rank">${['🥇','🥈','🥉'][i] || `#${u.rank}`}</span>
      <span class="lb-name">${u.name}</span>
      <span class="lb-co2">${parseFloat(u.co2_saved).toFixed(1)}kg</span>
      <span class="lb-points">${u.points}pt</span>
    </div>
  `).join('');
}

// ─── YEARLY ──────────────────────────────────────

async function loadYearly() {
  const data = await api('/api/yearly');
  document.getElementById('yearlyList').innerHTML = data.length === 0
    ? '<p class="empty">Nessun dato per quest\'anno</p>'
    : data.map(m => `
      <div class="yearly-item">
        <span class="month">${m.month}</span>
        <div class="yearly-bar">
          <div class="yearly-fill" style="width: ${Math.min(m.co2 * 2, 100)}%"></div>
        </div>
        <span class="yearly-co2">${parseFloat(m.co2).toFixed(1)}kg</span>
        <span class="yearly-pts">${m.points}pt</span>
      </div>
    `).join('');
}

// ─── TABS ────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  event.currentTarget.classList.add('active');
}

// ─── NOTIFICHE ───────────────────────────────────

function showNotif(msg, type = 'success') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = `notification ${type}`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

// ─── INIT ────────────────────────────────────────

window.onload = () => {
  if (token) {
    const payload = JSON.parse(atob(token.split('.')[1]));
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('userName').textContent = payload.email;
    loadAll();
  }
};
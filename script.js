// ══════════════════════════════════════════
//   ECOTRACK — script.js
// ══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

let token   = localStorage.getItem('ecotoken');
let curAct  = null;
let curS    = 1;
let isAdmin = false;

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
  yearly:      ['Riepilogo Annuale', 'Il tuo andamento nel 2026'],
  admin:       ['Admin Panel',       'Gestisci utenti e attività del team']
};

// ══════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════
function openTut() {
  document.getElementById('tut').style.display = 'flex';
  goS(1);
}

function skipTut() {
  document.getElementById('tut').style.display = 'none';
  localStorage.setItem('tutDone', '1');
}

function goS(n) {
  curS = n;
  document.querySelectorAll('.tut-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`[data-s="${n}"]`).classList.add('active');
  document.querySelectorAll('.tut-dot').forEach((d, i) => d.classList.toggle('active', i === n - 1));
  const prev = document.getElementById('tPrev');
  const next = document.getElementById('tNext');
  prev.style.opacity       = n === 1 ? '0' : '1';
  prev.style.pointerEvents = n === 1 ? 'none' : 'auto';
  next.textContent = n === 4 ? '🚀 Inizia!' : 'Avanti →';
}

function nextS() { if (curS === 4) { skipTut(); return; } goS(curS + 1); }
function prevS() { if (curS > 1) goS(curS - 1); }

// Esponi globalmente per onclick inline nell'HTML
window.openTut = openTut;
window.skipTut = skipTut;
window.goS     = goS;
window.nextS   = nextS;
window.prevS   = prevS;

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
function switchAuth(t) {
  document.getElementById('fLogin').style.display = t === 'login'    ? 'flex' : 'none';
  document.getElementById('fReg').style.display   = t === 'register' ? 'flex' : 'none';
  document.getElementById('tLogin').classList.toggle('active', t === 'login');
  document.getElementById('tReg').classList.toggle('active',   t === 'register');
}

function toggleEye(id) {
  const e = document.getElementById(id);
  e.type = e.type === 'password' ? 'text' : 'password';
}

function chkPw() {
  const v = document.getElementById('rPw').value;
  const s = (id, ok) => document.getElementById(id).classList.toggle('ok', ok);
  s('h1', v.length >= 8);
  s('h2', /[A-Z]/.test(v));
  s('h3', /\d/.test(v));
  s('h4', /[!@#$%^&*]/.test(v));
}

async function doLogin() {
  const eEl = document.getElementById('lEmail');
  const pEl = document.getElementById('lPw');
  if (!eEl || !pEl) return;
  const e = eEl.value.trim();
  const p = pEl.value;
  if (!e || !p) return setErr('lErr', 'Compila tutti i campi');
  const btn = document.querySelector('#fLogin .btn-auth');
  setLoading(btn, true, 'Login');
  const d = await post('/api/login', { email: e, password: p });
  setLoading(btn, false, 'Login');
  if (d.error) return setErr('lErr', d.error);
  token = d.token;
  localStorage.setItem('ecotoken', token);
  enterApp(d.user);
}

async function doReg() {
  const nEl = document.getElementById('rName');
  const eEl = document.getElementById('rEmail');
  const pEl = document.getElementById('rPw');
  if (!nEl || !eEl || !pEl) return;
  const n = nEl.value.trim();
  const e = eEl.value.trim();
  const p = pEl.value;
  if (!n || !e || !p) return setErr('rErr', 'Compila tutti i campi');
  const btn = document.querySelector('#fReg .btn-auth');
  setLoading(btn, true, 'Register');
  const d = await post('/api/register', { name: n, email: e, password: p });
  setLoading(btn, false, 'Register');
  if (d.error) return setErr('rErr', d.error);
  token = d.token;
  localStorage.setItem('ecotoken', token);
  enterApp(d.user);
}

function setErr(id, msg) {
  const e = document.getElementById(id);
  if (!e) return;
  e.textContent      = msg;
  e.style.animation  = 'none';
  requestAnimationFrame(() => { e.style.animation = 'shake .4s ease'; });
  setTimeout(() => e.textContent = '', 4000);
}

function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled      = loading;
  btn.style.opacity = loading ? '.7' : '1';
  const span = btn.querySelector('span');
  if (span) span.textContent = loading ? 'Caricamento...' : label;
}

function logout() {
  localStorage.removeItem('ecotoken');
  location.reload();
}

function enterApp(u) {
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('app').style.display      = 'flex';
  if (window.innerWidth <= 768) document.getElementById('mobNav').style.display = 'flex';
  document.getElementById('sbAv').textContent    = (u.name || u.email || 'U')[0].toUpperCase();
  document.getElementById('sbEmail').textContent = u.email || '';
  initAdmin(u);
  loadAll();
  if (!localStorage.getItem('tutDone')) openTut();
}

window.switchAuth = switchAuth;
window.toggleEye  = toggleEye;
window.chkPw      = chkPw;
window.doLogin    = doLogin;
window.doReg      = doReg;
window.logout     = logout;

// ══════════════════════════════════════════
//   ADMIN INIT
// ══════════════════════════════════════════
function initAdmin(u) {
  isAdmin = !!u.is_admin;
  const nameEl = document.getElementById('sbName');
  nameEl.innerHTML = (u.name || u.email) + (isAdmin ? ' <span class="admin-badge">👑</span>' : '');
  const av = document.getElementById('sbAv');
  if (isAdmin) av.classList.add('is-admin');
  document.getElementById('adminSbBtn').style.display  = isAdmin ? 'flex' : 'none';
  document.getElementById('adminMobBtn').style.display = isAdmin ? 'flex' : 'none';
}

// ══════════════════════════════════════════
//   API HELPERS
// ══════════════════════════════════════════
async function api(url, method = 'GET', body = null) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : null
    });
    return res.json();
  } catch (err) {
    showN('❌ Errore di rete', 'error');
    return { error: err.message };
  }
}

async function post(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  } catch (err) {
    showN('❌ Errore di rete', 'error');
    return { error: err.message };
  }
}

// ══════════════════════════════════════════
//   LOAD ALL
// ══════════════════════════════════════════
function loadAll() {
  loadStats();
  loadActs();
  loadBadges();
  loadLb();
  loadYearly();
  loadCh();
}

// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
async function loadStats() {
  const d = await api('/api/stats');
  if (!d || d.error) return;
  anim('sCO2',  parseFloat(d.co2_week || 0),      1);
  anim('sPts',  parseInt(d.points || 0),           0);
  anim('sActs', parseInt(d.total_activities || 0), 0);
}

function anim(id, target, dec) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur = 900;
  const t0  = performance.now();
  const upd = now => {
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = (e * target).toFixed(dec);
    if (p < 1) requestAnimationFrame(upd);
  };
  requestAnimationFrame(upd);
}

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
function selAct(type, btn) {
  curAct = type;
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const r    = RATES[type];
  const form = document.getElementById('logForm');
  form.style.display = 'block';
  document.getElementById('logTitle').textContent = `${ICONS[type]} Stai registrando: ${type}`;
  document.getElementById('kmRow').style.display  = r.t === 'k' ? 'block' : 'none';
  document.getElementById('hrRow').style.display  = r.t === 'h' ? 'block' : 'none';
  document.getElementById('cpRow').style.display  = type === 'Carpooling' ? 'block' : 'none';
  ['iKm', 'iHr', 'iNote', 'iCp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  updPreview();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updPreview() {
  if (!curAct) return;
  const r   = RATES[curAct];
  const km  = parseFloat(document.getElementById('iKm').value) || 0;
  const hr  = parseFloat(document.getElementById('iHr').value) || 0;
  const val = r.t === 'k' ? km : hr;
  document.getElementById('pCO2').textContent = (val * r.co2).toFixed(2);
  document.getElementById('pPts').textContent = Math.round(val * r.pts);
}

function cancelAct() {
  const form = document.getElementById('logForm');
  form.style.opacity   = '0';
  form.style.transform = 'translateY(-8px)';
  setTimeout(() => {
    form.style.display   = 'none';
    form.style.opacity   = '';
    form.style.transform = '';
  }, 200);
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('sel'));
  curAct = null;
}

async function saveAct() {
  const km   = parseFloat(document.getElementById('iKm').value)  || 0;
  const hr   = parseFloat(document.getElementById('iHr').value)  || 0;
  const note = document.getElementById('iNote').value;
  const cpEl = document.getElementById('iCp');
  const cp   = cpEl ? cpEl.value : '';
  const r    = RATES[curAct];
  if (r.t === 'k' && km === 0) return showN('⚠️ Inserisci i km!', 'error');
  if (r.t === 'h' && hr === 0) return showN('⚠️ Inserisci le ore!', 'error');
  const btn = document.querySelector('#logForm .btn-save');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Salvataggio...'; }
  const d = await api('/api/activity', 'POST', { type: curAct, km, hours: hr, note, carsharing_with: cp });
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i>Salva'; }
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN(`✅ +${d.points} punti! 🌱 ${d.co2_saved}kg CO₂ salvata`, 'success');
  cancelAct();
  loadAll();
}

function actHTML(acts) {
  if (!acts || !acts.length) return `
    <div class="empty">
      <div class="ei">🌱</div>
      <p>Nessuna attività ancora.<br>Inizia a tracciare il tuo impatto!</p>
    </div>`;
  return acts.map((a, i) => `
    <div class="act-item" style="animation:fadeSlide .3s ease ${i * 0.05}s both">
      <div class="act-icon-wrap">${ICONS[a.type] || '📌'}</div>
      <div class="act-detail">
        <div class="act-name">${a.type}</div>
        <div class="act-sub">
          ${[
            a.km    > 0 ? a.km    + ' km'  : '',
            a.hours > 0 ? a.hours + ' ore' : '',
            a.note  || ''
          ].filter(Boolean).join(' · ')}
        </div>
        <div class="act-sub">
          ${new Date(a.date).toLocaleDateString('it-IT', {
            day: '2-digit', month: 'short', year: 'numeric'
          })}
        </div>
      </div>
      <div class="act-tags">
        <span class="tag tag-g">-${a.co2_saved} kg</span>
        <span class="tag tag-y">+${a.points} pt</span>
      </div>
    </div>`).join('');
}

async function loadActs() {
  const acts = await api('/api/activities');
  const html = actHTML(!acts || acts.error ? [] : acts);
  document.getElementById('recentActs').innerHTML = html;
  document.getElementById('allActs').innerHTML    = html;
}

window.selAct     = selAct;
window.updPreview = updPreview;
window.cancelAct  = cancelAct;
window.saveAct    = saveAct;

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
async function loadBadges() {
  const bs = await api('/api/badges');
  if (!bs || bs.error) return;
  document.getElementById('sBadges').textContent = bs.filter(b => b.unlocked).length;
  document.getElementById('badgeList').innerHTML  = bs.map((b, i) => `
    <div class="badge-item ${b.unlocked ? 'on' : 'off'}"
         style="animation:fadeSlide .3s ease ${i * 0.07}s both">
      <div class="badge-icon">${b.icon}</div>
      <div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
function togCh() {
  const f       = document.getElementById('chForm');
  const visible = f.style.display !== 'none';
  if (visible) {
    f.style.opacity   = '0';
    f.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      f.style.display   = 'none';
      f.style.opacity   = '';
      f.style.transform = '';
    }, 200);
  } else {
    f.style.display = 'block';
  }
}

async function createCh() {
  const title  = document.getElementById('cTitle').value.trim();
  const target = parseFloat(document.getElementById('cTarget').value);
  const points = parseInt(document.getElementById('cPoints').value);
  const date   = document.getElementById('cDate').value;
  if (!title || !target || !points || !date) return showN('⚠️ Compila tutti i campi!', 'error');
  const d = await api('/api/challenges', 'POST', {
    title,
    description:   document.getElementById('cDesc').value,
    co2_target:    target,
    points_reward: points,
    end_date:      date,
    is_public:     document.getElementById('cPub').checked
  });
  if (d.error) return showN('❌ ' + d.error, 'error');
  showN('🚀 Sfida creata!', 'success');
  togCh();
  loadCh();
}

async function loadCh() {
  const list = await api('/api/challenges');
  document.getElementById('chList').innerHTML = !list || list.error || list.length === 0
    ? `<div class="empty"><div class="ei">🔥</div><p>Nessuna sfida ancora.<br>Creane una per motivare il team!</p></div>`
    : list.map((c, i) => `
      <div class="ch-item" style="animation:fadeSlide .3s ease ${i * 0.06}s both">
        <div class="ch-ico">🚀</div>
        <div class="ch-info">
          <h4>${c.title} ${c.is_public ? '🌍' : '🔒'}</h4>
          <p>${c.description || ''}</p>
          <div class="ch-tags">
            <span class="ch-tag">🎯 ${c.co2_target} kg CO₂</span>
            <span class="ch-tag">🏆 ${c.points_reward} pt</span>
            <span class="ch-tag">📅 ${new Date(c.end_date).toLocaleDateString('it-IT')}</span>
          </div>
        </div>
      </div>`).join('');
}

window.togCh    = togCh;
window.createCh = createCh;

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
async function loadLb() {
  const b = await api('/api/leaderboard');
  if (!b || b.error) return;
  document.getElementById('lbList').innerHTML = b.map((u, i) => `
    <div class="lb-row ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''}"
         style="animation:fadeSlide .3s ease ${i * 0.06}s both">
      <span class="lb-rank">${['🥇','🥈','🥉'][i] || '#' + (i + 1)}</span>
      <div class="lb-av">${(u.name || u.email || '?')[0].toUpperCase()}</div>
      <span class="lb-name">${u.name || u.email}</span>
      <span class="lb-co2">${parseFloat(u.co2_saved || 0).toFixed(1)} kg</span>
      <span class="lb-pts">${u.points || 0} pt</span>
    </div>`).join('');
}

// ══════════════════════════════════════════
//   YEARLY
// ══════════════════════════════════════════
async function loadYearly() {
  const data = await api('/api/yearly');
  if (!data || data.error) return;
  const max = Math.max(...data.map(d => parseFloat(d.co2) || 0), 1);
  document.getElementById('yrList').innerHTML = data.length === 0
    ? `<div class="empty"><div class="ei">📅</div><p>Nessun dato per quest'anno ancora.</p></div>`
    : data.map((m, i) => `
      <div class="yr-row" style="animation:fadeSlide .3s ease ${i * 0.05}s both">
        <span class="yr-month">${m.month}</span>
        <div class="yr-bar">
          <div class="yr-fill" style="width:${Math.round(parseFloat(m.co2) / max * 100)}%"></div>
        </div>
        <span class="yr-co2">${parseFloat(m.co2).toFixed(1)} kg</span>
        <span class="yr-pts">${m.points} pt</span>
      </div>`).join('');
}

// ══════════════════════════════════════════
//   TABS
// ══════════════════════════════════════════
function goTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.sb-btn, .mn-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const [t, s] = TABS[tab] || ['', ''];
  document.getElementById('pageTitle').textContent = t;
  document.getElementById('pageSub').textContent   = s;
  if (tab === 'admin') loadAdminUsers();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.goTab = goTab;

// ══════════════════════════════════════════
//   ADMIN PANEL
// ══════════════════════════════════════════
async function loadAdminUsers() {
  const users = await api('/api/admin/users');
  if (!users || users.error) return showN('❌ ' + (users?.error || 'Errore'), 'error');

  const totalCo2  = users.reduce((s, u) => s + parseFloat(u.co2_saved   || 0), 0);
  const totalActs = users.reduce((s, u) => s + parseInt(u.activity_count || 0), 0);
  const admins    = users.filter(u => u.is_admin).length;

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card sc-blue" style="margin:0">
      <div class="stat-top">
        <div class="stat-icon"><i class="fas fa-users"></i></div>
        <span class="stat-badge">registrati</span>
      </div>
      <div class="stat-val">${users.length}</div>
      <div class="stat-lbl">Utenti totali · ${admins} admin</div>
      <div class="stat-glow g-blue"></div>
    </div>
    <div class="stat-card sc-green" style="margin:0">
      <div class="stat-top">
        <div class="stat-icon"><i class="fas fa-cloud"></i></div>
        <span class="stat-badge">team</span>
      </div>
      <div class="stat-val">${totalCo2.toFixed(1)}</div>
      <div class="stat-lbl">kg CO₂ totali</div>
      <div class="stat-glow g-green"></div>
    </div>
    <div class="stat-card sc-yellow" style="margin:0">
      <div class="stat-top">
        <div class="stat-icon"><i class="fas fa-tasks"></i></div>
        <span class="stat-badge">totali</span>
      </div>
      <div class="stat-val">${totalActs}</div>
      <div class="stat-lbl">Attività team</div>
      <div class="stat-glow g-yellow"></div>
    </div>`;

  document.getElementById('adminTbody').innerHTML = users.length === 0
    ? `<tr><td colspan="6">
        <div class="empty"><div class="ei">👥</div><p>Nessun utente trovato.</p></div>
       </td></tr>`
    : users.map((u, i) => `
      <tr style="animation:fadeSlide .25s ease ${i * 0.04}s both">
        <td>
          <div class="u-info">
            <div class="u-av ${u.is_admin ? 'is-admin' : ''}">
              ${(u.name || u.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <div class="u-name">${u.name || '—'}</div>
              <div class="u-email">${u.email}</div>
            </div>
          </div>
        </td>
        <td style="font-weight:700;color:var(--text2)">${u.activity_count}</td>
        <td><span class="pill pill-yellow">⭐ ${u.points}</span></td>
        <td><span class="pill pill-green">🌱 ${parseFloat(u.co2_saved || 0).toFixed(1)} kg</span></td>
        <td>
          ${u.is_admin
            ? '<span class="pill pill-yellow">👑 Admin</span>'
            : '<span class="pill pill-gray">👤 User</span>'}
        </td>
        <td>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn-icon" title="Vedi attività"
              onclick="openActsModal(${u.id}, '${esc(u.name || u.email)}')">
              <i class="fas fa-list"></i>
            </button>
            <button class="btn-icon crown"
              title="${u.is_admin ? 'Rimuovi admin' : 'Promuovi admin'}"
              onclick="toggleAdmin(${u.id}, ${!u.is_admin}, '${esc(u.name || u.email)}')">
              <i class="fas fa-crown"></i>
            </button>
            <button class="btn-icon del" title="Elimina utente"
              onclick="deleteUser(${u.id}, '${esc(u.name || u.email)}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`).join('');
}

function esc(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function openActsModal(userId, userName) {
  document.getElementById('actsModalTitle').textContent = `Attività di ${userName}`;
  document.getElementById('actsModalBody').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:36px;gap:12px;color:var(--muted)">
      <i class="fas fa-spinner fa-spin" style="font-size:20px"></i>
      <span style="font-size:14px;font-weight:600">Caricamento...</span>
    </div>`;
  document.getElementById('actsModal').style.display = 'flex';
  const acts = await api(`/api/admin/activities/${userId}`);
  if (!acts || acts.error) {
    document.getElementById('actsModalBody').innerHTML =
      `<div class="empty"><div class="ei">❌</div><p>Errore nel caricamento.</p></div>`;
    return;
  }
  document.getElementById('actsModalBody').innerHTML = acts.length === 0
    ? `<div class="empty"><div class="ei">📋</div><p>Nessuna attività per questo utente.</p></div>`
    : acts.map((a, i) => `
      <div class="adm-act-item" id="aai-${a.id}"
           style="animation:fadeSlide .25s ease ${i * 0.04}s both">
        <div style="font-size:26px;flex-shrink:0">${ICONS[a.type] || '📌'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${a.type}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            ${[
              a.km    > 0 ? a.km    + ' km'  : '',
              a.hours > 0 ? a.hours + ' ore' : '',
              a.note  || ''
            ].filter(Boolean).join(' · ')}
          </div>
          <div style="font-size:11px;color:var(--muted2);margin-top:2px">
            ${new Date(a.date).toLocaleDateString('it-IT', {
              day: '2-digit', month: 'short', year: 'numeric'
            })}
          </div>
        </div>
        <span class="pill pill-green" style="margin-right:5px;flex-shrink:0">
          -${a.co2_saved} kg
        </span>
        <span class="pill pill-yellow" style="margin-right:8px;flex-shrink:0">
          +${a.points} pt
        </span>
        <button class="adm-act-del" onclick="deleteActivity(${a.id})" title="Elimina">
          <i class="fas fa-trash"></i>
        </button>
      </div>`).join('');
}

function closeActsModal(e) {
  if (!e || e.target === document.getElementById('actsModal')) {
    document.getElementById('actsModal').style.display = 'none';
  }
}

async function deleteActivity(id) {
  showConfirm(
    '🗑️',
    'Elimina attività',
    'I punti e la CO₂ verranno sottratti dall\'utente. Azione irreversibile.',
    async () => {
      const d = await api(`/api/admin/activity/${id}`, 'DELETE');
      if (d.error) return showN('❌ ' + d.error, 'error');
      const el = document.getElementById(`aai-${id}`);
      if (el) {
        el.style.transition = 'all .3s ease';
        el.style.opacity    = '0';
        el.style.transform  = 'translateX(20px)';
        setTimeout(() => el.remove(), 320);
      }
      showN('✅ Attività eliminata!', 'success');
      loadAdminUsers();
    }
  );
}

async function toggleAdmin(userId, makeAdmin, name) {
  showConfirm(
    makeAdmin ? '👑' : '👤',
    makeAdmin ? `Promuovi "${name}" ad Admin` : `Rimuovi Admin a "${name}"`,
    makeAdmin
      ? 'Questo utente potrà accedere al pannello admin e gestire gli altri utenti.'
      : 'Questo utente perderà l\'accesso al pannello admin e tutti i privilegi.',
    async () => {
      const d = await api(`/api/admin/user/${userId}/role`, 'PATCH', { is_admin: makeAdmin });
      if (d.error) return showN('❌ ' + d.error, 'error');
      showN(makeAdmin ? '👑 Utente promosso ad Admin!' : '👤 Privilegi rimossi', 'info');
      loadAdminUsers();
    }
  );
}

async function deleteUser(userId, name) {
  showConfirm(
    '💀',
    `Elimina "${name}"`,
    `Tutti i dati di ${name} verranno eliminati permanentemente. Azione irreversibile.`,
    async () => {
      const d = await api(`/api/admin/user/${userId}`, 'DELETE');
      if (d.error) return showN('❌ ' + d.error, 'error');
      showN('🗑️ Utente eliminato', 'success');
      loadAdminUsers();
    }
  );
}

window.loadAdminUsers = loadAdminUsers;
window.openActsModal  = openActsModal;
window.closeActsModal = closeActsModal;
window.deleteActivity = deleteActivity;
window.toggleAdmin    = toggleAdmin;
window.deleteUser     = deleteUser;

// ══════════════════════════════════════════
//   CONFIRM MODAL
// ══════════════════════════════════════════
function showConfirm(icon, title, msg, callback) {
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  document.getElementById('confirmYes').onclick = async () => {
    closeConfirm();
    await callback();
  };
  document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
}

window.closeConfirm = closeConfirm;

// ESC chiude tutto
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeConfirm();
    document.getElementById('actsModal').style.display    = 'none';
    if (document.getElementById('tut').style.display !== 'none') skipTut();
  }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
let notifTimer = null;

function showN(msg, type = 'success') {
  const el = document.getElementById('notif');
  if (notifTimer) clearTimeout(notifTimer);
  el.textContent = msg;
  el.className   = `notif ${type} show`;
  notifTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

// ══════════════════════════════════════════
//   RESIZE
// ══════════════════════════════════════════
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const mob        = document.getElementById('mobNav');
    const appVisible = document.getElementById('app').style.display !== 'none';
    if (mob && appVisible) {
      mob.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
    }
  }, 100);
});

// ══════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════
if (token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('ecotoken');
    } else {
      document.getElementById('authWrap').style.display = 'none';
      document.getElementById('app').style.display      = 'flex';
      if (window.innerWidth <= 768) document.getElementById('mobNav').style.display = 'flex';
      document.getElementById('sbAv').textContent    = (payload.name || payload.email || 'U')[0].toUpperCase();
      document.getElementById('sbEmail').textContent = payload.email || '';
      initAdmin(payload);
      loadAll();
    }
  } catch {
    localStorage.removeItem('ecotoken');
  }
}

}); // ← chiude DOMContentLoaded

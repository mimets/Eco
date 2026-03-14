'use strict';

const express    = require('express');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const { Pool }   = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════
//   DATABASE
// ══════════════════════════════════════════
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ══════════════════════════════════════════
//   MIDDLEWARE
// ══════════════════════════════════════════
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════
//   DB INIT
// ══════════════════════════════════════════
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      points INTEGER DEFAULT 0,
      co2saved REAL DEFAULT 0,
      totalactivities INTEGER DEFAULT 0,
      isadmin INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      verifytoken TEXT,
      resettoken TEXT,
      resetexpiry BIGINT,
      avatarcolor TEXT DEFAULT '16a34a',
      avatarskin TEXT DEFAULT 'fde68a',
      avatareyes TEXT DEFAULT 'normal',
      avatarmouth TEXT DEFAULT 'smile',
      avatarhair TEXT DEFAULT 'none',
      owneditems TEXT DEFAULT '[]',
      createdat TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      userid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      km REAL DEFAULT 0,
      hours REAL DEFAULT 0,
      co2saved REAL DEFAULT 0,
      points INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      fromaddr TEXT DEFAULT '',
      toaddr TEXT DEFAULT '',
      date TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      creatorid INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      co2target REAL DEFAULT 0,
      pointsreward INTEGER DEFAULT 0,
      enddate TEXT,
      ispublic INTEGER DEFAULT 1,
      createdat TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS socialposts (
      id SERIAL PRIMARY KEY,
      userid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      imageurl TEXT DEFAULT '',
      likes TEXT DEFAULT '[]',
      createdat TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      postid INTEGER NOT NULL REFERENCES socialposts(id) ON DELETE CASCADE,
      userid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      createdat TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS follows (
      followerid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followingid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (followerid, followingid)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      userid INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      icon TEXT DEFAULT '',
      read INTEGER DEFAULT 0,
      createdat TEXT DEFAULT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shopitems (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      cost INTEGER DEFAULT 100,
      israre INTEGER DEFAULT 0
    )
  `);

  // Seed shop se vuoto
  const { rows: countRows } = await db.query('SELECT COUNT(*) as c FROM shopitems');
  if (parseInt(countRows[0].c) === 0) await seedShop();

  console.log('✅ Database inizializzato');
}

async function seedShop() {
  const items = [
    // capelli
    { name: 'Rainbow Hair', description: 'Capelli arcobaleno magici',   category: 'hair',  emoji: '🌈', cost: 300, israre: 1 },
    { name: 'Gold Hair',    description: 'Capelli dorati brillanti',    category: 'hair',  emoji: '✨', cost: 500, israre: 1 },
    { name: 'Galaxy Hair',  description: 'Capelli galassia cosmica',    category: 'hair',  emoji: '🌌', cost: 800, israre: 1 },
    { name: 'Flame Hair',   description: 'Capelli di fuoco ardente',    category: 'hair',  emoji: '🔥', cost: 600, israre: 1 },
    // occhi
    { name: 'Star Eyes',    description: 'Occhi a forma di stella',     category: 'eyes',  emoji: '⭐', cost: 200, israre: 0 },
    { name: 'Heart Eyes',   description: 'Occhi a forma di cuore',      category: 'eyes',  emoji: '❤️', cost: 200, israre: 0 },
    { name: 'Laser Eyes',   description: 'Occhi laser rossi',           category: 'eyes',  emoji: '🔴', cost: 400, israre: 1 },
    // bocca
    { name: 'Rainbow Mouth',description: 'Sorriso arcobaleno',          category: 'mouth', emoji: '🌈', cost: 250, israre: 0 },
    { name: 'Fire Mouth',   description: 'Bocca di fuoco',              category: 'mouth', emoji: '🔥', cost: 350, israre: 1 },
    // colori
    { name: 'Viola Reale',  description: 'Colore viola elegante',       category: 'color', emoji: '💜', cost: 150, israre: 0 },
    { name: 'Rosso Fuoco',  description: 'Colore rosso intenso',        category: 'color', emoji: '❤️', cost: 150, israre: 0 },
    { name: 'Oro Puro',     description: 'Colore oro lussuoso',         category: 'color', emoji: '🥇', cost: 400, israre: 1 },
  ];
  for (const i of items) {
    await db.query(
      'INSERT INTO shopitems (name,description,category,emoji,cost,israre) VALUES ($1,$2,$3,$4,$5,$6)',
      [i.name, i.description, i.category, i.emoji, i.cost, i.israre]
    );
  }
  console.log('🛍️ Shop seeded');
}

// ══════════════════════════════════════════
//   EMAIL
// ══════════════════════════════════════════
function getMailer() {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  return nodemailer.createTransport({
    service: process.env.MAIL_SERVICE || 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
  });
}

async function sendVerifyEmail(email, token) {
  const mailer = getMailer();
  if (!mailer) { console.log('DEV Verify token for', email, token); return; }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}/api/verify?token=${token}`;
  await mailer.sendMail({
    from: `EcoTrack <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Verifica il tuo account EcoTrack',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:40px;background:#f0fdf4;border-radius:16px">
      <h1 style="color:#16a34a">EcoTrack</h1><h2>Verifica il tuo account</h2>
      <p>Clicca il bottone per verificare la tua email</p>
      <a href="${url}" style="display:inline-block;padding:14px 28px;background:#16a34a;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0">Verifica Email</a>
      <p style="color:#64748b;font-size:13px">Se non hai creato un account ignora questa email.</p>
    </div>`
  });
}

async function sendResetEmail(email, token) {
  const mailer = getMailer();
  if (!mailer) { console.log('DEV Reset token for', email, token); return; }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}?action=reset&token=${token}`;
  await mailer.sendMail({
    from: `EcoTrack <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Reset password EcoTrack',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:40px;background:#f0fdf4;border-radius:16px">
      <h1 style="color:#16a34a">EcoTrack</h1><h2>Reset della password</h2>
      <p>Clicca il bottone per reimpostare la password</p>
      <a href="${url}" style="display:inline-block;padding:14px 28px;background:#ef4444;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0">Reimposta Password</a>
      <p style="color:#64748b;font-size:13px">Il link scade tra 1 ora.</p>
    </div>`
  });
}

// ══════════════════════════════════════════
//   AUTH MIDDLEWARE
// ══════════════════════════════════════════
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET || 'ecotracksecret2024');
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

async function adminAuth(req, res, next) {
  auth(req, res, async () => {
    const { rows } = await db.query('SELECT isadmin FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0]?.isadmin) return res.status(403).json({ error: 'Accesso negato' });
    next();
  });
}

// ══════════════════════════════════════════
//   CO2 CALCULATOR
// ══════════════════════════════════════════
function calcCo2(type, km, hours) {
  const factors = { Bici: 0.21, Treno: 0.14, Bus: 0.10, Carpooling: 0.08, Remoto: 2.5, Videocall: 1.8 };
  const f = factors[type] || 0;
  if (['Remoto', 'Videocall'].includes(type)) return parseFloat((f * (hours || 0)).toFixed(2));
  return parseFloat((f * (km || 0)).toFixed(2));
}
function calcPoints(co2) { return Math.max(1, Math.round(co2 * 10)); }

// ══════════════════════════════════════════
//   AUTH ROUTES
// ══════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password)
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });

    const { rows: ex } = await db.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (ex.length) return res.status(400).json({ error: 'Email o username già in uso' });

    const hash  = bcrypt.hashSync(password, 10);
    const vTok  = crypto.randomBytes(32).toString('hex');
    await db.query(
      'INSERT INTO users (name,username,email,password,verifytoken,verified) VALUES ($1,$2,$3,$4,$5,0)',
      [name, username.toLowerCase(), email.toLowerCase(), hash, vTok]
    );
    sendVerifyEmail(email.toLowerCase(), vTok).catch(console.error);
    return res.json({ ok: true, message: 'Registrazione completata! Controlla la tua email.' });
  } catch (err) { console.error('Register error', err); return res.status(500).json({ error: 'Errore interno del server' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Campi mancanti' });

    const { rows } = await db.query(
      'SELECT * FROM users WHERE email=$1 OR username=$1',
      [identifier.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Credenziali non valide' });
    if (!user.verified) return res.status(400).json({ error: 'Email non verificata. Controlla la tua casella.', needsVerify: true });
    if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Credenziali non valide' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'ecotracksecret2024', { expiresIn: '30d' });
    let owned = []; try { owned = JSON.parse(user.owneditems); } catch {}
    return res.json({
      token,
      user: {
        id: user.id, name: user.name, username: user.username, email: user.email, bio: user.bio || '',
        points: user.points || 0, co2saved: user.co2saved || 0, totalactivities: user.totalactivities || 0,
        isadmin: user.isadmin || 0, avatarcolor: user.avatarcolor || '16a34a', avatarskin: user.avatarskin || 'fde68a',
        avatareyes: user.avatareyes || 'normal', avatarmouth: user.avatarmouth || 'smile',
        avatarhair: user.avatarhair || 'none', owneditems: owned
      }
    });
  } catch (err) { console.error('Login error', err); return res.status(500).json({ error: 'Errore interno del server' }); }
});

app.get('/api/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Token mancante');
    const { rows } = await db.query('SELECT id FROM users WHERE verifytoken=$1', [token]);
    if (!rows.length) return res.status(400).send('Token non valido o già usato');
    await db.query('UPDATE users SET verified=1, verifytoken=NULL WHERE id=$1', [rows[0].id]);
    return res.redirect('/?verified=1');
  } catch (err) { console.error('Verify error', err); return res.status(500).send('Errore server'); }
});

app.post('/api/resend-verify', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email mancante' });
    const { rows } = await db.query('SELECT id, verified FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!rows.length) return res.status(400).json({ error: 'Email non trovata' });
    if (rows[0].verified) return res.status(400).json({ error: 'Account già verificato' });
    const vTok = crypto.randomBytes(32).toString('hex');
    await db.query('UPDATE users SET verifytoken=$1 WHERE id=$2', [vTok, rows[0].id]);
    sendVerifyEmail(email.toLowerCase(), vTok).catch(console.error);
    return res.json({ ok: true });
  } catch (err) { console.error('Resend verify error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email mancante' });
    const { rows } = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!rows.length) return res.json({ ok: true });
    const rTok  = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600000;
    await db.query('UPDATE users SET resettoken=$1, resetexpiry=$2 WHERE id=$3', [rTok, expiry, rows[0].id]);
    sendResetEmail(email.toLowerCase(), rTok).catch(console.error);
    return res.json({ ok: true });
  } catch (err) { console.error('Forgot password error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, newpassword } = req.body;
    if (!token || !newpassword) return res.status(400).json({ error: 'Dati mancanti' });
    const { rows } = await db.query('SELECT id, resetexpiry FROM users WHERE resettoken=$1', [token]);
    if (!rows.length) return res.status(400).json({ error: 'Token non valido' });
    if (Date.now() > rows[0].resetexpiry) return res.status(400).json({ error: 'Token scaduto' });
    const hash = bcrypt.hashSync(newpassword, 10);
    await db.query('UPDATE users SET password=$1, resettoken=NULL, resetexpiry=NULL WHERE id=$2', [hash, rows[0].id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Reset password error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   PROFILE ROUTES
// ══════════════════════════════════════════
app.get('/api/profile', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    const u = rows[0];
    let owned = []; try { owned = JSON.parse(u.owneditems); } catch {}
    return res.json({
      id: u.id, name: u.name, username: u.username, email: u.email, bio: u.bio || '',
      points: u.points || 0, co2saved: u.co2saved || 0, totalactivities: u.totalactivities || 0,
      isadmin: u.isadmin || 0, avatarcolor: u.avatarcolor || '16a34a', avatarskin: u.avatarskin || 'fde68a',
      avatareyes: u.avatareyes || 'normal', avatarmouth: u.avatarmouth || 'smile',
      avatarhair: u.avatarhair || 'none', owneditems: owned
    });
  } catch (err) { console.error('Profile error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, username, bio } = req.body;
    if (!name || !username) return res.status(400).json({ error: 'Nome e username obbligatori' });
    const { rows: ex } = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username.toLowerCase(), req.user.id]);
    if (ex.length) return res.status(400).json({ error: 'Username già in uso' });
    await db.query('UPDATE users SET name=$1, username=$2, bio=$3 WHERE id=$4', [name, username.toLowerCase(), bio || '', req.user.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Update profile error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/profile/avatar', auth, async (req, res) => {
  try {
    const { color, skin, eyes, mouth, hair } = req.body;
    await db.query(
      'UPDATE users SET avatarcolor=$1, avatarskin=$2, avatareyes=$3, avatarmouth=$4, avatarhair=$5 WHERE id=$6',
      [color || '16a34a', skin || 'fde68a', eyes || 'normal', mouth || 'smile', hair || 'none', req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) { console.error('Avatar error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/profile/password', auth, async (req, res) => {
  try {
    const { currentpassword, newpassword } = req.body;
    if (!currentpassword || !newpassword) return res.status(400).json({ error: 'Dati mancanti' });
    const { rows } = await db.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    if (!bcrypt.compareSync(currentpassword, rows[0].password)) return res.status(400).json({ error: 'Password attuale non corretta' });
    const hash = bcrypt.hashSync(newpassword, 10);
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.user.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Change password error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req, res) => {
  try {
    const { rows: u }  = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const { rows: w }  = await db.query(
      "SELECT COALESCE(SUM(co2saved),0) as total FROM activities WHERE userid=$1 AND date >= to_char(NOW() - INTERVAL '7 days', 'YYYY-MM-DD')",
      [req.user.id]
    );
    const { rows: m }  = await db.query(
      "SELECT COALESCE(SUM(co2saved),0) as total FROM activities WHERE userid=$1 AND date >= to_char(date_trunc('month', NOW()), 'YYYY-MM-DD')",
      [req.user.id]
    );
    return res.json({
      co2saved: u[0].co2saved || 0, co2week: parseFloat(w[0].total) || 0,
      co2month: parseFloat(m[0].total) || 0, totalactivities: u[0].totalactivities || 0, points: u[0].points || 0
    });
  } catch (err) { console.error('Stats error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/yearly', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT to_char(TO_DATE(date, 'YYYY-MM-DD'), 'MM') as month,
              COALESCE(SUM(co2saved),0) as co2, COALESCE(SUM(points),0) as pts
       FROM activities
       WHERE userid=$1 AND date >= to_char(NOW() - INTERVAL '12 months', 'YYYY-MM-DD')
       GROUP BY to_char(TO_DATE(date, 'YYYY-MM-DD'), 'MM')
       ORDER BY month`,
      [req.user.id]
    );
    const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const result = months.map((m, i) => {
      const mm  = String(i + 1).padStart(2, '0');
      const row = rows.find(r => r.month === mm);
      return { month: m, co2: row ? parseFloat(row.co2).toFixed(1) : '0.0', pts: row ? row.pts : 0 };
    });
    return res.json(result);
  } catch (err) { console.error('Yearly error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
app.get('/api/activities', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM activities WHERE userid=$1 ORDER BY date DESC LIMIT 50', [req.user.id]);
    return res.json(rows);
  } catch (err) { console.error('Activities error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/activities', auth, async (req, res) => {
  try {
    const { type, km, hours, note, fromaddr, toaddr } = req.body;
    if (!type) return res.status(400).json({ error: 'Tipo mancante' });
    const co2    = calcCo2(type, parseFloat(km) || 0, parseFloat(hours) || 0);
    const points = calcPoints(co2);
    await db.query(
      'INSERT INTO activities (userid,type,km,hours,co2saved,points,note,fromaddr,toaddr) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [req.user.id, type, parseFloat(km) || 0, parseFloat(hours) || 0, co2, points, note || '', fromaddr || '', toaddr || '']
    );
    await db.query(
      'UPDATE users SET co2saved=co2saved+$1, points=points+$2, totalactivities=totalactivities+1 WHERE id=$3',
      [co2, points, req.user.id]
    );
    checkBadges(req.user.id);
    return res.json({ ok: true, co2saved: co2, points });
  } catch (err) { console.error('Log activity error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
const BADGES = [
  { id: 'first',   name: 'Prima Volta',  icon: '🌱', desc: 'Prima attività registrata',    check: (u,a)     => a >= 1 },
  { id: 'eco5',    name: 'Eco x5',       icon: '🚴', desc: '5 attività registrate',         check: (u,a)     => a >= 5 },
  { id: 'eco10',   name: 'Eco x10',      icon: '🏅', desc: '10 attività registrate',        check: (u,a)     => a >= 10 },
  { id: 'eco50',   name: 'Eco x50',      icon: '🏆', desc: '50 attività registrate',        check: (u,a)     => a >= 50 },
  { id: 'co210',   name: '10kg CO₂',     icon: '🌿', desc: '10 kg di CO₂ risparmiati',     check: (u)       => u.co2saved >= 10 },
  { id: 'co250',   name: '50kg CO₂',     icon: '🌳', desc: '50 kg di CO₂ risparmiati',     check: (u)       => u.co2saved >= 50 },
  { id: 'co2100',  name: '100kg CO₂',    icon: '🌲', desc: '100 kg di CO₂ risparmiati',    check: (u)       => u.co2saved >= 100 },
  { id: 'co2500',  name: '500kg CO₂',    icon: '🌍', desc: '500 kg di CO₂ risparmiati',    check: (u)       => u.co2saved >= 500 },
  { id: 'pts100',  name: '100 Punti',    icon: '⭐', desc: '100 punti accumulati',          check: (u)       => u.points >= 100 },
  { id: 'pts500',  name: '500 Punti',    icon: '🌟', desc: '500 punti accumulati',          check: (u)       => u.points >= 500 },
  { id: 'pts1000', name: '1000 Punti',   icon: '💫', desc: '1000 punti accumulati',         check: (u)       => u.points >= 1000 },
  { id: 'pts5000', name: '5000 Punti',   icon: '👑', desc: '5000 punti accumulati',         check: (u)       => u.points >= 5000 },
  { id: 'social1', name: 'Social Starter',icon: '💬',desc: 'Primo post pubblicato',         check: (u,a,p)   => p >= 1 },
  { id: 'shopper', name: 'Shopper',      icon: '🛍️', desc: 'Primo acquisto nello shop',    check: (u,a,p,s) => s >= 1 },
];

async function checkBadges(userId) {
  try {
    const { rows: uRows } = await db.query('SELECT * FROM users WHERE id=$1', [userId]);
    const u    = uRows[0];
    const acts = u.totalactivities || 0;
    const { rows: pRows } = await db.query('SELECT COUNT(*) as c FROM socialposts WHERE userid=$1', [userId]);
    const posts = parseInt(pRows[0].c);
    let owned = []; try { owned = JSON.parse(u.owneditems); } catch {}
    const { rows: nRows } = await db.query("SELECT message FROM notifications WHERE userid=$1 AND icon='🏅'", [userId]);
    const notified = nRows.map(n => n.message);
    for (const b of BADGES) {
      const earned       = b.check(u, acts, posts, owned.length);
      const alreadyNotif = notified.some(n => n.includes(b.name));
      if (earned && !alreadyNotif) {
        await db.query(
          "INSERT INTO notifications (userid,message,icon) VALUES ($1,$2,'🏅')",
          [userId, `Badge sbloccato: ${b.name} — ${b.desc}`]
        );
      }
    }
  } catch (err) { console.error('Badge check error', err); }
}

app.get('/api/badges', auth, async (req, res) => {
  try {
    const { rows: uRows } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const u    = uRows[0];
    const acts = u.totalactivities || 0;
    const { rows: pRows } = await db.query('SELECT COUNT(*) as c FROM socialposts WHERE userid=$1', [req.user.id]);
    const posts = parseInt(pRows[0].c);
    let owned = []; try { owned = JSON.parse(u.owneditems); } catch {}
    return res.json(BADGES.map(b => ({
      id: b.id, name: b.name, icon: b.icon, desc: b.desc,
      unlocked: b.check(u, acts, posts, owned.length)
    })));
  } catch (err) { console.error('Badges error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.get('/api/challenges', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT c.*, u.name as creatorname FROM challenges c LEFT JOIN users u ON u.id=c.creatorid WHERE c.ispublic=1 OR c.creatorid=$1 ORDER BY c.createdat DESC',
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) { console.error('Challenges error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/challenges', auth, async (req, res) => {
  try {
    const { title, description, co2target, pointsreward, enddate, ispublic } = req.body;
    if (!title) return res.status(400).json({ error: 'Titolo obbligatorio' });
    await db.query(
      'INSERT INTO challenges (creatorid,title,description,co2target,pointsreward,enddate,ispublic) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, title, description || '', parseFloat(co2target) || 0, parseInt(pointsreward) || 0, enddate || null, ispublic ? 1 : 0]
    );
    return res.json({ ok: true });
  } catch (err) { console.error('Create challenge error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id,name,username,co2saved,points,avatarcolor,avatarskin,avatareyes,avatarmouth,avatarhair FROM users WHERE verified=1 ORDER BY co2saved DESC LIMIT 50'
    );
    return res.json(rows);
  } catch (err) { console.error('Leaderboard error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════
app.get('/api/social/posts', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.name as authorname, u.username as authorusername,
              u.avatarcolor, u.avatarskin, u.avatareyes, u.avatarmouth, u.avatarhair,
              (SELECT COUNT(*) FROM comments WHERE postid=p.id) as commentscount
       FROM socialposts p JOIN users u ON u.id=p.userid
       ORDER BY p.createdat DESC LIMIT 50`
    );
    const result = rows.map(p => {
      let likes = []; try { likes = JSON.parse(p.likes); } catch {}
      return { ...p, likescount: likes.length, likedbyme: likes.includes(req.user.id), authorid: p.userid };
    });
    return res.json(result);
  } catch (err) { console.error('Posts error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts', auth, async (req, res) => {
  try {
    const { content, imageurl } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Contenuto mancante' });
    await db.query('INSERT INTO socialposts (userid,content,imageurl) VALUES ($1,$2,$3)', [req.user.id, content.trim(), imageurl || '']);
    checkBadges(req.user.id);
    return res.json({ ok: true });
  } catch (err) { console.error('Create post error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/social/posts/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT userid FROM socialposts WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post non trovato' });
    const { rows: u } = await db.query('SELECT isadmin FROM users WHERE id=$1', [req.user.id]);
    if (rows[0].userid !== req.user.id && !u[0].isadmin) return res.status(403).json({ error: 'Non autorizzato' });
    await db.query('DELETE FROM socialposts WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Delete post error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts/:id/like', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM socialposts WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post non trovato' });
    const post = rows[0];
    let likes = []; try { likes = JSON.parse(post.likes); } catch {}
    const idx = likes.indexOf(req.user.id);
    if (idx === -1) {
      likes.push(req.user.id);
      if (post.userid !== req.user.id) {
        const { rows: liker } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
        await db.query('INSERT INTO notifications (userid,message,icon) VALUES ($1,$2,$3)', [post.userid, `${liker[0].name} ha messo like al tuo post`, '❤️']);
      }
    } else { likes.splice(idx, 1); }
    await db.query('UPDATE socialposts SET likes=$1 WHERE id=$2', [JSON.stringify(likes), post.id]);
    return res.json({ liked: idx === -1, likescount: likes.length });
  } catch (err) { console.error('Like error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT c.*, u.name as authorname, u.id as authorid FROM comments c JOIN users u ON u.id=c.userid WHERE c.postid=$1 ORDER BY c.createdat ASC',
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) { console.error('Comments error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Commento vuoto' });
    const { rows: post } = await db.query('SELECT userid FROM socialposts WHERE id=$1', [req.params.id]);
    if (!post.length) return res.status(404).json({ error: 'Post non trovato' });
    await db.query('INSERT INTO comments (postid,userid,content) VALUES ($1,$2,$3)', [req.params.id, req.user.id, content.trim()]);
    if (post[0].userid !== req.user.id) {
      const { rows: commenter } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
      await db.query('INSERT INTO notifications (userid,message,icon) VALUES ($1,$2,$3)', [post[0].userid, `${commenter[0].name} ha commentato il tuo post`, '💬']);
    }
    const { rows: cnt } = await db.query('SELECT COUNT(*) as c FROM comments WHERE postid=$1', [req.params.id]);
    return res.json({ ok: true, commentscount: parseInt(cnt[0].c) });
  } catch (err) { console.error('Add comment error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/social/comments/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT userid FROM comments WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Commento non trovato' });
    const { rows: u } = await db.query('SELECT isadmin FROM users WHERE id=$1', [req.user.id]);
    if (rows[0].userid !== req.user.id && !u[0].isadmin) return res.status(403).json({ error: 'Non autorizzato' });
    await db.query('DELETE FROM comments WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Delete comment error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/social/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.username, u.points, u.avatarcolor, u.avatarskin, u.avatareyes, u.avatarmouth, u.avatarhair,
              CASE WHEN f.followerid IS NOT NULL THEN 1 ELSE 0 END as following
       FROM users u LEFT JOIN follows f ON f.followerid=$1 AND f.followingid=u.id
       WHERE u.id != $1 AND u.verified=1 ORDER BY u.co2saved DESC LIMIT 30`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) { console.error('Users error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/follow/:id', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id) return res.status(400).json({ error: 'Non puoi seguire te stesso' });
    const { rows: ex } = await db.query('SELECT 1 FROM follows WHERE followerid=$1 AND followingid=$2', [req.user.id, targetId]);
    if (ex.length) {
      await db.query('DELETE FROM follows WHERE followerid=$1 AND followingid=$2', [req.user.id, targetId]);
      return res.json({ following: false });
    } else {
      await db.query('INSERT INTO follows (followerid,followingid) VALUES ($1,$2)', [req.user.id, targetId]);
      const { rows: f } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
      await db.query('INSERT INTO notifications (userid,message,icon) VALUES ($1,$2,$3)', [targetId, `${f[0].name} ha iniziato a seguirti`, '👥']);
      return res.json({ following: true });
    }
  } catch (err) { console.error('Follow error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
app.get('/api/shop', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM shopitems ORDER BY category, cost');
    return res.json(rows);
  } catch (err) { console.error('Shop error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/shop/buy', auth, async (req, res) => {
  try {
    const { itemid } = req.body;
    if (!itemid) return res.status(400).json({ error: 'Item mancante' });
    const { rows: item } = await db.query('SELECT * FROM shopitems WHERE id=$1', [itemid]);
    if (!item.length) return res.status(404).json({ error: 'Oggetto non trovato' });
    const { rows: u } = await db.query('SELECT points, owneditems FROM users WHERE id=$1', [req.user.id]);
    let owned = []; try { owned = JSON.parse(u[0].owneditems); } catch {}
    if (owned.includes(item[0].id)) return res.status(400).json({ error: 'Oggetto già posseduto' });
    if (u[0].points < item[0].cost) return res.status(400).json({ error: 'Punti insufficienti' });
    owned.push(item[0].id);
    await db.query('UPDATE users SET points=points-$1, owneditems=$2 WHERE id=$3', [item[0].cost, JSON.stringify(owned), req.user.id]);
    await db.query('INSERT INTO notifications (userid,message,icon) VALUES ($1,$2,$3)', [req.user.id, `Hai acquistato ${item[0].name}!`, '🛍️']);
    checkBadges(req.user.id);
    return res.json({ ok: true });
  } catch (err) { console.error('Buy error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM notifications WHERE userid=$1 ORDER BY createdat DESC LIMIT 50', [req.user.id]);
    return res.json(rows);
  } catch (err) { console.error('Notifications error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/notifications/count', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) as count FROM notifications WHERE userid=$1 AND read=0', [req.user.id]);
    return res.json({ count: parseInt(rows[0].count) });
  } catch (err) { console.error('Notif count error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET read=1 WHERE userid=$1', [req.user.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Read all error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET read=1 WHERE id=$1 AND userid=$2', [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Read notif error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const { rows: u }  = await db.query('SELECT COUNT(*) as c FROM users');
    const { rows: a }  = await db.query('SELECT COUNT(*) as c FROM activities');
    const { rows: co } = await db.query('SELECT COALESCE(SUM(co2saved),0) as t FROM activities');
    const { rows: p }  = await db.query('SELECT COUNT(*) as c FROM socialposts');
    return res.json({ totalusers: parseInt(u[0].c), totalactivities: parseInt(a[0].c), totalco2: parseFloat(co[0].t), totalposts: parseInt(p[0].c) });
  } catch (err) { console.error('Admin stats error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id,name,username,email,points,co2saved,isadmin,verified,totalactivities,createdat FROM users ORDER BY createdat DESC');
    return res.json(rows);
  } catch (err) { console.error('Admin users error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const { name, username, points, isadmin } = req.body;
    await db.query('UPDATE users SET name=$1, username=$2, points=$3, isadmin=$4 WHERE id=$5',
      [name, username?.toLowerCase(), parseInt(points) || 0, isadmin ? 1 : 0, req.params.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Admin edit user error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Admin delete user error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/admin/users/:id/verify', adminAuth, async (req, res) => {
  try {
    await db.query('UPDATE users SET verified=1, verifytoken=NULL WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Admin verify error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/activities', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT a.*, u.name as username FROM activities a JOIN users u ON u.id=a.userid ORDER BY a.date DESC LIMIT 100'
    );
    return res.json(rows);
  } catch (err) { console.error('Admin activities error', err); return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/activities/:id', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT userid, co2saved, points FROM activities WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Attività non trovata' });
    const act = rows[0];
    await db.query(
      'UPDATE users SET co2saved=GREATEST(0,co2saved-$1), points=GREATEST(0,points-$2), totalactivities=GREATEST(0,totalactivities-1) WHERE id=$3',
      [act.co2saved, act.points, act.userid]
    );
    await db.query('DELETE FROM activities WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { console.error('Admin delete activity error', err); return res.status(500).json({ error: 'Errore server' }); }
});

// ══════════════════════════════════════════
//   DEV HELPERS (solo in development)
// ══════════════════════════════════════════
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/verify/:email', async (req, res) => {
    try {
      await db.query('UPDATE users SET verified=1, verifytoken=NULL WHERE email=$1', [req.params.email.toLowerCase()]);
      return res.json({ ok: true, msg: `${req.params.email} verificato!` });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  });

  app.get('/api/dev/users', async (req, res) => {
    const { rows } = await db.query('SELECT id,name,email,verified,points FROM users');
    return res.json(rows);
  });
}

// ══════════════════════════════════════════
//   STATIC FALLBACK
// ══════════════════════════════════════════
app.get('*', (req, res) => {
  const fs  = require('fs');
  const pub = path.join(__dirname, 'public', 'index.html');
  const root = path.join(__dirname, 'index.html');
  if (fs.existsSync(pub))  return res.sendFile(pub);
  if (fs.existsSync(root)) return res.sendFile(root);
  return res.status(404).send('index.html non trovato');
});

// ══════════════════════════════════════════
//   START
// ══════════════════════════════════════════
initDB().then(() => {
  app.listen(PORT, () => console.log(`🌱 EcoTrack Server avviato! http://localhost:${PORT}`));
}).catch(err => {
  console.error('❌ Errore inizializzazione DB:', err);
  process.exit(1);
});

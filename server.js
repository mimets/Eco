'use strict';

const express    = require('express');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const Database   = require('better-sqlite3');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════
//   DATABASE
// ══════════════════════════════════════════
const db = new Database(
  process.env.DB_PATH || path.join(__dirname, 'ecotrack.db')
);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ══════════════════════════════════════════
//   MIDDLEWARE
// ══════════════════════════════════════════
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// fallback — serve index.html per route non-API
// (se hai tutto nella root usa __dirname direttamente)
app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════
//   DB INIT
// ══════════════════════════════════════════
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      username     TEXT    UNIQUE,
      email        TEXT    UNIQUE NOT NULL,
      password     TEXT    NOT NULL,
      bio          TEXT    DEFAULT '',
      points       INTEGER DEFAULT 0,
      co2_saved    REAL    DEFAULT 0,
      total_activities INTEGER DEFAULT 0,
      is_admin     INTEGER DEFAULT 0,
      verified     INTEGER DEFAULT 0,
      verify_token TEXT,
      reset_token  TEXT,
      reset_expiry INTEGER,
      avatar_color TEXT    DEFAULT '#16a34a',
      avatar_skin  TEXT    DEFAULT '#fde68a',
      avatar_eyes  TEXT    DEFAULT 'normal',
      avatar_mouth TEXT    DEFAULT 'smile',
      avatar_hair  TEXT    DEFAULT 'none',
      owned_items  TEXT    DEFAULT '[]',
      created_at   TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type      TEXT    NOT NULL,
      km        REAL    DEFAULT 0,
      hours     REAL    DEFAULT 0,
      co2_saved REAL    DEFAULT 0,
      points    INTEGER DEFAULT 0,
      note      TEXT    DEFAULT '',
      from_addr TEXT    DEFAULT '',
      to_addr   TEXT    DEFAULT '',
      date      TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title         TEXT    NOT NULL,
      description   TEXT    DEFAULT '',
      co2_target    REAL    DEFAULT 0,
      points_reward INTEGER DEFAULT 0,
      end_date      TEXT,
      is_public     INTEGER DEFAULT 1,
      created_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL,
      image_url  TEXT    DEFAULT '',
      likes      TEXT    DEFAULT '[]',
      created_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message    TEXT    NOT NULL,
      icon       TEXT    DEFAULT '🔔',
      read       INTEGER DEFAULT 0,
      created_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      category    TEXT    NOT NULL,
      emoji       TEXT    DEFAULT '🎁',
      cost        INTEGER DEFAULT 100,
      is_rare     INTEGER DEFAULT 0
    );
  `);

  // seed shop items se vuoti
  const count = db.prepare('SELECT COUNT(*) as c FROM shop_items').get();
  if (count.c === 0) seedShop();
}

function seedShop() {
  const items = [
    // capelli
    { name:'Rainbow Hair',  description:'Capelli arcobaleno magici',  category:'hair',  emoji:'🌈', cost:300,  is_rare:1 },
    { name:'Gold Hair',     description:'Capelli dorati brillanti',   category:'hair',  emoji:'✨', cost:500,  is_rare:1 },
    { name:'Galaxy Hair',   description:'Capelli galassia cosmica',   category:'hair',  emoji:'🌌', cost:800,  is_rare:1 },
    { name:'Flame Hair',    description:'Capelli di fuoco ardente',   category:'hair',  emoji:'🔥', cost:600,  is_rare:1 },
    // occhi
    { name:'Star Eyes',     description:'Occhi a forma di stella',    category:'eyes',  emoji:'⭐', cost:200,  is_rare:0 },
    { name:'Heart Eyes',    description:'Occhi a forma di cuore',     category:'eyes',  emoji:'❤️', cost:200,  is_rare:0 },
    { name:'Laser Eyes',    description:'Occhi laser rossi',          category:'eyes',  emoji:'🔴', cost:400,  is_rare:1 },
    // bocca
    { name:'Rainbow Mouth', description:'Sorriso arcobaleno',         category:'mouth', emoji:'🌈', cost:250,  is_rare:0 },
    { name:'Fire Mouth',    description:'Bocca di fuoco',             category:'mouth', emoji:'🔥', cost:350,  is_rare:1 },
    // colori speciali
    { name:'Viola Reale',   description:'Colore viola elegante',      category:'color', emoji:'💜', cost:150,  is_rare:0 },
    { name:'Rosso Fuoco',   description:'Colore rosso intenso',       category:'color', emoji:'❤️', cost:150,  is_rare:0 },
    { name:'Oro Puro',      description:'Colore oro lussuoso',        category:'color', emoji:'⭐', cost:400,  is_rare:1 },
  ];

  const ins = db.prepare(`
    INSERT INTO shop_items (name,description,category,emoji,cost,is_rare)
    VALUES (@name,@description,@category,@emoji,@cost,@is_rare)
  `);
  const insertMany = db.transaction(arr => arr.forEach(i => ins.run(i)));
  insertMany(items);
  console.log('✅ Shop items seeded');
}

initDB();

// ══════════════════════════════════════════
//   EMAIL
// ══════════════════════════════════════════
function getMailer() {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  return nodemailer.createTransport({
    service: process.env.MAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });
}

async function sendVerifyEmail(email, token) {
  const mailer = getMailer();
  if (!mailer) {
    console.log(`[DEV] Verify token for ${email}: ${token}`);
    return;
  }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}/verify?token=${token}`;
  await mailer.sendMail({
    from:    `"EcoTrack 🌱" <${process.env.MAIL_USER}>`,
    to:      email,
    subject: '✅ Verifica il tuo account EcoTrack',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;
        padding:40px;background:#f0fdf4;border-radius:16px">
        <h1 style="color:#16a34a">🌱 EcoTrack</h1>
        <h2>Verifica il tuo account</h2>
        <p>Clicca il bottone per verificare la tua email:</p>
        <a href="${url}"
          style="display:inline-block;padding:14px 28px;
          background:#16a34a;color:white;border-radius:10px;
          text-decoration:none;font-weight:700;margin:16px 0">
          ✅ Verifica Email
        </a>
        <p style="color:#64748b;font-size:13px">
          Se non hai creato un account ignora questa email.
        </p>
      </div>`
  });
}

async function sendResetEmail(email, token) {
  const mailer = getMailer();
  if (!mailer) {
    console.log(`[DEV] Reset token for ${email}: ${token}`);
    return;
  }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}/?action=reset&token=${token}`;
  await mailer.sendMail({
    from:    `"EcoTrack 🌱" <${process.env.MAIL_USER}>`,
    to:      email,
    subject: '🔑 Reset password EcoTrack',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;
        padding:40px;background:#f0fdf4;border-radius:16px">
        <h1 style="color:#16a34a">🌱 EcoTrack</h1>
        <h2>Reset della password</h2>
        <p>Clicca il bottone per reimpostare la password:</p>
        <a href="${url}"
          style="display:inline-block;padding:14px 28px;
          background:#ef4444;color:white;border-radius:10px;
          text-decoration:none;font-weight:700;margin:16px 0">
          🔑 Reimposta Password
        </a>
        <p style="color:#64748b;font-size:13px">
          Il link scade tra 1 ora.
        </p>
      </div>`
  });
}

// ══════════════════════════════════════════
//   AUTH MIDDLEWARE
// ══════════════════════════════════════════
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(
      h.slice(7),
      process.env.JWT_SECRET || 'ecotrack_secret_2024'
    );
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    const u = db.prepare('SELECT is_admin FROM users WHERE id=?')
               .get(req.user.id);
    if (!u?.is_admin)
      return res.status(403).json({ error: 'Accesso negato' });
    next();
  });
}

// ══════════════════════════════════════════
//   CO2 CALCULATOR
// ══════════════════════════════════════════
function calcCo2(type, km, hours) {
  // kg CO2 risparmiati vs auto
  const factors = {
    Bici:       0.21,   // vs auto 0.21 kg/km
    Treno:      0.14,
    Bus:        0.10,
    Carpooling: 0.08,
    Remoto:     2.5,    // per ora (vs spostamento medio)
    Videocall:  1.8
  };
  const f = factors[type] || 0;
  if (['Remoto','Videocall'].includes(type)) return +(f * (hours || 0)).toFixed(2);
  return +(f * (km || 0)).toFixed(2);
}

function calcPoints(co2) {
  return Math.max(1, Math.round(co2 * 10));
}

// ══════════════════════════════════════════
//   AUTH ROUTES
// ══════════════════════════════════════════

// REGISTER
app.post('/api/register', (req, res) => {
  try {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password)
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });

    const existing = db.prepare(
      'SELECT id FROM users WHERE email=? OR username=?'
    ).get(email.toLowerCase(), username.toLowerCase());

    if (existing)
      return res.status(400).json({ error: 'Email o username già in uso' });

    const hash  = bcrypt.hashSync(password, 10);
    const vTok  = crypto.randomBytes(32).toString('hex');

    // ✅ FIX 1: verified=1 — nessuna email di verifica richiesta
    db.prepare(`
      INSERT INTO users
        (name, username, email, password, verify_token, verified)
      VALUES (?,?,?,?,?,1)
    `).run(
      name,
      username.toLowerCase(),
      email.toLowerCase(),
      hash,
      vTok
    );

    return res.json({
      ok: true,
      message: 'Registrazione completata! Ora puoi accedere.'
    });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// LOGIN
app.post('/api/login', (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password)
      return res.status(400).json({ error: 'Campi mancanti' });

    const user = db.prepare(
      'SELECT * FROM users WHERE email=? OR username=?'
    ).get(identifier.toLowerCase(), identifier.toLowerCase());

    if (!user)
      return res.status(400).json({ error: 'Credenziali non valide' });

    // ✅ FIX 2: blocco verifica email rimosso
    // if (!user.verified)
    //   return res.status(400).json({
    //     error: 'Email non verificata. Controlla la tua casella.',
    //     needsVerify: true
    //   });

    const ok = bcrypt.compareSync(password, user.password);
    if (!ok)
      return res.status(400).json({ error: 'Credenziali non valide' });

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || 'ecotrack_secret_2024',
      { expiresIn: '30d' }
    );

    let owned = [];
    try { owned = JSON.parse(user.owned_items || '[]'); } catch {}

    return res.json({
      token,
      user: {
        id:               user.id,
        name:             user.name,
        username:         user.username,
        email:            user.email,
        bio:              user.bio              || '',
        points:           user.points           || 0,
        co2_saved:        user.co2_saved        || 0,
        total_activities: user.total_activities || 0,
        is_admin:         user.is_admin         || 0,
        avatar_color:     user.avatar_color     || '#16a34a',
        avatar_skin:      user.avatar_skin      || '#fde68a',
        avatar_eyes:      user.avatar_eyes      || 'normal',
        avatar_mouth:     user.avatar_mouth     || 'smile',
        avatar_hair:      user.avatar_hair      || 'none',
        owned_items:      owned
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

// VERIFY EMAIL
app.get('/api/verify', (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Token mancante');

    const user = db.prepare(
      'SELECT id FROM users WHERE verify_token=?'
    ).get(token);

    if (!user) return res.status(400).send('Token non valido o già usato');

    db.prepare(
      'UPDATE users SET verified=1, verify_token=NULL WHERE id=?'
    ).run(user.id);

    // redirect alla home con messaggio
    return res.redirect('/?verified=1');
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).send('Errore server');
  }
});

// RESEND VERIFY
app.post('/api/resend-verify', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email mancante' });

    const user = db.prepare(
      'SELECT id, verified FROM users WHERE email=?'
    ).get(email.toLowerCase());

    if (!user)
      return res.status(400).json({ error: 'Email non trovata' });
    if (user.verified)
      return res.status(400).json({ error: 'Account già verificato' });

    const vTok = crypto.randomBytes(32).toString('hex');
    db.prepare(
      'UPDATE users SET verify_token=? WHERE id=?'
    ).run(vTok, user.id);

    sendVerifyEmail(email.toLowerCase(), vTok).catch(console.error);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Resend verify error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// FORGOT PASSWORD
app.post('/api/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email mancante' });

    const user = db.prepare(
      'SELECT id FROM users WHERE email=?'
    ).get(email.toLowerCase());

    // risponde sempre ok per sicurezza
    if (!user) return res.json({ ok: true });

    const rTok   = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600000; // 1 ora

    db.prepare(
      'UPDATE users SET reset_token=?, reset_expiry=? WHERE id=?'
    ).run(rTok, expiry, user.id);

    sendResetEmail(email.toLowerCase(), rTok).catch(console.error);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// RESET PASSWORD
app.post('/api/reset-password', (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password)
      return res.status(400).json({ error: 'Dati mancanti' });

    const user = db.prepare(
      'SELECT id, reset_expiry FROM users WHERE reset_token=?'
    ).get(token);

    if (!user)
      return res.status(400).json({ error: 'Token non valido' });
    if (Date.now() > user.reset_expiry)
      return res.status(400).json({ error: 'Token scaduto' });

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare(
      'UPDATE users SET password=?, reset_token=NULL, reset_expiry=NULL WHERE id=?'
    ).run(hash, user.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   PROFILE ROUTES
// ══════════════════════════════════════════

// GET profile
app.get('/api/profile', auth, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });

    let owned = [];
    try { owned = JSON.parse(user.owned_items || '[]'); } catch {}

    return res.json({
      id:               user.id,
      name:             user.name,
      username:         user.username,
      email:            user.email,
      bio:              user.bio              || '',
      points:           user.points           || 0,
      co2_saved:        user.co2_saved        || 0,
      total_activities: user.total_activities || 0,
      is_admin:         user.is_admin         || 0,
      avatar_color:     user.avatar_color     || '#16a34a',
      avatar_skin:      user.avatar_skin      || '#fde68a',
      avatar_eyes:      user.avatar_eyes      || 'normal',
      avatar_mouth:     user.avatar_mouth     || 'smile',
      avatar_hair:      user.avatar_hair      || 'none',
      owned_items:      owned
    });
  } catch (err) {
    console.error('Profile error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// UPDATE profile
app.put('/api/profile', auth, (req, res) => {
  try {
    const { name, username, bio } = req.body;
    if (!name || !username)
      return res.status(400).json({ error: 'Nome e username obbligatori' });

    const existing = db.prepare(
      'SELECT id FROM users WHERE username=? AND id!=?'
    ).get(username.toLowerCase(), req.user.id);

    if (existing)
      return res.status(400).json({ error: 'Username già in uso' });

    db.prepare(
      'UPDATE users SET name=?, username=?, bio=? WHERE id=?'
    ).run(name, username.toLowerCase(), bio || '', req.user.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// UPDATE avatar
app.put('/api/profile/avatar', auth, (req, res) => {
  try {
    const { color, skin, eyes, mouth, hair } = req.body;
    db.prepare(`
      UPDATE users SET
        avatar_color=?, avatar_skin=?,
        avatar_eyes=?, avatar_mouth=?, avatar_hair=?
      WHERE id=?
    `).run(
      color || '#16a34a', skin  || '#fde68a',
      eyes  || 'normal',  mouth || 'smile',
      hair  || 'none',    req.user.id
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Avatar error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// CHANGE password
app.put('/api/profile/password', auth, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Dati mancanti' });

    const user = db.prepare('SELECT password FROM users WHERE id=?')
                   .get(req.user.id);

    const ok = bcrypt.compareSync(current_password, user.password);
    if (!ok)
      return res.status(400).json({ error: 'Password attuale non corretta' });

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password=? WHERE id=?')
      .run(hash, req.user.id);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   STATS + YEARLY
// ══════════════════════════════════════════
app.get('/api/stats', auth, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);

    const week = db.prepare(`
      SELECT COALESCE(SUM(co2_saved),0) as total
      FROM activities
      WHERE user_id=?
        AND date >= datetime('now','-7 days')
    `).get(req.user.id);

    const month = db.prepare(`
      SELECT COALESCE(SUM(co2_saved),0) as total
      FROM activities
      WHERE user_id=?
        AND date >= datetime('now','start of month')
    `).get(req.user.id);

    return res.json({
      co2_saved:        user.co2_saved        || 0,
      co2_week:         week.total            || 0,
      co2_month:        month.total           || 0,
      total_activities: user.total_activities || 0,
      points:           user.points           || 0
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.get('/api/yearly', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        strftime('%m', date) as month,
        COALESCE(SUM(co2_saved),0) as co2,
        COALESCE(SUM(points),0)    as pts
      FROM activities
      WHERE user_id=?
        AND date >= datetime('now','-12 months')
      GROUP BY strftime('%m', date)
      ORDER BY month
    `).all(req.user.id);

    const months = ['Gen','Feb','Mar','Apr','Mag','Giu',
                    'Lug','Ago','Set','Ott','Nov','Dic'];
    const result = months.map((m, i) => {
      const mm  = String(i+1).padStart(2,'0');
      const row = rows.find(r => r.month === mm);
      return {
        month: m,
        co2:   row ? parseFloat(row.co2).toFixed(1) : '0.0',
        pts:   row ? row.pts : 0
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Yearly error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
app.get('/api/activities', auth, (req, res) => {
  try {
    const acts = db.prepare(
      'SELECT * FROM activities WHERE user_id=? ORDER BY date DESC LIMIT 50'
    ).all(req.user.id);
    return res.json(acts);
  } catch (err) {
    console.error('Activities error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/activities', auth, (req, res) => {
  try {
    const { type, km, hours, note, from_addr, to_addr } = req.body;
    if (!type) return res.status(400).json({ error: 'Tipo mancante' });

    const co2    = calcCo2(type, parseFloat(km)||0, parseFloat(hours)||0);
    const points = calcPoints(co2);

    db.prepare(`
      INSERT INTO activities
        (user_id, type, km, hours, co2_saved, points, note, from_addr, to_addr)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      req.user.id, type,
      parseFloat(km)||0, parseFloat(hours)||0,
      co2, points,
      note||'', from_addr||'', to_addr||''
    );

    db.prepare(`
      UPDATE users SET
        co2_saved        = co2_saved + ?,
        points           = points + ?,
        total_activities = total_activities + 1
      WHERE id=?
    `).run(co2, points, req.user.id);

    // controlla badge
    checkBadges(req.user.id);

    return res.json({ ok: true, co2_saved: co2, points });
  } catch (err) {
    console.error('Log activity error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
const BADGES = [
  { id:'first',    name:'Prima Volta',    icon:'🌱', desc:'Prima attività registrata',    check: (u,a) => a >= 1           },
  { id:'eco5',     name:'Eco x5',         icon:'🚴', desc:'5 attività registrate',         check: (u,a) => a >= 5           },
  { id:'eco10',    name:'Eco x10',        icon:'🌿', desc:'10 attività registrate',        check: (u,a) => a >= 10          },
  { id:'eco50',    name:'Eco x50',        icon:'🌳', desc:'50 attività registrate',        check: (u,a) => a >= 50          },
  { id:'co2_10',   name:'10kg CO₂',       icon:'☁️', desc:'10 kg di CO₂ risparmiati',     check: (u,a) => u.co2_saved >= 10  },
  { id:'co2_50',   name:'50kg CO₂',       icon:'🌍', desc:'50 kg di CO₂ risparmiati',     check: (u,a) => u.co2_saved >= 50  },
  { id:'co2_100',  name:'100kg CO₂',      icon:'🏆', desc:'100 kg di CO₂ risparmiati',    check: (u,a) => u.co2_saved >= 100 },
  { id:'co2_500',  name:'500kg CO₂',      icon:'💎', desc:'500 kg di CO₂ risparmiati',    check: (u,a) => u.co2_saved >= 500 },
  { id:'pts_100',  name:'100 Punti',      icon:'⭐', desc:'100 punti accumulati',          check: (u,a) => u.points >= 100  },
  { id:'pts_500',  name:'500 Punti',      icon:'🌟', desc:'500 punti accumulati',          check: (u,a) => u.points >= 500  },
  { id:'pts_1000', name:'1000 Punti',     icon:'💫', desc:'1000 punti accumulati',         check: (u,a) => u.points >= 1000 },
  { id:'pts_5000', name:'5000 Punti',     icon:'👑', desc:'5000 punti accumulati',         check: (u,a) => u.points >= 5000 },
  { id:'social1',  name:'Social Starter', icon:'💬', desc:'Primo post pubblicato',         check: (u,a,p) => p >= 1         },
  { id:'shopper',  name:'Shopper',        icon:'🛍️', desc:'Primo acquisto nello shop',     check: (u,a,p,s) => s >= 1       },
];

function checkBadges(userId) {
  try {
    const user  = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    const acts  = user.total_activities || 0;
    const posts = db.prepare(
      'SELECT COUNT(*) as c FROM social_posts WHERE user_id=?'
    ).get(userId).c;
    let owned = [];
    try { owned = JSON.parse(user.owned_items || '[]'); } catch {}
    const shopCount = owned.length;

    // leggi badge già notificati (usiamo notifications come tracker)
    const notified = db.prepare(
      "SELECT message FROM notifications WHERE user_id=? AND icon='🏅'"
    ).all(userId).map(n => n.message);

    BADGES.forEach(b => {
      const earned = b.check(user, acts, posts, shopCount);
      const alreadyNotified = notified.some(n => n.includes(b.name));
      if (earned && !alreadyNotified) {
        db.prepare(`
          INSERT INTO notifications (user_id, message, icon)
          VALUES (?,?,?)
        `).run(userId, `🏅 Badge sbloccato: ${b.name} — ${b.desc}`, '🏅');
      }
    });
  } catch (err) {
    console.error('Badge check error:', err);
  }
}

app.get('/api/badges', auth, (req, res) => {
  try {
    const user  = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    const acts  = user.total_activities || 0;
    const posts = db.prepare(
      'SELECT COUNT(*) as c FROM social_posts WHERE user_id=?'
    ).get(req.user.id).c;
    let owned = [];
    try { owned = JSON.parse(user.owned_items || '[]'); } catch {}

    const result = BADGES.map(b => ({
      id:       b.id,
      name:     b.name,
      icon:     b.icon,
      desc:     b.desc,
      unlocked: b.check(user, acts, posts, owned.length)
    }));

    return res.json(result);
  } catch (err) {
    console.error('Badges error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.get('/api/challenges', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, u.name as creator_name
      FROM challenges c
      LEFT JOIN users u ON u.id = c.creator_id
      WHERE c.is_public=1 OR c.creator_id=?
      ORDER BY c.created_at DESC
    `).all(req.user.id);
    return res.json(rows);
  } catch (err) {
    console.error('Challenges error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/challenges', auth, (req, res) => {
  try {
    const { title, description, co2_target,
            points_reward, end_date, is_public } = req.body;

    if (!title)
      return res.status(400).json({ error: 'Titolo obbligatorio' });

    db.prepare(`
      INSERT INTO challenges
        (creator_id, title, description, co2_target,
         points_reward, end_date, is_public)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      req.user.id, title, description||'',
      parseFloat(co2_target)||0,
      parseInt(points_reward)||0,
      end_date||null,
      is_public ? 1 : 0
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('Create challenge error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
app.get('/api/leaderboard', auth, (req, res) => {
  try {
    // ✅ FIX 3: rimosso WHERE verified=1 — tutti gli utenti in classifica
    const rows = db.prepare(`
      SELECT id, name, username, co2_saved, points,
             avatar_color, avatar_skin,
             avatar_eyes,  avatar_mouth, avatar_hair
      FROM users
      ORDER BY co2_saved DESC
      LIMIT 50
    `).all();
    return res.json(rows);
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   SOCIAL — POSTS
// ══════════════════════════════════════════
app.get('/api/social/posts', auth, (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT
        p.*,
        u.name    as author_name,
        u.username as author_username,
        u.avatar_color, u.avatar_skin,
        u.avatar_eyes,  u.avatar_mouth, u.avatar_hair,
        (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
      FROM social_posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all();

    const result = posts.map(p => {
      let likes = [];
      try { likes = JSON.parse(p.likes || '[]'); } catch {}
      return {
        ...p,
        likes_count:   likes.length,
        liked_by_me:   likes.includes(req.user.id),
        author_id:     p.user_id
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Posts error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/social/posts', auth, (req, res) => {
  try {
    const { content, image_url } = req.body;
    if (!content?.trim())
      return res.status(400).json({ error: 'Contenuto mancante' });

    db.prepare(`
      INSERT INTO social_posts (user_id, content, image_url)
      VALUES (?,?,?)
    `).run(req.user.id, content.trim(), image_url||'');

    checkBadges(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Create post error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.delete('/api/social/posts/:id', auth, (req, res) => {
  try {
    const post = db.prepare(
      'SELECT user_id FROM social_posts WHERE id=?'
    ).get(req.params.id);

    if (!post) return res.status(404).json({ error: 'Post non trovato' });

    const user = db.prepare('SELECT is_admin FROM users WHERE id=?')
                   .get(req.user.id);

    if (post.user_id !== req.user.id && !user.is_admin)
      return res.status(403).json({ error: 'Non autorizzato' });

    db.prepare('DELETE FROM social_posts WHERE id=?').run(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete post error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// LIKE
app.post('/api/social/posts/:id/like', auth, (req, res) => {
  try {
    const post = db.prepare(
      'SELECT id, likes, user_id FROM social_posts WHERE id=?'
    ).get(req.params.id);

    if (!post) return res.status(404).json({ error: 'Post non trovato' });

    let likes = [];
    try { likes = JSON.parse(post.likes || '[]'); } catch {}

    const idx = likes.indexOf(req.user.id);
    if (idx === -1) {
      likes.push(req.user.id);
      // notifica autore
      if (post.user_id !== req.user.id) {
        const liker = db.prepare('SELECT name FROM users WHERE id=?')
                        .get(req.user.id);
        db.prepare(`
          INSERT INTO notifications (user_id, message, icon)
          VALUES (?,?,?)
        `).run(post.user_id, `❤️ ${liker.name} ha messo like al tuo post`, '❤️');
      }
    } else {
      likes.splice(idx, 1);
    }

    db.prepare('UPDATE social_posts SET likes=? WHERE id=?')
      .run(JSON.stringify(likes), post.id);

    return res.json({ liked: idx === -1, likes_count: likes.length });
  } catch (err) {
    console.error('Like error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// COMMENTS
app.get('/api/social/posts/:id/comments', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, u.name as author_name, u.id as author_id
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id=?
      ORDER BY c.created_at ASC
    `).all(req.params.id);
    return res.json(rows);
  } catch (err) {
    console.error('Comments error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/social/posts/:id/comments', auth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim())
      return res.status(400).json({ error: 'Commento vuoto' });

    const post = db.prepare(
      'SELECT user_id FROM social_posts WHERE id=?'
    ).get(req.params.id);

    if (!post) return res.status(404).json({ error: 'Post non trovato' });

    db.prepare(`
      INSERT INTO comments (post_id, user_id, content)
      VALUES (?,?,?)
    `).run(req.params.id, req.user.id, content.trim());

    // notifica autore
    if (post.user_id !== req.user.id) {
      const commenter = db.prepare('SELECT name FROM users WHERE id=?')
                          .get(req.user.id);
      db.prepare(`
        INSERT INTO notifications (user_id, message, icon)
        VALUES (?,?,?)
      `).run(post.user_id,
        `💬 ${commenter.name} ha commentato il tuo post`, '💬');
    }

    const count = db.prepare(
      'SELECT COUNT(*) as c FROM comments WHERE post_id=?'
    ).get(req.params.id).c;

    return res.json({ ok: true, comments_count: count });
  } catch (err) {
    console.error('Add comment error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.delete('/api/social/comments/:id', auth, (req, res) => {
  try {
    const comment = db.prepare(
      'SELECT user_id FROM comments WHERE id=?'
    ).get(req.params.id);

    if (!comment) return res.status(404).json({ error: 'Commento non trovato' });

    const user = db.prepare('SELECT is_admin FROM users WHERE id=?')
                   .get(req.user.id);

    if (comment.user_id !== req.user.id && !user.is_admin)
      return res.status(403).json({ error: 'Non autorizzato' });

    db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete comment error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// FOLLOW
app.get('/api/social/users', auth, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id, u.name, u.username, u.points,
        u.avatar_color, u.avatar_skin,
        u.avatar_eyes,  u.avatar_mouth, u.avatar_hair,
        CASE WHEN f.follower_id IS NOT NULL THEN 1 ELSE 0 END as following
      FROM users u
      LEFT JOIN follows f
        ON f.follower_id=? AND f.following_id=u.id
      WHERE u.id != ?
      ORDER BY u.co2_saved DESC
      LIMIT 30
    `).all(req.user.id, req.user.id);
    return res.json(users);
  } catch (err) {
    console.error('Users error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/social/follow/:id', auth, (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id)
      return res.status(400).json({ error: 'Non puoi seguire te stesso' });

    const existing = db.prepare(
      'SELECT 1 FROM follows WHERE follower_id=? AND following_id=?'
    ).get(req.user.id, targetId);

    if (existing) {
      db.prepare(
        'DELETE FROM follows WHERE follower_id=? AND following_id=?'
      ).run(req.user.id, targetId);
      return res.json({ following: false });
    } else {
      db.prepare(
        'INSERT INTO follows (follower_id, following_id) VALUES (?,?)'
      ).run(req.user.id, targetId);

      const follower = db.prepare('SELECT name FROM users WHERE id=?')
                         .get(req.user.id);
      db.prepare(`
        INSERT INTO notifications (user_id, message, icon)
        VALUES (?,?,?)
      `).run(targetId, `👤 ${follower.name} ha iniziato a seguirti`, '👤');

      return res.json({ following: true });
    }
  } catch (err) {
    console.error('Follow error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
app.get('/api/shop', auth, (req, res) => {
  try {
    const items = db.prepare(
      'SELECT * FROM shop_items ORDER BY category, cost'
    ).all();
    return res.json(items);
  } catch (err) {
    console.error('Shop error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/shop/buy', auth, (req, res) => {
  try {
    const { item_id } = req.body;
    if (!item_id)
      return res.status(400).json({ error: 'Item mancante' });

    const item = db.prepare(
      'SELECT * FROM shop_items WHERE id=?'
    ).get(item_id);
    if (!item)
      return res.status(404).json({ error: 'Oggetto non trovato' });

    const user = db.prepare(
      'SELECT points, owned_items FROM users WHERE id=?'
    ).get(req.user.id);

    let owned = [];
    try { owned = JSON.parse(user.owned_items || '[]'); } catch {}

    if (owned.includes(item.id))
      return res.status(400).json({ error: 'Oggetto già posseduto' });

    if (user.points < item.cost)
      return res.status(400).json({ error: 'Punti insufficienti' });

    owned.push(item.id);

    db.prepare(`
      UPDATE users SET
        points      = points - ?,
        owned_items = ?
      WHERE id=?
    `).run(item.cost, JSON.stringify(owned), req.user.id);

    db.prepare(`
      INSERT INTO notifications (user_id, message, icon)
      VALUES (?,?,?)
    `).run(req.user.id,
      `🛍️ Hai acquistato "${item.name}"!`, '🛍️');

    checkBadges(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Buy error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
app.get('/api/notifications', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id=?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);
    return res.json(rows);
  } catch (err) {
    console.error('Notifications error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.get('/api/notifications/count', auth, (req, res) => {
  try {
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id=? AND read=0'
    ).get(req.user.id);
    return res.json({ count: row.count });
  } catch (err) {
    console.error('Notif count error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/notifications/read-all', auth, (req, res) => {
  try {
    db.prepare(
      'UPDATE notifications SET read=1 WHERE user_id=?'
    ).run(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Read all error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/notifications/:id/read', auth, (req, res) => {
  try {
    db.prepare(
      'UPDATE notifications SET read=1 WHERE id=? AND user_id=?'
    ).run(req.params.id, req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Read notif error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
app.get('/api/admin/stats', adminAuth, (req, res) => {
  try {
    const total_users = db.prepare(
      'SELECT COUNT(*) as c FROM users'
    ).get().c;
    const total_activities = db.prepare(
      'SELECT COUNT(*) as c FROM activities'
    ).get().c;
    const total_co2 = db.prepare(
      'SELECT COALESCE(SUM(co2_saved),0) as t FROM activities'
    ).get().t;
    const total_posts = db.prepare(
      'SELECT COUNT(*) as c FROM social_posts'
    ).get().c;

    return res.json({
      total_users, total_activities,
      total_co2, total_posts
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, username, email,
             points, co2_saved, is_admin, verified,
             total_activities, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();
    return res.json(users);
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.put('/api/admin/users/:id', adminAuth, (req, res) => {
  try {
    const { name, username, points, is_admin } = req.body;
    db.prepare(`
      UPDATE users SET
        name=?, username=?, points=?, is_admin=?
      WHERE id=?
    `).run(
      name, username?.toLowerCase(),
      parseInt(points)||0,
      is_admin ? 1 : 0,
      req.params.id
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Admin edit user error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  try {
    // non eliminare se stesso
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Non puoi eliminare te stesso' });

    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/admin/users/:id/verify', adminAuth, (req, res) => {
  try {
    db.prepare(
      'UPDATE users SET verified=1, verify_token=NULL WHERE id=?'
    ).run(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Admin verify error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.get('/api/admin/activities', adminAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.*, u.name as user_name
      FROM activities a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.date DESC
      LIMIT 100
    `).all();
    return res.json(rows);
  } catch (err) {
    console.error('Admin activities error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.delete('/api/admin/activities/:id', adminAuth, (req, res) => {
  try {
    const act = db.prepare(
      'SELECT user_id, co2_saved, points FROM activities WHERE id=?'
    ).get(req.params.id);

    if (!act)
      return res.status(404).json({ error: 'Attività non trovata' });

    // sottrai stats utente
    db.prepare(`
      UPDATE users SET
        co2_saved        = MAX(0, co2_saved - ?),
        points           = MAX(0, points - ?),
        total_activities = MAX(0, total_activities - 1)
      WHERE id=?
    `).run(act.co2_saved, act.points, act.user_id);

    db.prepare('DELETE FROM activities WHERE id=?').run(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete activity error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ══════════════════════════════════════════
//   DEV HELPERS (rimuovi in produzione)
// ══════════════════════════════════════════
if (process.env.NODE_ENV !== 'production') {
  // forza verifica utente per test
  app.get('/api/dev/verify/:email', (req, res) => {
    try {
      db.prepare(
        'UPDATE users SET verified=1, verify_token=NULL WHERE email=?'
      ).run(req.params.email.toLowerCase());
      return res.json({ ok: true, msg: `${req.params.email} verificato!` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // lista tutti gli utenti (debug)
  app.get('/api/dev/users', (req, res) => {
    const users = db.prepare(
      'SELECT id, name, email, verified, points FROM users'
    ).all();
    return res.json(users);
  });
}

// ══════════════════════════════════════════
//   STATIC FALLBACK
// ══════════════════════════════════════════
app.get('*', (req, res) => {
  // prova prima public/index.html poi index.html nella root
  const pub  = path.join(__dirname, 'public', 'index.html');
  const root = path.join(__dirname, 'index.html');
  const fs   = require('fs');

  if (fs.existsSync(pub))  return res.sendFile(pub);
  if (fs.existsSync(root)) return res.sendFile(root);
  return res.status(404).send('index.html non trovato');
});

// ══════════════════════════════════════════
//   START
// ══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🌱 EcoTrack Server avviato!        ║
  ║   http://localhost:${PORT}             ║
  ╚══════════════════════════════════════╝
  `);
});
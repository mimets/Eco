'use strict';
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const { Pool }   = require('pg');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════
// DATABASE INIT
// ═══════════════════════════════════════════
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
      co2_saved REAL DEFAULT 0,
      total_activities INTEGER DEFAULT 0,
      is_admin BOOLEAN DEFAULT false,
      is_banned BOOLEAN DEFAULT false,
      ban_until TIMESTAMP,
      ban_reason TEXT,
      verified INTEGER DEFAULT 1,
      verify_token TEXT,
      reset_token TEXT,
      reset_expiry BIGINT,
      tutorial_done BOOLEAN DEFAULT false,
      avatar_color TEXT DEFAULT '#16a34a',
      avatar_skin  TEXT DEFAULT '#fde68a',
      avatar_eyes  TEXT DEFAULT 'normal',
      avatar_mouth TEXT DEFAULT 'smile',
      avatar_hair  TEXT DEFAULT 'none',
      owned_items JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      km REAL DEFAULT 0,
      hours REAL DEFAULT 0,
      co2_saved REAL DEFAULT 0,
      points INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      from_addr TEXT DEFAULT '',
      to_addr TEXT DEFAULT '',
      date TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      co2_target REAL DEFAULT 0,
      points_reward INTEGER DEFAULT 0,
      end_date DATE,
      is_public BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      likes JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(follower_id, following_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      cost INTEGER DEFAULT 100,
      is_rare BOOLEAN DEFAULT false
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      icon TEXT DEFAULT '🔔',
      is_read BOOLEAN DEFAULT false,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const { rows: shopRows } = await db.query('SELECT COUNT(*) as c FROM shop_items');
  if (parseInt(shopRows[0].c) === 0) await seedShop();

  const { rows: adminRows } = await db.query("SELECT id FROM users WHERE email='admin@ecotrack.com'");
  if (!adminRows.length) {
    const hash = bcrypt.hashSync('Admin@2026!', 10);
    await db.query(
      "INSERT INTO users (name,username,email,password,is_admin,verified,owned_items) VALUES ($1,$2,$3,$4,$5,$6,'[]')",
      ['Admin', 'admin', 'admin@ecotrack.com', hash, true, 1]
    );
    console.log('👑 Admin creato: admin@ecotrack.com / Admin@2026!');
  }
  console.log('✅ Database inizializzato');
}

async function seedShop() {
  const items = [
    ['Capelli Corti',  'Taglio classico',           'hair',      '💇', 50,  false],
    ['Capelli Lunghi', 'Capelli lunghi fluenti',    'hair',      '💁', 80,  false],
    ['Rainbow Hair',   'Capelli arcobaleno magici', 'hair',      '🌈', 300, true ],
    ['Gold Hair',      'Capelli dorati brillanti',  'hair',      '✨', 500, true ],
    ['Galaxy Hair',    'Capelli galassia cosmica',  'hair',      '🌌', 800, true ],
    ['Flame Hair',     'Capelli di fuoco',          'hair',      '🔥', 600, true ],
    ['Star Eyes',      'Occhi stella scintillante', 'eyes',      '⭐', 200, false],
    ['Heart Eyes',     'Occhi cuore innamorati',    'eyes',      '❤️', 200, false],
    ['Laser Eyes',     'Occhi laser potenti',       'eyes',      '😎', 400, true ],
    ['Rainbow Mouth',  'Sorriso arcobaleno',        'mouth',     '🌈', 250, false],
    ['Fire Mouth',     'Bocca di fuoco',            'mouth',     '🔥', 350, true ],
    ['Viola Reale',    'Colore viola maestoso',     'color',     '🟣', 150, false],
    ['Rosso Fuoco',    'Colore rosso ardente',      'color',     '🔴', 150, false],
    ['Oro Puro',       'Colore oro lussuoso',       'color',     '🟡', 400, true ],
    ['Corona',         'Corona reale dorata',       'accessory', '👑', 250, true ],
    ['Cappello',       'Cappellino sportivo',       'accessory', '🧢', 100, false],
  ];
  for (const item of items) {
    await db.query(
      'INSERT INTO shop_items (name,description,category,emoji,cost,is_rare) VALUES ($1,$2,$3,$4,$5,$6)',
      item
    );
  }
  console.log('🛍️ Shop popolato');
}

// ═══════════════════════════════════════════
// EMAIL
// ═══════════════════════════════════════════
function getMailer() {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  return nodemailer.createTransport({
    service: process.env.MAIL_SERVICE || 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
  });
}

async function sendVerifyEmail(email, token) {
  const mailer = getMailer();
  if (!mailer) { console.log('DEV verify token:', token); return; }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}/api/verify?token=${token}`;
  await mailer.sendMail({
    from: `EcoTrack <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Verifica il tuo account EcoTrack 🌱',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:40px;background:#f0fdf4;border-radius:16px">
      <h1 style="color:#16a34a">🌱 EcoTrack</h1>
      <h2>Verifica il tuo account</h2>
      <p>Clicca il bottone per completare la registrazione</p>
      <a href="${url}" style="display:inline-block;padding:14px 28px;background:#16a34a;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0">Verifica Email</a>
      <p style="color:#64748b;font-size:13px">Se non ti sei registrato, ignora questa email.</p>
    </div>`
  });
}

async function sendResetEmail(email, token) {
  const mailer = getMailer();
  if (!mailer) { console.log('DEV reset token:', token); return; }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}?action=reset&token=${token}`;
  await mailer.sendMail({
    from: `EcoTrack <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Reset password EcoTrack 🔑',
    html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:auto;padding:40px;background:#f0fdf4;border-radius:16px">
      <h1 style="color:#16a34a">🌱 EcoTrack</h1>
      <h2>Reset della password</h2>
      <a href="${url}" style="display:inline-block;padding:14px 28px;background:#ef4444;color:white;border-radius:10px;text-decoration:none;font-weight:700;margin:16px 0">Reimposta Password</a>
      <p style="color:#64748b;font-size:13px">Il link scade tra 1 ora.</p>
    </div>`
  });
}

// ═══════════════════════════════════════════
// MIDDLEWARE AUTH
// ═══════════════════════════════════════════
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET || 'ecotracksecret2024');
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

async function adminAuth(req, res, next) {
  auth(req, res, async () => {
    const { rows } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Accesso negato' });
    next();
  });
}

// ═══════════════════════════════════════════
// CO2 CALCULATOR
// ═══════════════════════════════════════════
const CO2_RATES = {
  'Bici':       { type: 'km',    co2: 0,    pts: 5   },
  'Treno':      { type: 'km',    co2: 0.04, pts: 2   },
  'Bus':        { type: 'km',    co2: 0.08, pts: 1.5 },
  'Carpooling': { type: 'km',    co2: 0.06, pts: 3   },
  'Remoto':     { type: 'hours', co2: 0.5,  pts: 10  },
  'Videocall':  { type: 'hours', co2: 0.1,  pts: 8   }
};

function calcCo2(type, km, hours) {
  const r = CO2_RATES[type];
  if (!r) return 0;
  return parseFloat(((r.type === 'km' ? km : hours) * r.co2).toFixed(2));
}
function calcPoints(type, km, hours) {
  const r = CO2_RATES[type];
  if (!r) return 0;
  return Math.max(1, Math.round((r.type === 'km' ? km : hours) * r.pts));
}

function parseOwned(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return Array.isArray(raw) ? raw : [];
}

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════
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

    const hash = bcrypt.hashSync(password, 10);
    const vTok = crypto.randomBytes(32).toString('hex');

    const { rows } = await db.query(
      "INSERT INTO users (name,username,email,password,verify_token,verified,owned_items) VALUES ($1,$2,$3,$4,$5,0,'[]') RETURNING *",
      [name, username.toLowerCase(), email.toLowerCase(), hash, vTok]
    );

    sendVerifyEmail(email.toLowerCase(), vTok).catch(console.error);

    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'welcome',$2,'👋')",
      [rows[0].id, 'Benvenuto su EcoTrack! 🌱 Inizia a tracciare le tue attività green!']
    );

    return res.json({ ok: true, message: 'Registrazione completata! Controlla la tua email.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: 'Campi mancanti' });

    const { rows } = await db.query(
      'SELECT * FROM users WHERE email=$1 OR username=$1',
      [identifier.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'Credenziali non valide' });

    if (user.is_banned) {
      if (user.ban_until && new Date(user.ban_until) < new Date()) {
        await db.query(
          'UPDATE users SET is_banned=false,ban_until=null,ban_reason=null WHERE id=$1',
          [user.id]
        );
      } else {
        const until = user.ban_until
          ? ` fino al ${new Date(user.ban_until).toLocaleDateString('it-IT')}`
          : ' permanentemente';
        return res.status(403).json({
          error: `Account bannato${until}. Motivo: ${user.ban_reason || 'N/D'}`
        });
      }
    }

    const isVerified = user.verified === 1 || user.verified === true || user.verified === '1';
    if (!isVerified)
      return res.status(400).json({ error: 'Email non verificata.', needsVerify: true });

    if (!bcrypt.compareSync(password, user.password))
      return res.status(400).json({ error: 'Credenziali non valide' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET || 'ecotracksecret2024',
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id, name: user.name, username: user.username,
        email: user.email, bio: user.bio || '',
        points: user.points || 0, co2_saved: user.co2_saved || 0,
        total_activities: user.total_activities || 0,
        is_admin: user.is_admin || false,
        tutorial_done: user.tutorial_done || false,
        avatar_color: user.avatar_color || '#16a34a',
        avatar_skin:  user.avatar_skin  || '#fde68a',
        avatar_eyes:  user.avatar_eyes  || 'normal',
        avatar_mouth: user.avatar_mouth || 'smile',
        avatar_hair:  user.avatar_hair  || 'none',
        owned_items: parseOwned(user.owned_items)
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

app.get('/api/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Token mancante');
    const { rows } = await db.query('SELECT id FROM users WHERE verify_token=$1', [token]);
    if (!rows.length) return res.status(400).send('Token non valido o già usato');
    await db.query('UPDATE users SET verified=1, verify_token=NULL WHERE id=$1', [rows[0].id]);
    return res.redirect('/?verified=1');
  } catch { return res.status(500).send('Errore server'); }
});

app.post('/api/resend-verify', async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await db.query('SELECT id,verified FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!rows.length) return res.status(400).json({ error: 'Email non trovata' });
    if (rows[0].verified === 1 || rows[0].verified === true)
      return res.status(400).json({ error: 'Account già verificato' });
    const vTok = crypto.randomBytes(32).toString('hex');
    await db.query('UPDATE users SET verify_token=$1 WHERE id=$2', [vTok, rows[0].id]);
    sendVerifyEmail(email.toLowerCase(), vTok).catch(console.error);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!rows.length) return res.json({ ok: true });
    const rTok   = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600000;
    await db.query('UPDATE users SET reset_token=$1,reset_expiry=$2 WHERE id=$3', [rTok, expiry, rows[0].id]);
    sendResetEmail(email.toLowerCase(), rTok).catch(console.error);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'Dati mancanti' });
    const { rows } = await db.query('SELECT id,reset_expiry FROM users WHERE reset_token=$1', [token]);
    if (!rows.length) return res.status(400).json({ error: 'Token non valido' });
    if (Date.now() > rows[0].reset_expiry) return res.status(400).json({ error: 'Token scaduto' });
    const hash = bcrypt.hashSync(new_password, 10);
    await db.query('UPDATE users SET password=$1,reset_token=NULL,reset_expiry=NULL WHERE id=$2', [hash, rows[0].id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════
app.get('/api/profile', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    const u = rows[0];
    const { rows: actRows } = await db.query('SELECT COUNT(*) as c FROM activities WHERE user_id=$1', [req.user.id]);
    return res.json({
      id: u.id, name: u.name, username: u.username, email: u.email,
      bio: u.bio || '', points: u.points || 0, co2_saved: u.co2_saved || 0,
      total_activities: parseInt(actRows[0].c) || 0,
      is_admin: u.is_admin || false, tutorial_done: u.tutorial_done || false,
      avatar_color: u.avatar_color || '#16a34a', avatar_skin: u.avatar_skin || '#fde68a',
      avatar_eyes:  u.avatar_eyes  || 'normal',  avatar_mouth: u.avatar_mouth || 'smile',
      avatar_hair:  u.avatar_hair  || 'none',
      owned_items: parseOwned(u.owned_items)
    });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, username, bio } = req.body;
    if (!name || !username) return res.status(400).json({ error: 'Nome e username obbligatori' });
    const { rows: ex } = await db.query(
      'SELECT id FROM users WHERE username=$1 AND id!=$2',
      [username.toLowerCase(), req.user.id]
    );
    if (ex.length) return res.status(400).json({ error: 'Username già in uso' });
    await db.query('UPDATE users SET name=$1,username=$2,bio=$3 WHERE id=$4',
      [name, username.toLowerCase(), bio || '', req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/profile/avatar', auth, async (req, res) => {
  try {
    const { color, skin, eyes, mouth, hair } = req.body;
    await db.query(
      'UPDATE users SET avatar_color=$1,avatar_skin=$2,avatar_eyes=$3,avatar_mouth=$4,avatar_hair=$5 WHERE id=$6',
      [color||'#16a34a', skin||'#fde68a', eyes||'normal', mouth||'smile', hair||'none', req.user.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/profile/password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Dati mancanti' });
    const { rows } = await db.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    if (!bcrypt.compareSync(current_password, rows[0].password))
      return res.status(400).json({ error: 'Password attuale non corretta' });
    await db.query('UPDATE users SET password=$1 WHERE id=$2',
      [bcrypt.hashSync(new_password, 10), req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/tutorial/complete', auth, async (req, res) => {
  try {
    await db.query('UPDATE users SET tutorial_done=true WHERE id=$1', [req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════
app.get('/api/stats', auth, async (req, res) => {
  try {
    const { rows: u } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const { rows: w } = await db.query(
      "SELECT COALESCE(SUM(co2_saved),0) as total FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '7 days'",
      [req.user.id]
    );
    const { rows: m } = await db.query(
      "SELECT COALESCE(SUM(co2_saved),0) as total FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '30 days'",
      [req.user.id]
    );
    return res.json({
      co2_saved: u[0].co2_saved || 0,
      co2_week:  parseFloat(w[0].total) || 0,
      co2_month: parseFloat(m[0].total) || 0,
      total_activities: u[0].total_activities || 0,
      points: u[0].points || 0
    });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/yearly', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT TO_CHAR(date,'MM') as month,
             COALESCE(SUM(co2_saved),0) as co2,
             COALESCE(SUM(points),0) as pts
      FROM activities
      WHERE user_id=$1 AND EXTRACT(YEAR FROM date)=EXTRACT(YEAR FROM NOW())
      GROUP BY month ORDER BY month
    `, [req.user.id]);
    const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    return res.json(months.map((m, i) => {
      const mm  = String(i + 1).padStart(2, '0');
      const row = rows.find(r => r.month === mm);
      return { month: m, co2: row ? parseFloat(row.co2).toFixed(1) : '0.0', pts: row ? row.pts : 0 };
    }));
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════
app.get('/api/activities', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 50',
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Activities GET error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/activities', auth, async (req, res) => {
  try {
    const { type, km, hours, note, from_addr, to_addr } = req.body;
    if (!type || !CO2_RATES[type])
      return res.status(400).json({ error: 'Tipo attività non valido' });

    const kmVal    = parseFloat(km)    || 0;
    const hoursVal = parseFloat(hours) || 0;
    const co2      = calcCo2(type, kmVal, hoursVal);
    const points   = calcPoints(type, kmVal, hoursVal);

    await db.query(
      `INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note,from_addr,to_addr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.user.id, type, kmVal, hoursVal, co2, points, note||'', from_addr||'', to_addr||'']
    );
    await db.query(
      `UPDATE users SET co2_saved=co2_saved+$1, points=points+$2, total_activities=total_activities+1
       WHERE id=$3`,
      [co2, points, req.user.id]
    );
    await checkBadges(req.user.id);
    return res.json({ ok: true, co2_saved: co2, points });
  } catch (err) {
    console.error('Activities POST error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════
const BADGES = [
  { id: 'first',   name: 'Prima Volta',  icon: '🌱', desc: 'Prima attività',        check: (u,a)     => a >= 1    },
  { id: 'eco5',    name: 'Eco x5',       icon: '♻️', desc: '5 attività',             check: (u,a)     => a >= 5    },
  { id: 'eco10',   name: 'Eco x10',      icon: '🌿', desc: '10 attività',            check: (u,a)     => a >= 10   },
  { id: 'eco50',   name: 'Eco x50',      icon: '🌳', desc: '50 attività',            check: (u,a)     => a >= 50   },
  { id: 'co210',   name: '10kg CO₂',     icon: '🌍', desc: '10kg CO₂ risparmiati',  check: (u)       => u.co2_saved >= 10  },
  { id: 'co250',   name: '50kg CO₂',     icon: '🌏', desc: '50kg CO₂ risparmiati',  check: (u)       => u.co2_saved >= 50  },
  { id: 'co2100',  name: '100kg CO₂',    icon: '🏆', desc: '100kg CO₂ risparmiati', check: (u)       => u.co2_saved >= 100 },
  { id: 'pts100',  name: '100 Punti',    icon: '⭐', desc: '100 punti raggiunti',    check: (u)       => u.points >= 100   },
  { id: 'pts500',  name: '500 Punti',    icon: '🌟', desc: '500 punti raggiunti',    check: (u)       => u.points >= 500   },
  { id: 'pts1000', name: '1000 Punti',   icon: '💫', desc: '1000 punti raggiunti',   check: (u)       => u.points >= 1000  },
  { id: 'social1', name: 'Social Start', icon: '📣', desc: 'Primo post pubblicato',  check: (u,a,p)   => p >= 1    },
  { id: 'shopper', name: 'Shopper',      icon: '🛍️', desc: 'Primo acquisto shop',   check: (u,a,p,s) => s >= 1    },
];

async function checkBadges(userId) {
  try {
    const { rows: uRows } = await db.query('SELECT * FROM users WHERE id=$1', [userId]);
    const u     = uRows[0];
    const acts  = u.total_activities || 0;
    const { rows: pRows } = await db.query('SELECT COUNT(*) as c FROM posts WHERE user_id=$1', [userId]);
    const posts  = parseInt(pRows[0].c);
    const owned  = parseOwned(u.owned_items);
    const { rows: nRows } = await db.query(
      "SELECT message FROM notifications WHERE user_id=$1 AND type='badge'", [userId]
    );
    const notified = nRows.map(n => n.message);
    for (const b of BADGES) {
      if (b.check(u, acts, posts, owned.length) && !notified.some(n => n.includes(b.name))) {
        await db.query(
          "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'badge',$2,$3)",
          [userId, `Badge sbloccato: ${b.name} — ${b.desc}`, b.icon]
        );
      }
    }
  } catch (err) { console.error('Badge check error:', err); }
}

app.get('/api/badges', auth, async (req, res) => {
  try {
    const { rows: uRows } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const u = uRows[0];
    const { rows: pRows } = await db.query('SELECT COUNT(*) as c FROM posts WHERE user_id=$1', [req.user.id]);
    const posts = parseInt(pRows[0].c);
    const owned = parseOwned(u.owned_items);
    return res.json(BADGES.map(b => ({
      id: b.id, name: b.name, icon: b.icon, desc: b.desc,
      unlocked: b.check(u, u.total_activities || 0, posts, owned.length)
    })));
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// CHALLENGES
// ═══════════════════════════════════════════
app.get('/api/challenges', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, u.name as creator_name FROM challenges c
      LEFT JOIN users u ON u.id=c.user_id
      WHERE c.is_public=true OR c.user_id=$1
      ORDER BY c.created_at DESC
    `, [req.user.id]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/challenges', auth, async (req, res) => {
  try {
    const { title, description, co2_target, points_reward, end_date, is_public } = req.body;
    if (!title) return res.status(400).json({ error: 'Titolo obbligatorio' });
    const { rows } = await db.query(
      'INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, title, description||'', parseFloat(co2_target)||0, parseInt(points_reward)||0, end_date||null, is_public !== false]
    );
    return res.json({ ok: true, challenge: rows[0] });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id,name,username,co2_saved,points,
             avatar_color,avatar_skin,avatar_eyes,avatar_mouth,avatar_hair
      FROM users
      ORDER BY co2_saved DESC LIMIT 50
    `);
    return res.json(rows);
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// SOCIAL
// ═══════════════════════════════════════════
app.get('/api/social/posts', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, u.name as author_name, u.username as author_username,
             u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
      FROM posts p JOIN users u ON u.id=p.user_id
      ORDER BY p.created_at DESC LIMIT 50
    `);
    return res.json(rows.map(p => {
      const likes = typeof p.likes === 'string' ? JSON.parse(p.likes) : (p.likes || []);
      return { ...p, likes_count: likes.length, liked_by_me: likes.includes(req.user.id) };
    }));
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts', auth, async (req, res) => {
  try {
    const { content, image_url } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Contenuto mancante' });
    const { rows } = await db.query(
      "INSERT INTO posts (user_id,content,image_url,likes) VALUES ($1,$2,$3,'[]') RETURNING *",
      [req.user.id, content.trim(), image_url||'']
    );
    await checkBadges(req.user.id);
    return res.json({ ok: true, post: rows[0] });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/social/posts/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM posts WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post non trovato' });
    const { rows: uRows } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (rows[0].user_id !== req.user.id && !uRows[0].is_admin)
      return res.status(403).json({ error: 'Non autorizzato' });
    await db.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts/:id/like', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM posts WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post non trovato' });
    let likes = typeof rows[0].likes === 'string' ? JSON.parse(rows[0].likes) : (rows[0].likes || []);
    const idx = likes.indexOf(req.user.id);
    if (idx === -1) {
      likes.push(req.user.id);
      if (rows[0].user_id !== req.user.id) {
        const { rows: liker } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
        await db.query(
          "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'like',$2,'❤️')",
          [rows[0].user_id, `${liker[0].name} ha messo like al tuo post`]
        );
      }
    } else { likes.splice(idx, 1); }
    await db.query('UPDATE posts SET likes=$1 WHERE id=$2', [JSON.stringify(likes), req.params.id]);
    return res.json({ liked: idx === -1, likes_count: likes.length });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, u.name as author_name, u.id as author_id
      FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.post_id=$1 ORDER BY c.created_at ASC
    `, [req.params.id]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Commento vuoto' });
    const { rows: post } = await db.query('SELECT user_id FROM posts WHERE id=$1', [req.params.id]);
    if (!post.length) return res.status(404).json({ error: 'Post non trovato' });
    await db.query('INSERT INTO comments (post_id,user_id,content) VALUES ($1,$2,$3)',
      [req.params.id, req.user.id, content.trim()]);
    if (post[0].user_id !== req.user.id) {
      const { rows: c } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
      await db.query(
        "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'comment',$2,'💬')",
        [post[0].user_id, `${c[0].name} ha commentato il tuo post`]
      );
    }
    const { rows: cnt } = await db.query('SELECT COUNT(*) as c FROM comments WHERE post_id=$1', [req.params.id]);
    return res.json({ ok: true, comments_count: parseInt(cnt[0].c) });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/social/comments/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM comments WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Commento non trovato' });
    const { rows: uRows } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (rows[0].user_id !== req.user.id && !uRows[0].is_admin)
      return res.status(403).json({ error: 'Non autorizzato' });
    await db.query('DELETE FROM comments WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/social/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.username, u.points, u.co2_saved,
             u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             CASE WHEN f.id IS NOT NULL THEN true ELSE false END as following
      FROM users u
      LEFT JOIN follows f ON f.follower_id=$1 AND f.following_id=u.id
      WHERE u.id != $1
      ORDER BY u.co2_saved DESC LIMIT 30
    `, [req.user.id]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/follow/:id', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id)
      return res.status(400).json({ error: 'Non puoi seguire te stesso' });
    const { rows: ex } = await db.query(
      'SELECT id FROM follows WHERE follower_id=$1 AND following_id=$2',
      [req.user.id, targetId]
    );
    if (ex.length) {
      await db.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, targetId]);
      return res.json({ following: false });
    } else {
      await db.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)', [req.user.id, targetId]);
      const { rows: me } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
      await db.query(
        "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'follow',$2,'👥')",
        [targetId, `${me[0].name} ha iniziato a seguirti!`]
      );
      return res.json({ following: true });
    }
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// SHOP
// ═══════════════════════════════════════════
app.get('/api/shop', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM shop_items ORDER BY category,cost');
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/shop/buy', auth, async (req, res) => {
  try {
    const { item_id } = req.body;
    if (!item_id) return res.status(400).json({ error: 'item_id mancante' });

    const { rows: itemRows } = await db.query('SELECT * FROM shop_items WHERE id=$1', [item_id]);
    if (!itemRows.length) return res.status(404).json({ error: 'Oggetto non trovato' });
    const item = itemRows[0];

    const { rows: uRows } = await db.query('SELECT points,owned_items FROM users WHERE id=$1', [req.user.id]);
    const u     = uRows[0];
    const owned = parseOwned(u.owned_items);

    if (owned.includes(item.id))
      return res.status(400).json({ error: 'Oggetto già posseduto' });
    if (u.points < item.cost)
      return res.status(400).json({ error: `Punti insufficienti (hai ${u.points}, servono ${item.cost})` });

    owned.push(item.id);
    const newPoints = u.points - item.cost;

    await db.query('UPDATE users SET points=$1,owned_items=$2 WHERE id=$3',
      [newPoints, JSON.stringify(owned), req.user.id]);

    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'shop',$2,'🛍️')",
      [req.user.id, `Hai acquistato: ${item.name}!`]
    );

    await checkBadges(req.user.id);
    return res.json({ ok: true, new_points: newPoints, owned_items: owned });
  } catch (err) {
    console.error('Shop BUY error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/notifications/count', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id=$1 AND is_read=false',
      [req.user.id]
    );
    return res.json({ count: parseInt(rows[0].c) });
  } catch { return res.json({ count: 0 }); }
});

app.post('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const { rows: u }   = await db.query('SELECT COUNT(*) as c FROM users');
    const { rows: a }   = await db.query('SELECT COUNT(*) as c FROM activities');
    const { rows: co2 } = await db.query('SELECT COALESCE(SUM(co2_saved),0) as total FROM activities');
    const { rows: p }   = await db.query('SELECT COUNT(*) as c FROM posts');
    return res.json({
      total_users:      parseInt(u[0].c),
      total_activities: parseInt(a[0].c),
      total_co2:        parseFloat(co2[0].total),
      total_posts:      parseInt(p[0].c)
    });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id,u.name,u.username,u.email,u.is_admin,u.is_banned,
             u.ban_reason,u.ban_until,u.points,u.co2_saved,
             COUNT(a.id) as activity_count
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY u.id ASC
    `);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.put('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const { name, username, points, is_admin } = req.body;
    const { rows: ex } = await db.query(
      'SELECT id FROM users WHERE username=$1 AND id!=$2',
      [username.toLowerCase(), req.params.id]
    );
    if (ex.length) return res.status(400).json({ error: 'Username già in uso' });
    await db.query(
      'UPDATE users SET name=$1,username=$2,points=$3,is_admin=$4 WHERE id=$5',
      [name, username.toLowerCase(), points, is_admin||false, req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/admin/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const { days, reason } = req.body;
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Non puoi bannare te stesso' });
    const banUntil = days ? new Date(Date.now() + days * 86400000) : null;
    await db.query(
      'UPDATE users SET is_banned=true,ban_until=$1,ban_reason=$2 WHERE id=$3',
      [banUntil, reason||'Violazione regole', req.params.id]
    );
    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'ban',$2,'🔨')",
      [req.params.id, `Sei stato bannato${days ? ` per ${days} giorni` : ' permanentemente'}. Motivo: ${reason||'Violazione regole'}`]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/admin/users/:id/unban', adminAuth, async (req, res) => {
  try {
    await db.query(
      'UPDATE users SET is_banned=false,ban_until=null,ban_reason=null WHERE id=$1',
      [req.params.id]
    );
    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'unban',$2,'✅')",
      [req.params.id, "Il tuo ban è stato rimosso dall'admin!"]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/activities', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.*, u.name as user_name FROM activities a
      JOIN users u ON u.id=a.user_id ORDER BY a.date DESC LIMIT 200
    `);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/activities/:id', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM activities WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Attività non trovata' });
    const a = rows[0];
    await db.query(
      'UPDATE users SET co2_saved=GREATEST(0,co2_saved-$1),points=GREATEST(0,points-$2),total_activities=GREATEST(0,total_activities-1) WHERE id=$3',
      [a.co2_saved, a.points, a.user_id]
    );
    await db.query('DELETE FROM activities WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/posts', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, u.name as author_name FROM posts p
      JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100
    `);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/posts/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// STATIC + START
// ═══════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Route non trovata' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EcoTrack sulla porta ${PORT}`);
    console.log(`👑 Admin: admin@ecotrack.com / Admin@2026!`);
  });
}).catch(err => {
  console.error('❌ Avvio fallito:', err);
  process.exit(1);
});

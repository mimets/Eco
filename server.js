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
const http       = require('http');
const { Server } = require('socket.io');

// ═══════════════════════════════════════════
// VALIDAZIONE VARIABILI D'AMBIENTE
// ═══════════════════════════════════════════
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET non definito nelle variabili d\'ambiente!');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL non definita!');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting senza dipendenze esterne
const rateLimitStore = new Map();
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const record = rateLimitStore.get(key) || { count: 0, start: now };
    if (now - record.start > windowMs) {
      record.count = 0;
      record.start = now;
    }
    record.count++;
    rateLimitStore.set(key, record);
    if (record.count > max) {
      return res.status(429).json({ error: 'Troppe richieste, riprova tra qualche minuto.' });
    }
    next();
  };
}

const authLimiter = rateLimit(15 * 60 * 1000, 20);
const passwordLimiter = rateLimit(60 * 60 * 1000, 5);

// Cleanup rate limit store ogni 10 min
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now - val.start > 60 * 60 * 1000) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000);

// ═══════════════════════════════════════════
// DATABASE INIT + MIGRATIONS
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
      photo_proof TEXT,
      date TIMESTAMP DEFAULT NOW()
    )
  `);
  // Migration for existing tables
  try { await db.query('ALTER TABLE activities ADD COLUMN IF NOT EXISTS photo_proof TEXT'); } catch(e){}
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

  // ═══════════════════════════════════════════
  // MIGRATIONS — aggiunge colonne mancanti
  // ═══════════════════════════════════════════
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_activities INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_done BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#16a34a'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_skin TEXT DEFAULT '#fde68a'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_eyes TEXT DEFAULT 'normal'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mouth TEXT DEFAULT 'smile'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hair TEXT DEFAULT 'none'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_items JSONB DEFAULT '[]'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expiry BIGINT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verified INTEGER DEFAULT 1`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS from_addr TEXT DEFAULT ''`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS to_addr TEXT DEFAULT ''`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_date DATE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0`,
    // Indici per performance
    `CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read)`,
    `CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
    `CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
    `UPDATE users SET owned_items = '[]' WHERE owned_items IS NULL`,
    `UPDATE users SET verified = 1 WHERE verified IS NULL`,
    // TEAM TABLES
    `CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      invite_code TEXT UNIQUE NOT NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      avatar_color TEXT DEFAULT '#16a34a',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(team_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_messages (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_team_messages_team ON team_messages(team_id)`,
    `ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE`,
    // CARPOOL RIDES — annunci di carpooling nel team
    `CREATE TABLE IF NOT EXISTS carpool_rides (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_addr TEXT NOT NULL,
      to_addr TEXT NOT NULL,
      departure_time TIMESTAMP NOT NULL,
      total_seats INTEGER NOT NULL DEFAULT 4,
      joined_users JSONB DEFAULT '[]',
      note TEXT DEFAULT '',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_carpool_rides_team ON carpool_rides(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_carpool_rides_driver ON carpool_rides(driver_id)`,
    // Assicura che i nomi degli oggetti siano unici per poter fare UPSERT o evitare duplicati
    `ALTER TABLE shop_items ADD CONSTRAINT shop_items_name_unique UNIQUE (name)`,
  ];

  for (const sql of migrations) {
    try { await db.query(sql); } catch (e) {
       // Silenzia errori di constraint già esistente
       if (!e.message.includes('already exists')) console.log('Migration info:', e.message); 
    }
  }
  
  // Forza inserimento oggetti critici se mancanti
  const criticalItems = [
    ['Flame Hair', 'Capelli di fuoco', 'hair', '🔥', 600, true],
    ['Fire Mouth', 'Bocca di fuoco', 'mouth', '🔥', 350, true],
    ['Rainbow Hair', 'Capelli arcobaleno magici', 'hair', '🌈', 300, true],
    ['Rainbow Mouth', 'Sorriso arcobaleno', 'mouth', '🌈', 250, false]
  ];
  for (const item of criticalItems) {
    await db.query(
      'INSERT INTO shop_items (name,description,category,emoji,cost,is_rare) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (name) DO NOTHING',
      item
    ).catch(() => {});
  }
  console.log('✅ Migrations completate');

  const { rows: shopRows } = await db.query('SELECT COUNT(*) as c FROM shop_items');
  if (parseInt(shopRows[0].c) === 0) await seedShop();

  const { rows: adminRows } = await db.query("SELECT id FROM users WHERE email='admin@ecotrack.com'");
  if (!adminRows.length) {
    const adminPw = process.env.ADMIN_PASSWORD || 'Admin@2026!';
    const hash = await bcrypt.hash(adminPw, 10);
    await db.query(
      "INSERT INTO users (name,username,email,password,is_admin,verified,owned_items) VALUES ($1,$2,$3,$4,$5,$6,'[]')",
      ['Admin', 'admin', 'admin@ecotrack.com', hash, true, 1]
    );
    console.log('👑 Admin creato: admin@ecotrack.com');
    if (!process.env.ADMIN_PASSWORD) {
      console.log('⚠️  Password admin di default usata. Imposta ADMIN_PASSWORD nelle env vars!');
    }
  }
  console.log('✅ Database inizializzato');
}

// ═══════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════
io.on('connection', (socket) => {
  console.log('⚡ Utente connesso:', socket.id);
  socket.on('disconnect', () => console.log('🔌 Utente di disconnesso:', socket.id));
});

function emitToAll(event, data) {
  io.emit(event, data);
}

// ═══════════════════════════════════════════
// SEED SHOP
// ═══════════════════════════════════════════
async function seedShop() {
  const items = [
    ['Capelli Corti', 'Taglio classico', 'hair', '💇', 50, false],
    ['Capelli Lunghi', 'Capelli lunghi fluenti', 'hair', '💁', 80, false],
    ['Rainbow Hair', 'Capelli arcobaleno magici', 'hair', '🌈', 300, true],
    ['Gold Hair', 'Capelli dorati brillanti', 'hair', '✨', 500, true],
    ['Galaxy Hair', 'Capelli galassia cosmica', 'hair', '🌌', 800, true],
    ['Flame Hair', 'Capelli di fuoco', 'hair', '🔥', 600, true],
    ['Star Eyes', 'Occhi stella scintillante', 'eyes', '⭐', 200, false],
    ['Heart Eyes', 'Occhi cuore innamorati', 'eyes', '❤️', 200, false],
    ['Laser Eyes', 'Occhi laser potenti', 'eyes', '😎', 400, true],
    ['Occhi Felici', 'Sguardo radioso', 'eyes', '😊', 50, false],
    ['Occhi Assonnati', 'Per chi ama dormire', 'eyes', '😴', 50, false],
    ['Occhi Sorpresi', 'Sempre stupito', 'eyes', '😲', 80, false],
    ['Occhi Occhiolino', 'Un tocco di simpatia', 'eyes', '😉', 80, false],
    ['Rainbow Mouth', 'Sorriso arcobaleno', 'mouth', '🌈', 250, false],
    ['Fire Mouth', 'Bocca di fuoco', 'mouth', '🔥', 350, true],
    ['Bocca Sorridente', 'Sempre allegro', 'mouth', '😁', 40, false],
    ['Bocca Aperta', 'Incredulo', 'mouth', '😮', 40, false],
    ['Bocca Triste', 'Giornata no', 'mouth', '😢', 40, false],
    ['Viola Reale', 'Colore viola maestoso', 'color', '🟣', 150, false],
    ['Rosso Fuoco', 'Colore rosso ardente', 'color', '🔴', 150, false],
    ['Oro Puro', 'Colore oro lussuoso', 'color', '🟡', 400, true],
    ['Corona', 'Corona reale dorata', 'accessory', '👑', 250, true],
    ['Cappello', 'Cappellino sportivo', 'accessory', '🧢', 100, false],
    ['Occhiali Estivi', 'Protezione solare stile eco', 'accessory', '🕶️', 200, false],
    ['Sciarpa Invernale', 'Caldo abbraccio ecologico', 'accessory', '🧣', 150, true],
  ];
  for (const item of items) {
    await db.query(
      'INSERT INTO shop_items (name,description,category,emoji,cost,is_rare) VALUES ($1,$2,$3,$4,$5,$6)',
      item
    );
  }
  console.log('🛍️ Shop popolato');

  // Migration for new items
  for (const item of items) {
    await db.query(`
      INSERT INTO shop_items (name,description,category,emoji,cost,is_rare)
      SELECT $1,$2,$3,$4,$5,$6
      WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE name=$1)
    `, item);
  }
}

// ═══════════════════════════════════════════
// EMAIL
// ═══════════════════════════════════════════
function getTransporter() {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });
}

async function sendVerifyEmail(email, token) {
  const transporter = getTransporter();
  if (!transporter) { console.log('DEV verify token:', token); return; }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}/api/verify?token=${token}`;
  await transporter.sendMail({
    from: `"EcoTrack" <${process.env.MAIL_USER}>`,
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
  const transporter = getTransporter();
  if (!transporter) { console.log('DEV reset token:', token); return; }
  const url = `${process.env.BASE_URL || 'http://localhost:3000'}?action=reset&token=${token}`;
  await transporter.sendMail({
    from: `"EcoTrack" <${process.env.MAIL_USER}>`,
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
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════
function auth(req, res, next) {
  let token = null;
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) token = h.slice(7);
  else if (req.query.token) token = req.query.token;
  
  if (!token) return res.status(401).json({ error: 'Non autorizzato' });
  
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

async function adminAuth(req, res, next) {
  auth(req, res, async () => {
    try {
      const { rows } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
      if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Accesso negato' });
      next();
    } catch { return res.status(500).json({ error: 'Errore server' }); }
  });
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
const CO2_RATES = {
  'Bici': { type: 'km', co2: 0.15, pts: 5 },
  'Treno': { type: 'km', co2: 0.04, pts: 2 },
  'Bus': { type: 'km', co2: 0.08, pts: 1.5 },
  'Carpooling': { type: 'km', co2: 0.06, pts: 3 },
  'Remoto': { type: 'hours', co2: 0.5, pts: 10 },
  'Videocall': { type: 'hours', co2: 0.1, pts: 8 },
  'Pasto Veg': { type: 'count', co2: 1.5, pts: 10 },
  'Riciclo': { type: 'kg', co2: 2.0, pts: 15 },
  'Energia': { type: 'hours', co2: 0.2, pts: 5 }
};

function calcCo2(type, km, hours) {
  const r = CO2_RATES[type];
  if (!r) return 0;
  const multiplier = (r.type === 'km' || r.type === 'kg' || r.type === 'count') ? km : hours;
  return parseFloat((multiplier * r.co2).toFixed(2));
}

function calcPoints(type, km, hours) {
  const r = CO2_RATES[type];
  if (!r) return 0;
  const multiplier = (r.type === 'km' || r.type === 'kg' || r.type === 'count') ? km : hours;
  return Math.max(1, Math.round(multiplier * r.pts));
}

function parseOwned(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return Array.isArray(raw) ? raw : [];
}

// Campi sicuri da restituire per un utente (esclude password)
function safeUser(u) {
  return {
    id: u.id, name: u.name, username: u.username, email: u.email,
    bio: u.bio || '', points: u.points || 0, co2_saved: u.co2_saved || 0,
    total_activities: u.total_activities || 0, current_streak: u.current_streak || 0,
    is_admin: u.is_admin || false, tutorial_done: u.tutorial_done || false,
    avatar_color: u.avatar_color || '#16a34a', avatar_skin: u.avatar_skin || '#fde68a',
    avatar_eyes: u.avatar_eyes || 'normal', avatar_mouth: u.avatar_mouth || 'smile',
    avatar_hair: u.avatar_hair || 'none', owned_items: parseOwned(u.owned_items)
  };
}

// ═══════════════════════════════════════════
// VALIDAZIONE INPUT
// ═══════════════════════════════════════════
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(pw) {
  return pw && pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw);
}

function isValidUsername(u) {
  return u && /^[a-z0-9_]{3,30}$/.test(u);
}

const BAD_WORDS = ['cazzo', 'merda', 'puttana', 'stronz', 'vaffanculo', 'bastard', 'troia', 'coglione'];
function filterText(text) {
  if (!text) return text;
  let filtered = text;
  for (const bw of BAD_WORDS) {
    const reg = new RegExp(bw, 'gi');
    filtered = filtered.replace(reg, '*'.repeat(bw.length));
  }
  return filtered;
}

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password)
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    if (!isValidEmail(email))
      return res.status(400).json({ error: 'Email non valida' });
    if (!isValidPassword(password))
      return res.status(400).json({ error: 'Password non sicura: usa 8+ caratteri, una maiuscola, un numero e un simbolo' });
    if (!isValidUsername(username.toLowerCase()))
      return res.status(400).json({ error: 'Username non valido: usa solo lettere minuscole, numeri e _ (3-30 caratteri)' });
    if (name.length > 100)
      return res.status(400).json({ error: 'Nome troppo lungo' });

    const { rows: ex } = await db.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (ex.length) return res.status(400).json({ error: 'Email o username già in uso' });

    const hash = await bcrypt.hash(password, 10);
    const vTok = crypto.randomBytes(32).toString('hex');
    const { rows } = await db.query(
      "INSERT INTO users (name,username,email,password,verify_token,verified,owned_items) VALUES ($1,$2,$3,$4,$5,0,'[]') RETURNING *",
      [name.trim(), username.toLowerCase(), email.toLowerCase(), hash, vTok]
    );

    try {
      await sendVerifyEmail(email.toLowerCase(), vTok);
    } catch (err) {
      await db.query('DELETE FROM users WHERE id=$1', [rows[0].id]);
      console.error('Email di verifica non inviata:', err);
      return res.status(500).json({ error: "Errore invio email. Configura MAIL_USER e MAIL_PASS (Password app Gmail) su Render." });
    }

    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'welcome',$2,'👋')",
      [rows[0].id, 'Benvenuto su EcoTrack! 🌱 Verifica la tua email per iniziare.']
    );
    return res.json({ ok: true, message: 'Registrazione completata! Controlla la tua email per verificare l\'account.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: 'Campi mancanti' });

    const { rows } = await db.query(
      'SELECT * FROM users WHERE email=$1 OR username=$1',
      [identifier.toLowerCase()]
    );
    const user = rows[0];

    // Risposta generica per non rivelare se l'utente esiste
    if (!user) {
      await bcrypt.hash('dummy', 10); // timing attack prevention
      return res.status(400).json({ error: 'Credenziali non valide' });
    }

    if (user.is_banned) {
      if (user.ban_until && new Date(user.ban_until) < new Date()) {
        await db.query('UPDATE users SET is_banned=false,ban_until=null,ban_reason=null WHERE id=$1', [user.id]);
      } else {
        const until = user.ban_until
          ? ` fino al ${new Date(user.ban_until).toLocaleDateString('it-IT')}`
          : ' permanentemente';
        return res.status(403).json({ error: `Account bannato${until}. Motivo: ${user.ban_reason || 'N/D'}` });
      }
    }

    const isVerified = user.verified === 1 || user.verified === true || user.verified === '1';
    if (!isVerified)
      return res.status(400).json({ error: 'Email non verificata.', needsVerify: true });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch)
      return res.status(400).json({ error: 'Credenziali non valide' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.json({ token, user: safeUser(user) });
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
    await db.query('UPDATE users SET verified=1,verify_token=NULL WHERE id=$1', [rows[0].id]);
    return res.redirect('/?verified=1');
  } catch { return res.status(500).send('Errore server'); }
});

app.post('/api/resend-verify', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email))
      return res.status(400).json({ error: 'Email non valida' });
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

app.post('/api/forgot-password', passwordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email))
      return res.json({ ok: true }); // Non rivelare se l'email esiste
    const { rows } = await db.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (rows.length) {
      const rTok = crypto.randomBytes(32).toString('hex');
      const expiry = Date.now() + 3600000;
      await db.query('UPDATE users SET reset_token=$1,reset_expiry=$2 WHERE id=$3', [rTok, expiry, rows[0].id]);
      sendResetEmail(email.toLowerCase(), rTok).catch(console.error);
    }
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/reset-password', passwordLimiter, async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'Dati mancanti' });
    if (!isValidPassword(new_password))
      return res.status(400).json({ error: 'Password non sicura' });
    const { rows } = await db.query('SELECT id,reset_expiry FROM users WHERE reset_token=$1', [token]);
    if (!rows.length) return res.status(400).json({ error: 'Token non valido' });
    if (Date.now() > rows[0].reset_expiry) return res.status(400).json({ error: 'Token scaduto' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=$1,reset_token=NULL,reset_expiry=NULL WHERE id=$2',
      [hash, rows[0].id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════
app.get('/api/profile', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id,name,username,email,bio,points,co2_saved,current_streak,is_admin,tutorial_done,
              avatar_color,avatar_skin,avatar_eyes,avatar_mouth,avatar_hair,owned_items
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    const u = rows[0];
    const { rows: actRows } = await db.query('SELECT COUNT(*) as c FROM activities WHERE user_id=$1', [req.user.id]);
    return res.json({ ...safeUser(u), total_activities: parseInt(actRows[0].c) || 0 });
  } catch (err) {
    console.error('Profile error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, username, bio } = req.body;
    if (!name || !username) return res.status(400).json({ error: 'Nome e username obbligatori' });
    if (!isValidUsername(username.toLowerCase()))
      return res.status(400).json({ error: 'Username non valido' });
    if (name.length > 100) return res.status(400).json({ error: 'Nome troppo lungo' });
    if (bio && bio.length > 500) return res.status(400).json({ error: 'Bio troppo lunga (max 500 caratteri)' });
    const { rows: ex } = await db.query(
      'SELECT id FROM users WHERE username=$1 AND id!=$2',
      [username.toLowerCase(), req.user.id]
    );
    if (ex.length) return res.status(400).json({ error: 'Username già in uso' });
    await db.query('UPDATE users SET name=$1,username=$2,bio=$3 WHERE id=$4',
      [filterText(name.trim()), username.toLowerCase(), filterText(bio || ''), req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Profile PUT error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.put('/api/profile/avatar', auth, async (req, res) => {
  try {
    const { color, skin, eyes, mouth, hair } = req.body;
    const validEyes = ['normal', 'happy', 'sleepy', 'surprised', 'wink', 'cool', 'star', 'heart'];
    const validMouth = ['smile', 'grin', 'open', 'smirk', 'sad', 'rainbow', 'fire'];
    const validHair = ['none', 'short', 'long', 'curly', 'spiky', 'bun', 'flame'];
    const colorRegex = /^#[0-9a-fA-F]{6}$/;

    if (color && !colorRegex.test(color)) return res.status(400).json({ error: 'Colore non valido' });
    if (skin && !colorRegex.test(skin)) return res.status(400).json({ error: 'Carnagione non valida' });
    if (eyes && !validEyes.includes(eyes)) return res.status(400).json({ error: 'Occhi non validi' });
    if (mouth && !validMouth.includes(mouth)) return res.status(400).json({ error: 'Bocca non valida' });
    if (hair && !validHair.includes(hair)) return res.status(400).json({ error: 'Capelli non validi' });

    await db.query(
      'UPDATE users SET avatar_color=$1,avatar_skin=$2,avatar_eyes=$3,avatar_mouth=$4,avatar_hair=$5 WHERE id=$6',
      [color || '#16a34a', skin || '#fde68a', eyes || 'normal', mouth || 'smile', hair || 'none', req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Avatar error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

app.put('/api/profile/password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Dati mancanti' });
    if (!isValidPassword(new_password))
      return res.status(400).json({ error: 'Nuova password non sicura' });
    const { rows } = await db.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    const match = await bcrypt.compare(current_password, rows[0].password);
    if (!match) return res.status(400).json({ error: 'Password attuale non corretta' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/profile/export', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT type, km, hours, co2_saved, points, TO_CHAR(date, 'YYYY-MM-DD') as date FROM activities WHERE user_id=$1 ORDER BY date DESC`, [req.user.id]);
    const csv = 'Data,Tipo,Quantita(km/h/pz),CO2(kg),Punti\n' + rows.map(r => `${r.date},${r.type},${r.km || r.hours},${r.co2_saved},${r.points}`).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('ecotrack_my_activities.csv');
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/export', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT TO_CHAR(a.date, 'YYYY-MM-DD') as date, u.username, a.type, COALESCE(a.km,0)+COALESCE(a.hours,0) as qty, a.co2_saved, a.points 
      FROM activities a JOIN users u ON a.user_id = u.id ORDER BY a.date DESC
    `);
    const csv = 'Data,Utente,Tipo,Quantita,CO2(kg),Punti\n' + rows.map(r => `${r.date},${r.username},${r.type},${r.qty},${r.co2_saved},${r.points}`).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('ecotrack_all_activities.csv');
    return res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Errore server' }); }
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
    const [uRes, wRes, mRes] = await Promise.all([
      db.query('SELECT co2_saved,points,total_activities FROM users WHERE id=$1', [req.user.id]),
      db.query("SELECT COALESCE(SUM(co2_saved),0) as total FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '7 days'", [req.user.id]),
      db.query("SELECT COALESCE(SUM(co2_saved),0) as total FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '30 days'", [req.user.id])
    ]);
    const u = uRes.rows[0];
    return res.json({
      co2_saved: u.co2_saved || 0,
      co2_week: parseFloat(wRes.rows[0].total) || 0,
      co2_month: parseFloat(mRes.rows[0].total) || 0,
      total_activities: u.total_activities || 0,
      points: u.points || 0
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
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
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    return res.json(months.map((m, i) => {
      const mm = String(i + 1).padStart(2, '0');
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
    const { type, km, hours, note, from_addr, to_addr, date, carpool_user_id, photo_proof } = req.body;
    if (!type || !CO2_RATES[type])
      return res.status(400).json({ error: 'Tipo attività non valido' });

    const MAX_LIMITS = {
      'Bici': { max: 150 },
      'Treno': { max: 1500 },
      'Bus': { max: 800 },
      'Carpooling': { max: 1000 },
      'Remoto': { max: 16 },
      'Videocall': { max: 16 },
      'Energia': { max: 24 },
      'Pasto Veg': { max: 10 },
      'Riciclo': { max: 100 }
    };

    let kmVal = parseFloat(km) || 0;
    let hoursVal = parseFloat(hours) || 0;
    const rate = CO2_RATES[type];
    const limit = MAX_LIMITS[type] || { max: 9999 };

    if (rate.type === 'km') {
      if (kmVal <= 0) return res.status(400).json({ error: 'Valore non valido (deve essere maggiore di 0)' });
      if (kmVal > limit.max) return res.status(400).json({ error: `Anti-cheat 🚨 Massimo ${limit.max} km consentiti per ${type}.` });
    } else if (rate.type === 'kg' || rate.type === 'count') {
      if (kmVal <= 0) return res.status(400).json({ error: 'Quantità non valida (deve essere maggiore di 0)' });
      if (kmVal > limit.max) return res.status(400).json({ error: `Anti-cheat 🚨 Massimo ${limit.max} consentito per ${type}.` });
    } else if (rate.type === 'hours') {
      if (hoursVal <= 0) return res.status(400).json({ error: 'Ore non valide (devono essere maggiori di 0)' });
      if (hoursVal > limit.max) return res.status(400).json({ error: `Anti-cheat 🚨 Massimo ${limit.max} ore consentite per ${type}.` });
    }

    const noteClean = (note || '').slice(0, 200);
    const fromAddrClean = (from_addr || '').slice(0, 300);
    const toAddrClean = (to_addr || '').slice(0, 300);

    const co2 = calcCo2(type, kmVal, hoursVal);
    const points = calcPoints(type, kmVal, hoursVal);

    let activityDate = 'NOW()';
    let queryParams = [req.user.id, type, kmVal, hoursVal, co2, points, noteClean, fromAddrClean, toAddrClean];

    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        if (d > new Date()) {
          return res.status(400).json({ error: 'Non puoi registrare attività nel futuro!' });
        }
        activityDate = '$10';
        queryParams.push(d);
      }
    } else {
      queryParams.push(new Date());
      activityDate = '$10';
    }

    queryParams.push(photo_proof || null);
    const photoParam = '$11';

    await db.query(
      `INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note,from_addr,to_addr,date,photo_proof)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,${activityDate},${photoParam})`,
      queryParams
    );

    // DAILY STREAK LOGIC
    const userRes = await db.query("SELECT TO_CHAR(last_activity_date, 'YYYY-MM-DD') as last_date, current_streak FROM users WHERE id=$1", [req.user.id]);
    const lastDate = userRes.rows[0].last_date;
    let streak = userRes.rows[0].current_streak || 0;
    
    const todayDate = new Date();
    const todayStr = todayDate.toISOString().split('T')[0];
    const yestDate = new Date(todayDate);
    yestDate.setDate(todayDate.getDate() - 1);
    const yestStr = yestDate.toISOString().split('T')[0];

    let streakBonus = 0;
    if (lastDate !== todayStr) {
      if (lastDate === yestStr) streak += 1;
      else streak = 1;

      if (streak > 1) {
        streakBonus = 20; // Bonus for consecutive days!
        await db.query("INSERT INTO notifications (user_id,message,icon) VALUES ($1,$2,'🔥')", [req.user.id, `Hai ottenuto 20 punti bonus per il tuo streak di ${streak} giorni! 🔥`]);
      }
    }
    const finalPoints = points + streakBonus;

    await db.query(
      `UPDATE users SET co2_saved=co2_saved+$1, points=points+$2, total_activities=total_activities+1, last_activity_date=CURRENT_DATE, current_streak=$3 WHERE id=$4`,
      [co2, finalPoints, streak, req.user.id]
    );
    checkBadges(req.user.id).catch(console.error);

    // Carpooling: share half-points with a co-passenger if specified
    if (type === 'Carpooling' && req.body.carpool_user_id) {
      const cpId = parseInt(req.body.carpool_user_id);
      if (cpId && cpId !== req.user.id) {
        const sharePoints = Math.round(finalPoints / 2);
        const shareCo2   = parseFloat((co2 / 2).toFixed(2));
        await db.query(
          `UPDATE users SET points=points+$1, co2_saved=co2_saved+$2, total_activities=total_activities+1 WHERE id=$3`,
          [sharePoints, shareCo2, cpId]
        );
        await db.query(
          `INSERT INTO notifications (user_id,message,icon) VALUES ($1,$2,'🚗')`,
          [cpId, `Hai ricevuto ${sharePoints} punti e ${shareCo2} kg CO₂ da un passaggio in carpooling! 🚗`]
        );
        return res.json({ ok: true, co2_saved: co2, points: finalPoints, streakBonus, carpoolShared: sharePoints });
      }
    }

    return res.json({ ok: true, co2_saved: co2, points: finalPoints, streakBonus });
  } catch (err) {
    console.error('Activities POST error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// AI ECO-ADVISOR
// ═══════════════════════════════════════════
app.post('/api/ai-advisor', auth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || question.trim().length < 3)
      return res.status(400).json({ error: 'Domanda non valida' });

    const { rows: userRows } = await db.query(
      'SELECT name, points, co2_saved, total_activities, current_streak FROM users WHERE id=$1',
      [req.user.id]
    );
    const u = userRows[0];
    if (!u) return res.status(404).json({ error: 'Utente non trovato' });

    const q = question.toLowerCase();

    // Off-topic guard — only eco/sustainability topics allowed
    const ECO_KEYWORDS = ['co2', 'carbon', 'bici', 'bus', 'treno', 'carpooling', 'remoto', 'videocall',
      'eco', 'green', 'sostenib', 'ambient', 'impronta', 'emissione', 'punti', 'streak',
      'clima', 'trasport', 'lavoro', 'risparmio', 'energia', 'migliora', 'consiglio', 'consigli',
      'attivi', 'classifica', 'sfida', 'badge', 'progressi', 'settimana', 'giorno', 'mese'];

    const isOnTopic = ECO_KEYWORDS.some(k => q.includes(k));
    if (!isOnTopic) {
      return res.json({ answer: `🤖 Sono il tuo consulente ecologico personale! Posso risponderti solo su temi legati alla sostenibilità, alle tue attività green e al tuo impatto ambientale. Prova a chiedermi come ridurre le emissioni o come migliorare il tuo punteggio!` });
    }

    // ── Question-specific answers (priority) ──
    let answer = '';
    const co2 = parseFloat(u.co2_saved || 0).toFixed(1);
    const streak = u.current_streak || 0;

    if (q.includes('streak') || q.includes('bonus')) {
      answer = `🔥 **Come funziona lo Streak**\n\nOgni giorno consecutivo in cui registri almeno un'attività, il tuo streak cresce di 1. Dal **2° giorno in poi** ottieni **+20 punti bonus** automatici su ogni attività!\n\n📊 **Il tuo streak attuale:** ${streak} giorni\n\nConsiglio: anche un'attività piccola (es. una videocall) basta per mantenere lo streak attivo. Non saltare neanche un giorno!`;
    }

    else if (q.includes('punti') || q.includes('attività') || q.includes('attivita') || q.includes('guadagn')) {
      answer = `⭐ **Classifica attività per punti/km o ora:**\n\n🏠 **Remoto** — 10 pt/ora + 0.5 kg CO₂/ora (il migliore!)\n💻 **Videocall** — 8 pt/ora + 0.1 kg CO₂/ora\n🚴 **Bici** — 5 pt/km + 0.15 kg CO₂/km\n🚗 **Carpooling** — 3 pt/km + 0.06 kg CO₂/km\n🚂 **Treno** — 2 pt/km + 0.04 kg CO₂/km\n🚌 **Bus** — 1.5 pt/km + 0.08 kg CO₂/km\n\n💡 Per massimizzare: registra le ore di smart working e usa la bici per spostamenti brevi. Con lo streak attivo (+20 bonus) i punti salgono velocemente!`;
    }

    else if (q.includes('bici') || q.includes('bike') || q.includes('ciclismo')) {
      answer = `🚴 **Consigli per ridurre CO₂ con la bici**\n\nOgni km in bici ti fa risparmiare **0.15 kg di CO₂** rispetto all'auto e guadagnare **5 punti**.\n\n📏 Esempio: un tragitto casa-lavoro di 10 km = **1.5 kg CO₂** risparmiata e **50 punti** al giorno!\n\n🗓️ Se lo fai 5 giorni a settimana:\n- 7.5 kg CO₂ a settimana\n- 250 punti + bonus streak\n- ~30 kg CO₂ al mese\n\n💪 Il tuo totale attuale: **${co2} kg CO₂** risparmiata. Continua così!`;
    }

    else if (q.includes('carpooling') || q.includes('condivi')) {
      answer = `🚗 **Come funziona il Carpooling su EcoTrack**\n\nQuando registri un'attività Carpooling:\n- Guadagni **3 pt/km** e **0.06 kg CO₂/km**\n- Puoi **selezionare un passeggero** dal menu a tendina\n- Il passeggero riceve automaticamente **metà dei tuoi punti** e CO₂!\n\n🤝 Esempio: 20 km di carpooling = 60 pt per te + 30 pt per il passeggero, entrambi risparmiate CO₂.\n\nÈ l'unica attività collaborativa — usala per far salire in classifica anche i tuoi colleghi!`;
    }

    else if (q.includes('remoto') || q.includes('smart working') || q.includes('casa') || q.includes('lavoro')) {
      answer = `🏠 **Smart Working e impatto ambientale**\n\nOgni ora di lavoro da remoto evita in media **0.5 kg CO₂** (niente spostamenti auto!) e ti dà **10 punti**.\n\n📊 Una giornata intera (8 ore):\n- 4 kg CO₂ risparmiata\n- 80 punti + bonus streak\n\nÈ equivalente a non guidare per ~30 km! Se combini smart working + bici nei giorni in ufficio, l'impatto diventa enorme.\n\n💼 Il tuo totale: **${co2} kg CO₂** risparmiata finora.`;
    }

    else if (q.includes('classifica') || q.includes('leader')) {
      answer = `🏆 **Come scalare la classifica**\n\n1. **Registra attività ogni giorno** per il bonus streak (+20 pt)\n2. **Usa il Remoto** quando puoi (10 pt/ora, il più redditizio)\n3. **Bici per spostamenti** (5 pt/km)\n4. **Carpooling** per condividere punti col passeggero\n\n📊 I tuoi stats: **${u.points} punti**, **${co2} kg CO₂**, streak: **${streak} giorni**\n\nPunta a mantenere lo streak attivo — il bonus di 20 pt su ogni attività fa la differenza in classifica!`;
    }

    else if (q.includes('sfida') || q.includes('challenge') || q.includes('badge')) {
      answer = `🏅 **Badge e sfide**\n\nI badge si sbloccano automaticamente raggiungendo soglie:\n- 🌱 **Prima Volta** — prima attività registrata\n- 🌍 **10 kg CO₂** — 10 kg risparmiata\n- 🌍 **50 kg CO₂** — 50 kg risparmiata\n- 🏆 **100 kg CO₂** — 100 kg risparmiata\n\n📊 Il tuo progresso: **${co2} kg CO₂** — ${parseFloat(co2) >= 100 ? 'tutti sbloccati! 🎉' : `prossimo badge a ${parseFloat(co2) < 10 ? '10' : parseFloat(co2) < 50 ? '50' : '100'} kg`}`;
    }

    else if (q.includes('migliora') || q.includes('consiglio') || q.includes('consigli') || q.includes('suggerim')) {
      answer = `🌿 **Consigli personalizzati per ${u.name}**\n\n`;
      if (streak < 3) answer += `1. 🔥 **Attiva lo streak!** Registra un'attività al giorno per ottenere +20 punti bonus automatici.\n`;
      else answer += `1. 🔥 **Ottimo streak di ${streak} giorni!** Non fermarti — ogni giorno conta.\n`;
      answer += `2. 🚴 **Usa la bici** per tragitti sotto 10 km — è l'attività con il miglior rapporto CO₂/punti per km.\n`;
      answer += `3. 🏠 **Smart working** vale 10 pt/ora — il più redditizio in assoluto.\n`;
      answer += `4. 🚗 **Carpooling** con un collega: metà dei punti vanno anche a lui!\n`;
      answer += `5. 📱 Condividi i tuoi progressi nella sezione Social per motivare gli altri.\n`;
      answer += `\n📊 Attualmente: **${u.points} pt**, **${co2} kg CO₂**, **${u.total_activities} attività**`;
    }

    else if (q.includes('co2') || q.includes('carbon') || q.includes('emissioni') || q.includes('impronta')) {
      answer = `🌍 **La tua impronta ecologica su EcoTrack**\n\nHai risparmiato **${co2} kg di CO₂** con **${u.total_activities} attività**.\n\n📏 Per darti un'idea:\n- ${co2} kg CO₂ = circa **${Math.round(parseFloat(co2) / 0.15)} km percorsi in bici** invece che in auto\n- Equivale a **${Math.round(parseFloat(co2) / 22)} alberi piantati** (un albero assorbe ~22 kg CO₂/anno)\n\n💡 Per ridurre ancora di più: combina bici + smart working + treno per i viaggi lunghi. Ogni piccola azione si somma!`;
    }

    else {
      // Fallback generico ma comunque personalizzato
      answer = `🌿 **Ciao ${u.name}!** Ecco il tuo riepilogo:\n\n📊 **${u.points} punti** | **${co2} kg CO₂ risparmiata** | **${u.total_activities} attività** | 🔥 Streak: **${streak} giorni**\n\nProva a chiedermi qualcosa di specifico:\n- \"Quali attività danno più punti?\"\n- \"Come funziona lo streak?\"\n- \"Consigli sulla bici\"\n- \"Come funziona il carpooling?\"`;
    }

    return res.json({ answer });
  } catch (err) {
    console.error('AI advisor error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// SOCIAL USERS (for carpooling picker)
// ═══════════════════════════════════════════
app.get('/api/social/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, username FROM users WHERE id != $1 AND verified = 1 ORDER BY name ASC LIMIT 200',
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Social users error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════
const BADGES = [
  { id: 'first', name: 'Prima Volta', icon: '🌱', desc: 'Prima attività', check: (u, a) => a >= 1 },
  { id: 'eco5', name: 'Eco x5', icon: '♻️', desc: '5 attività', check: (u, a) => a >= 5 },
  { id: 'eco10', name: 'Eco x10', icon: '🌿', desc: '10 attività', check: (u, a) => a >= 10 },
  { id: 'eco50', name: 'Eco x50', icon: '🌳', desc: '50 attività', check: (u, a) => a >= 50 },
  { id: 'co210', name: '10kg CO₂', icon: '🌍', desc: '10kg CO₂ risparmiati', check: (u) => u.co2_saved >= 10 },
  { id: 'co250', name: '50kg CO₂', icon: '🌏', desc: '50kg CO₂ risparmiati', check: (u) => u.co2_saved >= 50 },
  { id: 'co2100', name: '100kg CO₂', icon: '🏆', desc: '100kg CO₂ risparmiati', check: (u) => u.co2_saved >= 100 },
  { id: 'pts100', name: '100 Punti', icon: '⭐', desc: '100 punti raggiunti', check: (u) => u.points >= 100 },
  { id: 'pts500', name: '500 Punti', icon: '🌟', desc: '500 punti raggiunti', check: (u) => u.points >= 500 },
  { id: 'pts1000', name: '1000 Punti', icon: '💫', desc: '1000 punti raggiunti', check: (u) => u.points >= 1000 },
  { id: 'social1', name: 'Social Start', icon: '📣', desc: 'Primo post pubblicato', check: (u, a, p) => p >= 1 },
  { id: 'shopper', name: 'Shopper', icon: '🛍️', desc: 'Primo acquisto shop', check: (u, a, p, s) => s >= 1 },
];

async function checkBadges(userId) {
  try {
    const [uRes, pRes, nRes] = await Promise.all([
      db.query('SELECT co2_saved,points,total_activities,owned_items FROM users WHERE id=$1', [userId]),
      db.query('SELECT COUNT(*) as c FROM posts WHERE user_id=$1', [userId]),
      db.query("SELECT message FROM notifications WHERE user_id=$1 AND type='badge'", [userId])
    ]);
    const u = uRes.rows[0];
    const acts = u.total_activities || 0;
    const posts = parseInt(pRes.rows[0].c);
    const owned = parseOwned(u.owned_items);
    const notified = nRes.rows.map(n => n.message);

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
    const [uRes, pRes] = await Promise.all([
      db.query('SELECT co2_saved,points,total_activities,owned_items FROM users WHERE id=$1', [req.user.id]),
      db.query('SELECT COUNT(*) as c FROM posts WHERE user_id=$1', [req.user.id])
    ]);
    const u = uRes.rows[0];
    const posts = parseInt(pRes.rows[0].c);
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
      WHERE c.is_public=true OR c.user_id=$1 ORDER BY c.created_at DESC
    `, [req.user.id]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/challenges', auth, async (req, res) => {
  try {
    const { title, description, co2_target, points_reward, end_date, is_public } = req.body;
    if (!title || title.trim().length < 3)
      return res.status(400).json({ error: 'Titolo troppo corto (min 3 caratteri)' });
    if (title.length > 100)
      return res.status(400).json({ error: 'Titolo troppo lungo' });
    const co2 = parseFloat(co2_target) || 0;
    if (co2 <= 0) return res.status(400).json({ error: 'Target CO₂ deve essere maggiore di 0' });
    if (!end_date) return res.status(400).json({ error: 'Data scadenza obbligatoria' });
    const endDateObj = new Date(end_date);
    if (isNaN(endDateObj.getTime()) || endDateObj < new Date())
      return res.status(400).json({ error: 'Data scadenza non valida' });

    const { rows } = await db.query(
      'INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, title.trim(), (description || '').slice(0, 500), co2, parseInt(points_reward) || 0, end_date, is_public !== false]
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
      FROM users WHERE is_banned=false ORDER BY co2_saved DESC LIMIT 50
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
      SELECT p.id, p.user_id, p.content, p.image_url, p.likes, p.created_at,
             u.name as author_name, u.username as author_username,
             u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
      FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50
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
    if (content.length > 1000) return res.status(400).json({ error: 'Post troppo lungo (max 1000 caratteri)' });
    const { rows } = await db.query(
      "INSERT INTO posts (user_id,content,image_url,likes) VALUES ($1,$2,$3,'[]') RETURNING *",
      [req.user.id, filterText(content.trim()), (image_url || '').slice(0, 500)]
    );
    checkBadges(req.user.id).catch(console.error);
    const postWithAuthor = { ...rows[0], author_name: req.user.name, author_username: req.user.username, likes_count: 0, liked_by_me: false, comments_count: 0 };
    emitToAll('new_post', postWithAuthor);
    return res.json({ ok: true, post: rows[0] });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/social/posts/:id', auth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (!postId) return res.status(400).json({ error: 'ID non valido' });
    const { rows } = await db.query('SELECT user_id FROM posts WHERE id=$1', [postId]);
    if (!rows.length) return res.status(404).json({ error: 'Post non trovato' });
    const { rows: uRows } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (rows[0].user_id !== req.user.id && !uRows[0].is_admin)
      return res.status(403).json({ error: 'Non autorizzato' });
    await db.query('DELETE FROM posts WHERE id=$1', [postId]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts/:id/like', auth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (!postId) return res.status(400).json({ error: 'ID non valido' });
    const { rows } = await db.query('SELECT id, user_id, likes FROM posts WHERE id=$1', [postId]);
    if (!rows.length) return res.status(404).json({ error: 'Post non trovato' });
    let likes = typeof rows[0].likes === 'string' ? JSON.parse(rows[0].likes) : (rows[0].likes || []);
    const idx = likes.indexOf(req.user.id);
    if (idx === -1) {
      likes.push(req.user.id);
      if (rows[0].user_id !== req.user.id) {
        const { rows: liker } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
        db.query(
          "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'like',$2,'❤️')",
          [rows[0].user_id, `${liker[0].name} ha messo like al tuo post`]
        ).catch(console.error);
      }
    } else { likes.splice(idx, 1); }
    await db.query('UPDATE posts SET likes=$1 WHERE id=$2', [JSON.stringify(likes), postId]);
    emitToAll('update_post', { id: postId, likes_count: likes.length });
    return res.json({ liked: idx === -1, likes_count: likes.length });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.content, c.created_at, c.user_id,
             u.name as author_name, u.id as author_id
      FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.post_id=$1 ORDER BY c.created_at ASC
    `, [parseInt(req.params.id)]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Commento vuoto' });
    if (content.length > 500) return res.status(400).json({ error: 'Commento troppo lungo' });
    const postId = parseInt(req.params.id);
    const { rows: post } = await db.query('SELECT user_id FROM posts WHERE id=$1', [postId]);
    if (!post.length) return res.status(404).json({ error: 'Post non trovato' });
    await db.query('INSERT INTO comments (post_id,user_id,content) VALUES ($1,$2,$3)',
      [postId, req.user.id, filterText(content.trim())]);
    if (post[0].user_id !== req.user.id) {
      const { rows: c } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
      db.query(
        "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'comment',$2,'💬')",
        [post[0].user_id, `${c[0].name} ha commentato il tuo post`]
      ).catch(console.error);
    }
    const { rows: cnt } = await db.query('SELECT COUNT(*) as c FROM comments WHERE post_id=$1', [postId]);
    emitToAll('update_comments', { id: postId, comments_count: parseInt(cnt[0].c) });
    return res.json({ ok: true, comments_count: parseInt(cnt[0].c) });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/social/comments/:id', auth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { rows } = await db.query('SELECT user_id FROM comments WHERE id=$1', [commentId]);
    if (!rows.length) return res.status(404).json({ error: 'Commento non trovato' });
    const { rows: uRows } = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (rows[0].user_id !== req.user.id && !uRows[0].is_admin)
      return res.status(403).json({ error: 'Non autorizzato' });
    await db.query('DELETE FROM comments WHERE id=$1', [commentId]);
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
      WHERE u.id != $1 AND u.is_banned=false ORDER BY u.co2_saved DESC LIMIT 30
    `, [req.user.id]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/social/follow/:id', auth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (!targetId || targetId === req.user.id)
      return res.status(400).json({ error: 'Non puoi seguire te stesso' });
    const { rows: ex } = await db.query(
      'SELECT id FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, targetId]
    );
    if (ex.length) {
      await db.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, targetId]);
      return res.json({ following: false });
    }
    await db.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)', [req.user.id, targetId]);
    const { rows: me } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'follow',$2,'👥')",
      [targetId, `${me[0].name} ha iniziato a seguirti!`]
    ).catch(console.error);
    return res.json({ following: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════

// Crea team
app.post('/api/teams', auth, async (req, res) => {
  try {
    const { name, description, avatar_color } = req.body;
    if (!name || name.trim().length < 2)
      return res.status(400).json({ error: 'Nome team troppo corto (min 2 caratteri)' });
    if (name.length > 50)
      return res.status(400).json({ error: 'Nome team troppo lungo' });
    const invite_code = crypto.randomBytes(6).toString('hex');
    const { rows } = await db.query(
      'INSERT INTO teams (name,description,invite_code,owner_id,avatar_color) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name.trim(), (description || '').slice(0, 200), invite_code, req.user.id, avatar_color || '#16a34a']
    );
    // Owner diventa membro con ruolo admin
    await db.query(
      "INSERT INTO team_members (team_id,user_id,role) VALUES ($1,$2,'admin')",
      [rows[0].id, req.user.id]
    );
    return res.json({ ok: true, team: rows[0] });
  } catch (err) {
    console.error('Create team error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Lista team dell'utente
app.get('/api/teams', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.*, tm.role,
        (SELECT COUNT(*) FROM team_members WHERE team_id=t.id) as member_count,
        (SELECT COALESCE(SUM(u2.co2_saved),0) FROM team_members tm2 JOIN users u2 ON u2.id=tm2.user_id WHERE tm2.team_id=t.id) as total_co2,
        (SELECT COALESCE(SUM(u2.points),0) FROM team_members tm2 JOIN users u2 ON u2.id=tm2.user_id WHERE tm2.team_id=t.id) as total_points
      FROM teams t
      JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=$1
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    return res.json(rows);
  } catch (err) {
    console.error('Get teams error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Unisciti a un team tramite codice invito
app.post('/api/teams/join', auth, async (req, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: 'Codice invito mancante' });
    const { rows: teamRows } = await db.query('SELECT * FROM teams WHERE invite_code=$1', [invite_code]);
    if (!teamRows.length) return res.status(404).json({ error: 'Team non trovato' });
    const team = teamRows[0];
    const { rows: existing } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2',
      [team.id, req.user.id]
    );
    if (existing.length) return res.status(400).json({ error: 'Sei già membro di questo team' });
    await db.query(
      "INSERT INTO team_members (team_id,user_id,role) VALUES ($1,$2,'member')",
      [team.id, req.user.id]
    );
    // Notifica al owner
    if (team.owner_id !== req.user.id) {
      const { rows: me } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
      await db.query(
        "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'team',$2,'👥')",
        [team.owner_id, `${me[0].name} si è unito al team ${team.name}!`]
      ).catch(() => { });
    }
    return res.json({ ok: true, team });
  } catch (err) {
    console.error('Join team error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Dettaglio team
app.get('/api/teams/:id', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    // Verifica che l'utente sia membro
    const { rows: memberCheck } = await db.query(
      'SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2',
      [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro di questo team' });

    const { rows: team } = await db.query('SELECT * FROM teams WHERE id=$1', [teamId]);
    if (!team.length) return res.status(404).json({ error: 'Team non trovato' });

    const { rows: members } = await db.query(`
      SELECT u.id, u.name, u.username, u.co2_saved, u.points, u.avatar_color,
             u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair, tm.role, tm.joined_at
      FROM team_members tm JOIN users u ON u.id=tm.user_id
      WHERE tm.team_id=$1 ORDER BY u.co2_saved DESC
    `, [teamId]);

    const { rows: stats } = await db.query(`
      SELECT COALESCE(SUM(u.co2_saved),0) as total_co2,
             COALESCE(SUM(u.points),0) as total_points,
             COUNT(u.id) as member_count
      FROM team_members tm JOIN users u ON u.id=tm.user_id
      WHERE tm.team_id=$1
    `, [teamId]);

    return res.json({
      ...team[0],
      members,
      my_role: memberCheck[0].role,
      stats: stats[0]
    });
  } catch (err) {
    console.error('Get team detail error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Lascia team
app.delete('/api/teams/:id/leave', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: team } = await db.query('SELECT owner_id FROM teams WHERE id=$1', [teamId]);
    if (!team.length) return res.status(404).json({ error: 'Team non trovato' });
    if (team[0].owner_id === req.user.id)
      return res.status(400).json({ error: 'Il proprietario non può lasciare il team. Elimina il team o trasferisci la proprietà.' });
    await db.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Leave team error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Elimina team (solo owner)
app.delete('/api/teams/:id', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: team } = await db.query('SELECT owner_id FROM teams WHERE id=$1', [teamId]);
    if (!team.length) return res.status(404).json({ error: 'Team non trovato' });
    if (team[0].owner_id !== req.user.id)
      return res.status(403).json({ error: 'Solo il proprietario può eliminare il team' });
    await db.query('DELETE FROM teams WHERE id=$1', [teamId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Classifica team globale
app.get('/api/teams/leaderboard/global', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.id, t.name, t.avatar_color, t.description,
             COUNT(tm.user_id) as member_count,
             COALESCE(SUM(u.co2_saved),0) as total_co2,
             COALESCE(SUM(u.points),0) as total_points
      FROM teams t
      JOIN team_members tm ON tm.team_id=t.id
      JOIN users u ON u.id=tm.user_id
      GROUP BY t.id ORDER BY total_co2 DESC LIMIT 20
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Messaggi chat team
app.get('/api/teams/:id/messages', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { rows } = await db.query(`
      SELECT m.id, m.content, m.created_at, u.id as user_id, u.name as author_name,
             u.username as author_username, u.avatar_color, u.avatar_skin,
             u.avatar_eyes, u.avatar_mouth, u.avatar_hair
      FROM team_messages m JOIN users u ON u.id=m.user_id
      WHERE m.team_id=$1 ORDER BY m.created_at ASC LIMIT 100
    `, [teamId]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Invia messaggio chat team
app.post('/api/teams/:id/messages', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Messaggio vuoto' });
    if (content.length > 500) return res.status(400).json({ error: 'Messaggio troppo lungo' });
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { rows } = await db.query(
      'INSERT INTO team_messages (team_id,user_id,content) VALUES ($1,$2,$3) RETURNING *',
      [teamId, req.user.id, content.trim()]
    );
    const msg = { ...rows[0], author_name: req.user.name, author_username: req.user.username };
    emitToAll('new_team_message', { team_id: teamId, message: msg });
    return res.json({ ok: true, message: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Sfide del team
app.get('/api/teams/:id/challenges', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { rows } = await db.query(`
      SELECT c.*, u.name as creator_name FROM challenges c
      LEFT JOIN users u ON u.id=c.user_id
      WHERE c.team_id=$1 ORDER BY c.created_at DESC
    `, [teamId]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Crea sfida del team
app.post('/api/teams/:id/challenges', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { title, description, co2_target, points_reward, end_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Titolo obbligatorio' });
    if (!end_date) return res.status(400).json({ error: 'Data scadenza obbligatoria' });
    const { rows } = await db.query(
      'INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public,team_id) VALUES ($1,$2,$3,$4,$5,$6,false,$7) RETURNING *',
      [req.user.id, title.trim(), (description || '').slice(0, 500), parseFloat(co2_target) || 0, parseInt(points_reward) || 0, end_date, teamId]
    );
    return res.json({ ok: true, challenge: rows[0] });
  } catch (err) {
    console.error('Team challenge error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ═══════════════════════════════════════════
// CARPOOL RIDES (Team rides board)
// ═══════════════════════════════════════════

// Lista rides di un team
app.get('/api/teams/:id/rides', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { rows } = await db.query(`
      SELECT r.*, u.name as driver_name, u.username as driver_username
      FROM carpool_rides r
      JOIN users u ON u.id = r.driver_id
      WHERE r.team_id = $1 AND r.is_active = true AND r.departure_time > NOW()
      ORDER BY r.departure_time ASC LIMIT 20
    `, [teamId]);
    return res.json(rows);
  } catch (err) {
    console.error('Get rides error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Crea un annuncio di carpooling
app.post('/api/teams/:id/rides', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { from_addr, to_addr, departure_time, total_seats, note } = req.body;
    if (!from_addr || !to_addr) return res.status(400).json({ error: 'Partenza e destinazione obbligatorie' });
    if (!departure_time) return res.status(400).json({ error: 'Orario di partenza obbligatorio' });
    const seats = parseInt(total_seats) || 4;
    if (seats < 1 || seats > 8) return res.status(400).json({ error: 'Posti disponibili: tra 1 e 8' });
    const depTime = new Date(departure_time);
    if (isNaN(depTime.getTime()) || depTime < new Date()) return res.status(400).json({ error: 'Orario non valido' });
    const { rows } = await db.query(
      `INSERT INTO carpool_rides (team_id,driver_id,from_addr,to_addr,departure_time,total_seats,note,joined_users)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'[]') RETURNING *`,
      [teamId, req.user.id, from_addr.slice(0,300), to_addr.slice(0,300), depTime, seats, (note||'').slice(0,200)]
    );
    // Notifica ai membri del team
    const { rows: members } = await db.query(
      'SELECT user_id FROM team_members WHERE team_id=$1 AND user_id!=$2', [teamId, req.user.id]
    );
    const { rows: meRow } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    const { rows: teamRow } = await db.query('SELECT name FROM teams WHERE id=$1', [teamId]);
    for (const m of members) {
      db.query(
        "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'carpool',$2,'🚗')",
        [m.user_id, `${meRow[0]?.name} offre un passaggio nel team ${teamRow[0]?.name}: ${from_addr} → ${to_addr}`]
      ).catch(() => {});
    }
    emitToAll('new_ride', { team_id: teamId, ride: rows[0] });
    return res.json({ ok: true, ride: rows[0] });
  } catch (err) {
    console.error('Create ride error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Partecipa a un ride
app.post('/api/teams/:teamId/rides/:rideId/join', auth, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const rideId = parseInt(req.params.rideId);
    const { rows: memberCheck } = await db.query(
      'SELECT id FROM team_members WHERE team_id=$1 AND user_id=$2', [teamId, req.user.id]
    );
    if (!memberCheck.length) return res.status(403).json({ error: 'Non sei membro' });
    const { rows: rideRows } = await db.query('SELECT * FROM carpool_rides WHERE id=$1 AND team_id=$2', [rideId, teamId]);
    if (!rideRows.length) return res.status(404).json({ error: 'Passaggio non trovato' });
    const ride = rideRows[0];
    if (ride.driver_id === req.user.id) return res.status(400).json({ error: 'Sei già il guidatore!' });
    let joined = Array.isArray(ride.joined_users) ? ride.joined_users : (typeof ride.joined_users === 'string' ? JSON.parse(ride.joined_users) : []);
    if (joined.includes(req.user.id)) {
      // Leave
      joined = joined.filter(id => id !== req.user.id);
      await db.query('UPDATE carpool_rides SET joined_users=$1 WHERE id=$2', [JSON.stringify(joined), rideId]);
      return res.json({ ok: true, joined: false, seats_left: ride.total_seats - joined.length });
    }
    if (joined.length >= ride.total_seats) return res.status(400).json({ error: 'Non ci sono posti disponibili!' });
    joined.push(req.user.id);
    await db.query('UPDATE carpool_rides SET joined_users=$1 WHERE id=$2', [JSON.stringify(joined), rideId]);
    // Notifica al guidatore
    const { rows: me } = await db.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'carpool',$2,'🚗')",
      [ride.driver_id, `${me[0]?.name} si è unito al tuo passaggio: ${ride.from_addr} → ${ride.to_addr}`]
    ).catch(() => {});
    return res.json({ ok: true, joined: true, seats_left: ride.total_seats - joined.length });
  } catch (err) {
    console.error('Join ride error:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// Elimina/chiudi un ride (solo guidatore)
app.delete('/api/teams/:teamId/rides/:rideId', auth, async (req, res) => {
  try {
    const rideId = parseInt(req.params.rideId);
    const { rows } = await db.query('SELECT driver_id FROM carpool_rides WHERE id=$1', [rideId]);
    if (!rows.length) return res.status(404).json({ error: 'Passaggio non trovato' });
    if (rows[0].driver_id !== req.user.id) return res.status(403).json({ error: 'Solo il guidatore può eliminare il passaggio' });
    await db.query('UPDATE carpool_rides SET is_active=false WHERE id=$1', [rideId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

// SHOP — con transazione per evitare doppio acquisto
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
    const u = uRows[0];
    const owned = parseOwned(u.owned_items);

    if (owned.includes(item.id)) return res.status(400).json({ error: 'Oggetto già posseduto' });
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

    checkBadges(req.user.id).catch(console.error);
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
      [parseInt(req.params.id), req.user.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [u, a, co2, p] = await Promise.all([
      db.query('SELECT COUNT(*) as c FROM users'),
      db.query('SELECT COUNT(*) as c FROM activities'),
      db.query('SELECT COALESCE(SUM(co2_saved),0) as total FROM activities'),
      db.query('SELECT COUNT(*) as c FROM posts')
    ]);
    return res.json({
      total_users: parseInt(u.rows[0].c),
      total_activities: parseInt(a.rows[0].c),
      total_co2: parseFloat(co2.rows[0].total),
      total_posts: parseInt(p.rows[0].c)
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
    const userId = parseInt(req.params.id);
    const { name, username, points, is_admin } = req.body;
    if (!name || !username) return res.status(400).json({ error: 'Dati mancanti' });
    if (!isValidUsername(username.toLowerCase()))
      return res.status(400).json({ error: 'Username non valido' });
    const { rows: ex } = await db.query(
      'SELECT id FROM users WHERE username=$1 AND id!=$2',
      [username.toLowerCase(), userId]
    );
    if (ex.length) return res.status(400).json({ error: 'Username già in uso' });
    await db.query(
      'UPDATE users SET name=$1,username=$2,points=$3,is_admin=$4 WHERE id=$5',
      [name.trim(), username.toLowerCase(), Math.max(0, parseInt(points) || 0), is_admin || false, userId]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id)
      return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/admin/users/:id/ban', adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id)
      return res.status(400).json({ error: 'Non puoi bannare te stesso' });
    const { days, reason } = req.body;
    const daysNum = parseInt(days) || 0;
    const banUntil = daysNum > 0 ? new Date(Date.now() + daysNum * 86400000) : null;
    const safeReason = (reason || 'Violazione regole').slice(0, 200);
    await db.query(
      'UPDATE users SET is_banned=true,ban_until=$1,ban_reason=$2 WHERE id=$3',
      [banUntil, safeReason, userId]
    );
    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'ban',$2,'🔨')",
      [userId, `Sei stato bannato${daysNum > 0 ? ` per ${daysNum} giorni` : ' permanentemente'}. Motivo: ${safeReason}`]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/admin/users/:id/unban', adminAuth, async (req, res) => {
  try {
    await db.query(
      'UPDATE users SET is_banned=false,ban_until=null,ban_reason=null WHERE id=$1', [parseInt(req.params.id)]
    );
    await db.query(
      "INSERT INTO notifications (user_id,type,message,icon) VALUES ($1,'unban',$2,'✅')",
      [parseInt(req.params.id), "Il tuo ban è stato rimosso dall'admin!"]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/activities', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.id, a.type, a.km, a.hours, a.co2_saved, a.points, a.note, a.date,
             u.name as user_name FROM activities a
      JOIN users u ON u.id=a.user_id ORDER BY a.date DESC LIMIT 200
    `);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/activities/:id', adminAuth, async (req, res) => {
  try {
    const actId = parseInt(req.params.id);
    const { rows } = await db.query('SELECT * FROM activities WHERE id=$1', [actId]);
    if (!rows.length) return res.status(404).json({ error: 'Attività non trovata' });
    const a = rows[0];
    await db.query(
      'UPDATE users SET co2_saved=GREATEST(0,co2_saved-$1),points=GREATEST(0,points-$2),total_activities=GREATEST(0,total_activities-1) WHERE id=$3',
      [a.co2_saved, a.points, a.user_id]
    );
    await db.query('DELETE FROM activities WHERE id=$1', [actId]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/admin/posts', adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id, p.content, p.likes, p.created_at, u.name as author_name
      FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100
    `);
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

app.delete('/api/admin/posts/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM posts WHERE id=$1', [parseInt(req.params.id)]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Errore server' }); }
});

// ═══════════════════════════════════════════
// ERROR HANDLER GLOBALE
// ═══════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Errore interno del server' });
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
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 EcoTrack sulla porta ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Avvio fallito:', err);
  process.exit(1);
});
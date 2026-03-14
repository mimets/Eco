'use strict';
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Pool }   = require('pg');
const path       = require('path');
const crypto     = require('crypto');

const app = express();

// ══════════════════════════════════════════
//   CONFIG
// ══════════════════════════════════════════
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ecotrack_super_secret_2026';
const BASE_URL   = process.env.BASE_URL   || `http://localhost:${PORT}`;
const MAIL_FROM  = process.env.MAIL_FROM  || 'EcoTrack <ecotrackofficial@gmail.com>';
const MAIL_HOST  = process.env.MAIL_HOST  || 'smtp.gmail.com';
const MAIL_PORT  = parseInt(process.env.MAIL_PORT || '587');
const MAIL_USER  = process.env.MAIL_USER  || '';
const MAIL_PASS  = process.env.MAIL_PASS  || '';

const PUBLIC_DIR = path.join(__dirname, 'public');

// ══════════════════════════════════════════
//   DATABASE
// ══════════════════════════════════════════
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV==='production'
    ? { rejectUnauthorized: false }
    : false
});

// ══════════════════════════════════════════
//   MAILER
// ══════════════════════════════════════════
const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: false,
  auth: { user: MAIL_USER, pass: MAIL_PASS }
});

async function sendVerifyEmail(email, name, token) {
  const link = `${BASE_URL}/api/verify-email?token=${token}`;
  await transporter.sendMail({
    from: MAIL_FROM,
    to:   email,
    subject: '✅ Verifica il tuo account EcoTrack',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="background:linear-gradient(135deg,#16a34a,#22c55e);width:56px;height:56px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:28px">🌱</div>
          <h1 style="color:#0f172a;font-size:22px;margin:12px 0 4px">Benvenuto su EcoTrack!</h1>
          <p style="color:#64748b;font-size:14px">Ciao ${name}, verifica la tua email per iniziare</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;text-align:center;border:1px solid #e2e8f0">
          <p style="color:#334155;font-size:15px;margin-bottom:20px">
            Clicca il pulsante qui sotto per attivare il tuo account:
          </p>
          <a href="${link}"
            style="background:linear-gradient(135deg,#16a34a,#22c55e);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            ✅ Verifica Account
          </a>
          <p style="color:#94a3b8;font-size:12px;margin-top:20px">
            Link valido per 24 ore.<br>
            Se non hai creato un account ignora questa email.
          </p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">
          EcoTrack — Traccia le tue azioni per il pianeta 🌍
        </p>
      </div>`
  });
}

// ══════════════════════════════════════════
//   MIDDLEWARE
// ══════════════════════════════════════════
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function auth(req, res, next) {
  const h = req.headers['authorization'];
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error:'Non autorizzato' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error:'Token non valido' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin)
    return res.status(403).json({ error:'Solo per admin' });
  next();
}

// ══════════════════════════════════════════
//   CO2 RATES
// ══════════════════════════════════════════
const CO2_RATES = {
  Remoto:     { type:'h', co2:0.5,  pts:10  },
  Treno:      { type:'k', co2:0.04, pts:2   },
  Bici:       { type:'k', co2:0,    pts:5   },
  Bus:        { type:'k', co2:0.08, pts:1.5 },
  Carpooling: { type:'k', co2:0.06, pts:3   },
  Videocall:  { type:'h', co2:0.1,  pts:8   }
};

// ══════════════════════════════════════════
//   DB INIT
// ══════════════════════════════════════════
async function initDB() {
  console.log('🗄️ Initializing database...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id               SERIAL PRIMARY KEY,
      name             VARCHAR(100) NOT NULL,
      username         VARCHAR(50)  UNIQUE,
      email            VARCHAR(150) UNIQUE NOT NULL,
      password_hash    VARCHAR(255) NOT NULL,
      bio              TEXT         DEFAULT '',
      co2_saved        DECIMAL(10,2) DEFAULT 0,
      points           INT           DEFAULT 0,
      is_admin         BOOLEAN       DEFAULT false,
      is_banned        BOOLEAN       DEFAULT false,
      is_verified      BOOLEAN       DEFAULT false,
      verify_token     VARCHAR(64),
      verify_expires   TIMESTAMP,
      avatar_color     VARCHAR(20)  DEFAULT '#16a34a',
      avatar_skin      VARCHAR(20)  DEFAULT '#fde68a',
      avatar_eyes      VARCHAR(20)  DEFAULT 'normal',
      avatar_mouth     VARCHAR(20)  DEFAULT 'smile',
      avatar_hair      VARCHAR(20)  DEFAULT 'none',
      created_at       TIMESTAMP    DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id         SERIAL PRIMARY KEY,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      type       VARCHAR(50)  NOT NULL,
      km         DECIMAL(10,2) DEFAULT 0,
      hours      DECIMAL(10,2) DEFAULT 0,
      co2_saved  DECIMAL(10,2) DEFAULT 0,
      points     INT           DEFAULT 0,
      note       TEXT          DEFAULT '',
      from_addr  TEXT          DEFAULT '',
      to_addr    TEXT          DEFAULT '',
      date       TIMESTAMP     DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id             SERIAL PRIMARY KEY,
      creator_id     INT REFERENCES users(id) ON DELETE CASCADE,
      title          VARCHAR(200) NOT NULL,
      description    TEXT         DEFAULT '',
      co2_target     DECIMAL(10,2) DEFAULT 0,
      points_reward  INT           DEFAULT 0,
      end_date       TIMESTAMP,
      is_public      BOOLEAN       DEFAULT true,
      created_at     TIMESTAMP     DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INT REFERENCES users(id) ON DELETE CASCADE,
      followed_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (follower_id, followed_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      description TEXT         DEFAULT '',
      creator_id  INT REFERENCES users(id) ON DELETE CASCADE,
      invite_code VARCHAR(10)  UNIQUE,
      is_public   BOOLEAN      DEFAULT true,
      created_at  TIMESTAMP    DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id   INT REFERENCES groups(id) ON DELETE CASCADE,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      joined_at  TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (group_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      type       VARCHAR(50)  DEFAULT 'info',
      message    TEXT         NOT NULL,
      is_read    BOOLEAN      DEFAULT false,
      created_at TIMESTAMP    DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      description TEXT         DEFAULT '',
      category    VARCHAR(50)  NOT NULL,
      value       VARCHAR(100) NOT NULL,
      emoji       TEXT         DEFAULT '🎨',
      cost        INT          DEFAULT 100,
      is_rare     BOOLEAN      DEFAULT false
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_items (
      user_id  INT REFERENCES users(id) ON DELETE CASCADE,
      item_id  INT REFERENCES shop_items(id) ON DELETE CASCADE,
      bought_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, item_id)
    )
  `);

  // Alter existing tables for missing columns (safe migration)
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username       VARCHAR(50)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified    BOOLEAN   DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token   VARCHAR(64)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned      BOOLEAN   DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin       BOOLEAN   DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            TEXT      DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color   VARCHAR(20) DEFAULT '#16a34a'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_skin    VARCHAR(20) DEFAULT '#fde68a'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_eyes    VARCHAR(20) DEFAULT 'normal'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mouth   VARCHAR(20) DEFAULT 'smile'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hair    VARCHAR(20) DEFAULT 'none'`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS from_addr TEXT DEFAULT ''`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS to_addr   TEXT DEFAULT ''`,
  ];
  for (const m of migrations) {
    await pool.query(m).catch(()=>{});
  }

  // Fix utenti esistenti senza username
  await pool.query(`
    UPDATE users
    SET username = LOWER(REPLACE(name,' ','_')) || id::text
    WHERE username IS NULL OR username = ''
  `).catch(()=>{});

  // Fix utenti esistenti non verificati (se DB già usato)
  await pool.query(`
    UPDATE users SET is_verified=true
    WHERE is_verified IS NULL OR is_verified=false
    AND verify_token IS NULL
  `).catch(()=>{});

  // Seed shop items se vuoto
  const { rows: shopCount } = await pool.query('SELECT COUNT(*) FROM shop_items');
  if (parseInt(shopCount[0].count) === 0) {
    await seedShop();
  }

  console.log('✅ Database ready');
}

async function seedShop() {
  const items = [
    // HAIR
    { name:'Capelli Corti',   desc:'Stile classico e pulito',       cat:'hair',  val:'short',   emoji:'💇', cost:50,  rare:false },
    { name:'Capelli Lunghi',  desc:'Fluenti e naturali',            cat:'hair',  val:'long',    emoji:'💆', cost:80,  rare:false },
    { name:'Boccoli',         desc:'Ricci e vivaci',                cat:'hair',  val:'curly',   emoji:'🌀', cost:100, rare:false },
    { name:'Chignon',         desc:'Elegante e ordinato',           cat:'hair',  val:'bun',     emoji:'🎀', cost:120, rare:false },
    { name:'Cresta',          desc:'Rock e ribelle',                cat:'hair',  val:'mohawk',  emoji:'⚡', cost:150, rare:false },
    { name:'Mosso',           desc:'Onde naturali',                 cat:'hair',  val:'wavy',    emoji:'〰️', cost:130, rare:false },
    { name:'Cappellino',      desc:'Casual e sportivo',             cat:'hair',  val:'cap',     emoji:'🧢', cost:200, rare:false },
    { name:'Rainbow Hair',    desc:'Tutti i colori dell\'arcobaleno',cat:'hair', val:'rainbow', emoji:'🌈', cost:500, rare:true  },
    { name:'Capelli d\'Oro',  desc:'Prezioso come l\'oro',          cat:'hair',  val:'gold',    emoji:'✨', cost:400, rare:true  },
    { name:'Galassia',        desc:'Come lo spazio profondo',       cat:'hair',  val:'galaxy',  emoji:'🌌', cost:600, rare:true  },
    { name:'Fiamme',          desc:'Brucia di passione eco',        cat:'hair',  val:'flame',   emoji:'🔥', cost:700, rare:true  },
    // EYES
    { name:'Occhi Felici',    desc:'Sempre sorridente',             cat:'eyes',  val:'happy',     emoji:'😊', cost:80,  rare:false },
    { name:'Occhi Assonnati', desc:'Rilassato e sereno',            cat:'eyes',  val:'sleepy',    emoji:'😴', cost:80,  rare:false },
    { name:'Occhi Sorpresi',  desc:'Sempre stupito',                cat:'eyes',  val:'surprised', emoji:'😲', cost:100, rare:false },
    { name:'Occhiolino',      desc:'Malizioso e simpatico',         cat:'eyes',  val:'wink',      emoji:'😉', cost:120, rare:false },
    { name:'Occhiali Cool',   desc:'Stile anni \'80',               cat:'eyes',  val:'cool',      emoji:'😎', cost:200, rare:false },
    { name:'Occhi Stella',    desc:'Brilli di felicità',            cat:'eyes',  val:'star',      emoji:'⭐', cost:400, rare:true  },
    { name:'Occhi Cuore',     desc:'Innamorato del pianeta',        cat:'eyes',  val:'heart',     emoji:'❤️', cost:450, rare:true  },
    { name:'Occhi Laser',     desc:'Potere cosmico',                cat:'eyes',  val:'laser',     emoji:'🔴', cost:600, rare:true  },
    // MOUTH
    { name:'Sorriso Grande',  desc:'Sempre felice',                 cat:'mouth', val:'grin',      emoji:'😁', cost:60,  rare:false },
    { name:'Bocca Aperta',    desc:'Stupito dal pianeta',           cat:'mouth', val:'open',      emoji:'😮', cost:80,  rare:false },
    { name:'Mezzo Sorriso',   desc:'Misterioso e sicuro',           cat:'mouth', val:'smirk',     emoji:'😏', cost:100, rare:false },
    { name:'Linguaccia',      desc:'Allegro e giocoso',             cat:'mouth', val:'tongue',    emoji:'😛', cost:120, rare:false },
    { name:'Triste',          desc:'Per i giorni no',               cat:'mouth', val:'sad',       emoji:'🙁', cost:80,  rare:false },
    { name:'Bocca Arcobaleno',desc:'Magico e colorato',             cat:'mouth', val:'rainbow',   emoji:'🌈', cost:400, rare:true  },
    { name:'Bocca di Fuoco',  desc:'Passione eco-guerriero',        cat:'mouth', val:'fire',      emoji:'🔥', cost:450, rare:true  },
    // COLOR
    { name:'Verde Foresta',   desc:'Il colore della natura',        cat:'color', val:'#15803d',   emoji:'🟢', cost:50,  rare:false },
    { name:'Blu Oceano',      desc:'Come il mare profondo',         cat:'color', val:'#2563eb',   emoji:'🔵', cost:50,  rare:false },
    { name:'Viola Cielo',     desc:'Tramonto misterioso',           cat:'color', val:'#7c3aed',   emoji:'🟣', cost:80,  rare:false },
    { name:'Rosso Terra',     desc:'Calore della terra',            cat:'color', val:'#dc2626',   emoji:'🔴', cost:80,  rare:false },
    { name:'Arancio Sole',    desc:'Energia solare',                cat:'color', val:'#ea580c',   emoji:'🟠', cost:100, rare:false },
    { name:'Rosa Fiore',      desc:'Delicato come un petalo',       cat:'color', val:'#db2777',   emoji:'🌸', cost:100, rare:false },
    { name:'Oro Puro',        desc:'Prezioso eco-warrior',          cat:'color', val:'#d97706',   emoji:'🌟', cost:300, rare:true  },
    { name:'Neon Verde',      desc:'Fluorescente e futuristico',    cat:'color', val:'#4ade80',   emoji:'💚', cost:250, rare:true  },
    // SKIN
    { name:'Pelle Chiara',    desc:'Naturale e luminosa',           cat:'skin',  val:'#fde68a',   emoji:'👤', cost:0,   rare:false },
    { name:'Pelle Media',     desc:'Tono naturale caldo',           cat:'skin',  val:'#fbbf24',   emoji:'👤', cost:30,  rare:false },
    { name:'Pelle Scura',     desc:'Ricco e profondo',              cat:'skin',  val:'#92400e',   emoji:'👤', cost:30,  rare:false },
    { name:'Pelle Rosa',      desc:'Roseo e solare',                cat:'skin',  val:'#fca5a5',   emoji:'👤', cost:50,  rare:false },
    { name:'Pelle Azzurra',   desc:'Alieno eco-friendly',           cat:'skin',  val:'#bae6fd',   emoji:'👽', cost:200, rare:true  },
    { name:'Pelle Verde',     desc:'Elfo della foresta',            cat:'skin',  val:'#86efac',   emoji:'🧝', cost:200, rare:true  },
  ];

  for (const i of items) {
    await pool.query(
      `INSERT INTO shop_items (name,description,category,value,emoji,cost,is_rare)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [i.name,i.desc,i.cat,i.val,i.emoji,i.cost,i.rare]
    );
  }
  console.log('🛍️ Shop seeded with', items.length, 'items');
}
// ══════════════════════════════════════════
//   AUTH ROUTES
// ══════════════════════════════════════════
app.post('/api/register', async (req,res) => {
  const { name, username, email, password } = req.body;
  console.log('📝 Register attempt:', email, username);

  if (!name||!username||!email||!password)
    return res.status(400).json({ error:'Tutti i campi sono obbligatori' });
  if (/\s/.test(username))
    return res.status(400).json({ error:'Username senza spazi' });
  if (!/^[a-zA-Z0-9_\.]+$/.test(username))
    return res.status(400).json({ error:'Username non valido' });
  if (username.length < 3)
    return res.status(400).json({ error:'Username min 3 caratteri' });
  if (password.length < 8)
    return res.status(400).json({ error:'Password min 8 caratteri' });

  try {
    // check duplicati
    const { rows:existing } = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email.toLowerCase().trim(), username.toLowerCase().trim()]
    );
    if (existing.length)
      return res.status(409).json({ error:'Email o username già in uso' });

    const hash  = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24*60*60*1000); // 24h

    const { rows:[user] } = await pool.query(
      `INSERT INTO users
        (name,username,email,password_hash,is_verified,verify_token,verify_expires)
       VALUES ($1,$2,$3,$4,false,$5,$6)
       RETURNING id,name,username,email`,
      [
        name.trim(),
        username.toLowerCase().trim(),
        email.toLowerCase().trim(),
        hash, token, expires
      ]
    );

    // invia email verifica
    try {
      await sendVerifyEmail(user.email, user.name, token);
      console.log('📧 Verify email sent to:', user.email);
    } catch(mailErr) {
      console.error('❌ Mail error:', mailErr.message);
      // non bloccare la registrazione se mail fallisce
    }

    res.json({ needsVerify: true, message: 'Controlla la tua email!' });

  } catch(e) {
    console.error('❌ REGISTER ERROR:', e.message, e.stack);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ── VERIFY EMAIL ──────────────────────────
app.get('/api/verify-email', async (req,res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/?error=token_mancante');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users
       WHERE verify_token=$1 AND verify_expires > NOW()`,
      [token]
    );
    if (!rows.length)
      return res.redirect('/?error=token_scaduto');

    await pool.query(
      `UPDATE users
       SET is_verified=true, verify_token=NULL, verify_expires=NULL
       WHERE id=$1`,
      [rows[0].id]
    );

    console.log('✅ Email verified for:', rows[0].email);
    res.redirect('/?verified=1');
  } catch(e) {
    console.error('❌ VERIFY ERROR:', e.message);
    res.redirect('/?error=errore_server');
  }
});

// ── RESEND VERIFY ─────────────────────────
app.post('/api/resend-verify', async (req,res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error:'Email obbligatoria' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email=$1',
      [email.toLowerCase().trim()]
    );
    if (!rows.length)
      return res.status(404).json({ error:'Email non trovata' });
    if (rows[0].is_verified)
      return res.status(400).json({ error:'Account già verificato' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24*60*60*1000);

    await pool.query(
      'UPDATE users SET verify_token=$1,verify_expires=$2 WHERE id=$3',
      [token, expires, rows[0].id]
    );
    await sendVerifyEmail(email, rows[0].name, token);

    res.json({ ok:true });
  } catch(e) {
    console.error('❌ RESEND ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ── LOGIN ─────────────────────────────────
app.post('/api/login', async (req,res) => {
  const { identifier, password } = req.body;
  console.log('🔑 Login attempt:', identifier);

  if (!identifier||!password)
    return res.status(400).json({ error:'Campi mancanti' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM users
       WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1)
       LIMIT 1`,
      [identifier.trim()]
    );
    console.log('👤 User found:', rows.length);

    if (!rows.length)
      return res.status(401).json({ error:'Credenziali non valide' });

    const user = rows[0];

    if (user.is_banned)
      return res.status(403).json({ error:'Account bannato. Contatta il supporto.' });

    if (!user.is_verified)
      return res.status(403).json({
        error: 'Email non verificata. Controlla la casella.',
        needsVerify: true
      });

    const ok = await bcrypt.compare(password, user.password_hash);
    console.log('🔐 Password match:', ok);

    if (!ok)
      return res.status(401).json({ error:'Credenziali non valide' });

    const token = jwt.sign(
      { id:user.id, is_admin:user.is_admin },
      JWT_SECRET,
      { expiresIn:'30d' }
    );

    res.json({
      token,
      user: {
        id:           user.id,
        name:         user.name,
        username:     user.username,
        email:        user.email,
        co2_saved:    user.co2_saved,
        points:       user.points,
        is_admin:     user.is_admin,
        avatar_color: user.avatar_color,
        avatar_skin:  user.avatar_skin,
        avatar_eyes:  user.avatar_eyes,
        avatar_mouth: user.avatar_mouth,
        avatar_hair:  user.avatar_hair
      }
    });
  } catch(e) {
    console.error('❌ LOGIN ERROR:', e.message, e.stack);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   PROFILE ROUTES
// ══════════════════════════════════════════
app.get('/api/profile', auth, async (req,res) => {
  try {
    const { rows:[u] } = await pool.query(
      `SELECT u.*,
        (SELECT COUNT(*) FROM follows WHERE followed_id=u.id) AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) AS following,
        COALESCE(
          (SELECT json_agg(item_id) FROM user_items WHERE user_id=u.id),
          '[]'
        ) AS owned_items
       FROM users u WHERE u.id=$1`,
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error:'Utente non trovato' });
    delete u.password_hash;
    delete u.verify_token;
    res.json(u);
  } catch(e) {
    console.error('❌ PROFILE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.patch('/api/profile', auth, async (req,res) => {
  const {
    name, username, bio,
    avatar_color, avatar_skin,
    avatar_eyes, avatar_mouth, avatar_hair
  } = req.body;

  if (!name)     return res.status(400).json({ error:'Nome obbligatorio' });
  if (!username) return res.status(400).json({ error:'Username obbligatorio' });
  if (/\s/.test(username))
    return res.status(400).json({ error:'Username senza spazi' });
  if (!/^[a-zA-Z0-9_\.]+$/.test(username))
    return res.status(400).json({ error:'Username non valido' });

  try {
    // check username duplicato (escludi se stesso)
    const { rows:dup } = await pool.query(
      'SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND id!=$2',
      [username.trim(), req.user.id]
    );
    if (dup.length)
      return res.status(409).json({ error:'Username già in uso' });

    const { rows:[u] } = await pool.query(
      `UPDATE users SET
        name=$1, username=$2, bio=$3,
        avatar_color=$4, avatar_skin=$5,
        avatar_eyes=$6, avatar_mouth=$7, avatar_hair=$8
       WHERE id=$9
       RETURNING id,name,username,email,bio,co2_saved,points,
                 is_admin,avatar_color,avatar_skin,
                 avatar_eyes,avatar_mouth,avatar_hair`,
      [
        name.trim(), username.toLowerCase().trim(), bio||'',
        avatar_color||'#16a34a', avatar_skin||'#fde68a',
        avatar_eyes||'normal', avatar_mouth||'smile', avatar_hair||'none',
        req.user.id
      ]
    );
    res.json(u);
  } catch(e) {
    console.error('❌ PATCH PROFILE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   STATS + ACTIVITIES
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req,res) => {
  try {
    const { rows:[s] } = await pool.query(
      `SELECT
        u.co2_saved, u.points,
        COALESCE(SUM(CASE WHEN a.date >= NOW()-INTERVAL '7 days'
          THEN a.co2_saved ELSE 0 END),0) AS co2_week,
        COALESCE(SUM(CASE WHEN a.date >= NOW()-INTERVAL '30 days'
          THEN a.co2_saved ELSE 0 END),0) AS co2_month,
        COUNT(a.id) AS total_activities
       FROM users u
       LEFT JOIN activities a ON a.user_id=u.id
       WHERE u.id=$1
       GROUP BY u.co2_saved,u.points`,
      [req.user.id]
    );
    res.json(s||{});
  } catch(e) {
    console.error('❌ STATS ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.get('/api/yearly', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        TO_CHAR(date,'Mon') AS month,
        EXTRACT(MONTH FROM date) AS mon_num,
        SUM(co2_saved) AS co2,
        SUM(points) AS points
       FROM activities
       WHERE user_id=$1
         AND date >= DATE_TRUNC('year', NOW())
       GROUP BY month,mon_num
       ORDER BY mon_num`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ YEARLY ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.get('/api/activities', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ ACTIVITIES ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/activities', auth, async (req,res) => {
  const { type, km, hours, note, from_addr, to_addr } = req.body;
  if (!type) return res.status(400).json({ error:'Tipo obbligatorio' });

  const rate = CO2_RATES[type];
  if (!rate)  return res.status(400).json({ error:'Tipo non valido' });

  const val    = rate.type==='k' ? parseFloat(km||0) : parseFloat(hours||0);
  const co2    = parseFloat((val * rate.co2).toFixed(2));
  const points = Math.round(val * rate.pts);

  try {
    const { rows:[act] } = await pool.query(
      `INSERT INTO activities
        (user_id,type,km,hours,co2_saved,points,note,from_addr,to_addr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.user.id, type,
        parseFloat(km||0), parseFloat(hours||0),
        co2, points,
        note||'', from_addr||'', to_addr||''
      ]
    );

    await pool.query(
      `UPDATE users
       SET co2_saved=co2_saved+$1, points=points+$2
       WHERE id=$3`,
      [co2, points, req.user.id]
    );

    // Badge check
    await checkAndAwardBadges(req.user.id);

    res.json({ ...act, co2_saved:co2, points });
  } catch(e) {
    console.error('❌ ACTIVITY POST ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
const BADGES = [
  { id:'first',    name:'Prima Azione',     icon:'🌱', desc:'Completa la prima attività',    check: s => s.total>=1    },
  { id:'co2_10',   name:'10 kg CO₂',        icon:'🌿', desc:'Salva 10 kg di CO₂',            check: s => s.co2>=10     },
  { id:'co2_50',   name:'50 kg CO₂',        icon:'🌳', desc:'Salva 50 kg di CO₂',            check: s => s.co2>=50     },
  { id:'co2_100',  name:'100 kg CO₂',       icon:'🌍', desc:'Salva 100 kg di CO₂',           check: s => s.co2>=100    },
  { id:'co2_500',  name:'500 kg CO₂',       icon:'🏆', desc:'Salva 500 kg di CO₂',           check: s => s.co2>=500    },
  { id:'pts_100',  name:'100 Punti',         icon:'⭐', desc:'Raggiungi 100 punti',            check: s => s.pts>=100    },
  { id:'pts_500',  name:'500 Punti',         icon:'💫', desc:'Raggiungi 500 punti',            check: s => s.pts>=500    },
  { id:'streak_7', name:'7 giorni di fila',  icon:'🔥', desc:'Attività 7 giorni consecutivi', check: s => s.streak>=7   },
  { id:'bici_10',  name:'Ciclista',          icon:'🚴', desc:'10 attività in Bici',           check: s => s.bici>=10    },
  { id:'social',   name:'Social Butterfly',  icon:'👥', desc:'Segui 5 utenti',                check: s => s.follows>=5  },
];

async function checkAndAwardBadges(userId) {
  try {
    const { rows:[u] } = await pool.query(
      'SELECT co2_saved,points FROM users WHERE id=$1',[userId]
    );
    const { rows:acts } = await pool.query(
      'SELECT type,date FROM activities WHERE user_id=$1 ORDER BY date DESC',[userId]
    );
    const { rows:[fc] } = await pool.query(
      'SELECT COUNT(*) AS c FROM follows WHERE follower_id=$1',[userId]
    );

    // streak calc
    let streak=0, prev=null;
    for (const a of acts) {
      const d = new Date(a.date).toDateString();
      if (!prev) { streak=1; prev=d; continue; }
      const diff = (new Date(prev)-new Date(d))/(1000*60*60*24);
      if (diff<=1&&diff>=0) { if(d!==prev){streak++;prev=d;} }
      else break;
    }

    const stats = {
      co2:     parseFloat(u.co2_saved||0),
      pts:     u.points||0,
      total:   acts.length,
      bici:    acts.filter(a=>a.type==='Bici').length,
      streak,
      follows: parseInt(fc.c||0)
    };

    const { rows:existing } = await pool.query(
      'SELECT badge_id FROM user_badges WHERE user_id=$1',[userId]
    ).catch(()=>({ rows:[] }));

    const owned = existing.map(r=>r.badge_id);

    for (const b of BADGES) {
      if (!owned.includes(b.id) && b.check(stats)) {
        await pool.query(
          'INSERT INTO user_badges (user_id,badge_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [userId, b.id]
        ).catch(()=>{});
        await pool.query(
          'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
          [userId,'badge',`🏅 Badge sbloccato: ${b.icon} ${b.name}!`]
        ).catch(()=>{});
      }
    }
  } catch(e) {
    console.error('Badge check error:', e.message);
  }
}

app.get('/api/badges', auth, async (req,res) => {
  try {
    const { rows:[u] } = await pool.query(
      'SELECT co2_saved,points FROM users WHERE id=$1',[req.user.id]
    );
    const { rows:acts } = await pool.query(
      'SELECT type,date FROM activities WHERE user_id=$1 ORDER BY date DESC',[req.user.id]
    );
    const { rows:[fc] } = await pool.query(
      'SELECT COUNT(*) AS c FROM follows WHERE follower_id=$1',[req.user.id]
    );
    let streak=0,prev=null;
    for (const a of acts) {
      const d=new Date(a.date).toDateString();
      if(!prev){streak=1;prev=d;continue;}
      const diff=(new Date(prev)-new Date(d))/(1000*60*60*24);
      if(diff<=1&&diff>=0){if(d!==prev){streak++;prev=d;}}
      else break;
    }
    const stats={
      co2:parseFloat(u?.co2_saved||0),
      pts:u?.points||0,
      total:acts.length,
      bici:acts.filter(a=>a.type==='Bici').length,
      streak,
      follows:parseInt(fc?.c||0)
    };
    const { rows:owned } = await pool.query(
      'SELECT badge_id FROM user_badges WHERE user_id=$1',[req.user.id]
    ).catch(()=>({ rows:[] }));
    const ownedIds = owned.map(r=>r.badge_id);
    res.json(BADGES.map(b=>({ ...b, unlocked:ownedIds.includes(b.id) })));
  } catch(e) {
    console.error('❌ BADGES ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
app.get('/api/leaderboard', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,username,co2_saved,points,
        avatar_color,avatar_skin,avatar_eyes,avatar_mouth,avatar_hair
       FROM users
       WHERE is_banned=false
       ORDER BY co2_saved DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ LEADERBOARD ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.get('/api/challenges', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,u.name AS creator_name
       FROM challenges c
       LEFT JOIN users u ON u.id=c.creator_id
       WHERE c.is_public=true
          OR c.creator_id=$1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ CHALLENGES ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/challenges', auth, async (req,res) => {
  const { title,description,co2_target,points_reward,end_date,is_public } = req.body;
  if (!title) return res.status(400).json({ error:'Titolo obbligatorio' });
  try {
    const { rows:[ch] } = await pool.query(
      `INSERT INTO challenges
        (creator_id,title,description,co2_target,points_reward,end_date,is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id,title,description||'',
       co2_target||0,points_reward||0,
       end_date||null,is_public!==false]
    );
    res.json(ch);
  } catch(e) {
    console.error('❌ CHALLENGE POST ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   SOCIAL — FOLLOW
// ══════════════════════════════════════════
app.get('/api/users/search', auth, async (req,res) => {
  const q = req.query.q?.trim();
  if (!q||q.length<2) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.co2_saved,u.points,
        u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair,
        EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=u.id) AS is_following
       FROM users u
       WHERE (LOWER(u.name) LIKE LOWER($2) OR LOWER(u.username) LIKE LOWER($2))
         AND u.id!=$1 AND u.is_banned=false
       LIMIT 20`,
      [req.user.id, `%${q}%`]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ SEARCH ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.get('/api/following', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.co2_saved,u.points,
        u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair,
        true AS is_following
       FROM follows f JOIN users u ON u.id=f.followed_id
       WHERE f.follower_id=$1 AND u.is_banned=false
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ FOLLOWING ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.get('/api/followers', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.co2_saved,u.points,
        u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair,
        EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=u.id) AS is_following
       FROM follows f JOIN users u ON u.id=f.follower_id
       WHERE f.followed_id=$1 AND u.is_banned=false
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ FOLLOWERS ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/follow/:id', auth, async (req,res) => {
  const targetId = parseInt(req.params.id);
  if (targetId===req.user.id)
    return res.status(400).json({ error:'Non puoi seguire te stesso' });
  try {
    await pool.query(
      'INSERT INTO follows (follower_id,followed_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, targetId]
    );
    await pool.query(
      `INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)`,
      [targetId,'follow',
       `👥 ${req.user.name||'Qualcuno'} ha iniziato a seguirti!`]
    ).catch(()=>{});
    await checkAndAwardBadges(req.user.id);
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ FOLLOW ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.delete('/api/follow/:id', auth, async (req,res) => {
  try {
    await pool.query(
      'DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2',
      [req.user.id, req.params.id]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ UNFOLLOW ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});
// ══════════════════════════════════════════
//   GROUPS
// ══════════════════════════════════════════
app.get('/api/groups', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*,
        COUNT(DISTINCT gm.user_id) AS member_count,
        EXISTS(
          SELECT 1 FROM group_members
          WHERE group_id=g.id AND user_id=$1
        ) AS is_member
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id=g.id
       WHERE g.is_public=true
          OR g.creator_id=$1
          OR EXISTS(
            SELECT 1 FROM group_members
            WHERE group_id=g.id AND user_id=$1
          )
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ GROUPS ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/groups', auth, async (req,res) => {
  const { name, description, is_public } = req.body;
  if (!name) return res.status(400).json({ error:'Nome obbligatorio' });
  try {
    const invite_code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const { rows:[g] } = await pool.query(
      `INSERT INTO groups (name,description,creator_id,invite_code,is_public)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), description||'', req.user.id, invite_code, is_public!==false]
    );
    // creatore entra automaticamente
    await pool.query(
      'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [g.id, req.user.id]
    );
    res.json(g);
  } catch(e) {
    console.error('❌ GROUP CREATE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/groups/:id/join', auth, async (req,res) => {
  try {
    const { rows:[g] } = await pool.query(
      'SELECT * FROM groups WHERE id=$1',[req.params.id]
    );
    if (!g) return res.status(404).json({ error:'Gruppo non trovato' });
    if (!g.is_public)
      return res.status(403).json({ error:'Gruppo privato — usa il codice invito' });

    await pool.query(
      'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ GROUP JOIN ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/groups/join/:code', auth, async (req,res) => {
  const code = req.params.code?.toUpperCase();
  try {
    const { rows:[g] } = await pool.query(
      'SELECT * FROM groups WHERE UPPER(invite_code)=$1',[code]
    );
    if (!g) return res.status(404).json({ error:'Codice non valido' });

    await pool.query(
      'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [g.id, req.user.id]
    );

    // notifica creatore
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [g.creator_id,'info',
       `👥 Un nuovo membro si è unito al gruppo "${g.name}"!`]
    ).catch(()=>{});

    res.json({ ok:true, group:g });
  } catch(e) {
    console.error('❌ GROUP JOIN CODE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.delete('/api/groups/:id/leave', auth, async (req,res) => {
  try {
    await pool.query(
      'DELETE FROM group_members WHERE group_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ GROUP LEAVE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.get('/api/groups/:id/leaderboard', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.co2_saved,u.points,
        u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair
       FROM group_members gm
       JOIN users u ON u.id=gm.user_id
       WHERE gm.group_id=$1 AND u.is_banned=false
       ORDER BY u.co2_saved DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ GROUP LB ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/groups/:id/invite', auth, async (req,res) => {
  const { follower_ids } = req.body;
  if (!follower_ids?.length)
    return res.status(400).json({ error:'Nessun utente selezionato' });
  try {
    const { rows:[g] } = await pool.query(
      'SELECT * FROM groups WHERE id=$1',[req.params.id]
    );
    if (!g) return res.status(404).json({ error:'Gruppo non trovato' });

    let sent = 0;
    for (const uid of follower_ids) {
      await pool.query(
        'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, uid]
      );
      await pool.query(
        'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
        [uid,'group_invite',
         `👥 Sei stato invitato nel gruppo "${g.name}"! Vai su Social per vederlo.`]
      ).catch(()=>{});
      sent++;
    }
    res.json({ ok:true, sent });
  } catch(e) {
    console.error('❌ GROUP INVITE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
app.get('/api/shop', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM shop_items ORDER BY category,cost'
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ SHOP ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/shop/buy', auth, async (req,res) => {
  const { item_id } = req.body;
  if (!item_id) return res.status(400).json({ error:'item_id mancante' });
  try {
    const { rows:[item] } = await pool.query(
      'SELECT * FROM shop_items WHERE id=$1',[item_id]
    );
    if (!item) return res.status(404).json({ error:'Item non trovato' });

    const { rows:[user] } = await pool.query(
      'SELECT points FROM users WHERE id=$1',[req.user.id]
    );
    if (user.points < item.cost)
      return res.status(400).json({ error:'Punti insufficienti' });

    const { rows:exists } = await pool.query(
      'SELECT 1 FROM user_items WHERE user_id=$1 AND item_id=$2',
      [req.user.id, item_id]
    );
    if (exists.length)
      return res.status(400).json({ error:'Hai già questo oggetto' });

    await pool.query(
      'INSERT INTO user_items (user_id,item_id) VALUES ($1,$2)',
      [req.user.id, item_id]
    );
    await pool.query(
      'UPDATE users SET points=points-$1 WHERE id=$2',
      [item.cost, req.user.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.user.id,'shop',`🛍️ Hai acquistato: ${item.name}!`]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ SHOP BUY ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
app.get('/api/notifications', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ NOTIF ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/notifications/read', auth, async (req,res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read=true WHERE user_id=$1',
      [req.user.id]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ NOTIF READ ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
app.get('/api/admin/users', auth, adminOnly, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,username,email,co2_saved,points,
        is_admin,is_banned,is_verified,
        avatar_color,avatar_skin,avatar_eyes,avatar_mouth,avatar_hair,
        created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ ADMIN USERS ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/admin/ban/:id', auth, adminOnly, async (req,res) => {
  try {
    await pool.query(
      'UPDATE users SET is_banned=true WHERE id=$1',[req.params.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'ban','🚫 Il tuo account è stato bannato.']
    ).catch(()=>{});
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN BAN ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/admin/unban/:id', auth, adminOnly, async (req,res) => {
  try {
    await pool.query(
      'UPDATE users SET is_banned=false WHERE id=$1',[req.params.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'unban','✅ Il tuo account è stato riabilitato.']
    ).catch(()=>{});
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN UNBAN ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/admin/delete/:id', auth, adminOnly, async (req,res) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1',[req.params.id]);
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN DELETE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/admin/promote/:id', auth, adminOnly, async (req,res) => {
  try {
    await pool.query(
      'UPDATE users SET is_admin=true WHERE id=$1',[req.params.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'info','👑 Sei stato promosso Admin!']
    ).catch(()=>{});
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN PROMOTE ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/admin/warn/:id', auth, adminOnly, async (req,res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error:'Messaggio obbligatorio' });
  try {
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'warn','⚠️ Warning: '+message]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN WARN ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.post('/api/admin/resetco2/:id', auth, adminOnly, async (req,res) => {
  try {
    await pool.query(
      'UPDATE users SET co2_saved=0,points=0 WHERE id=$1',[req.params.id]
    );
    await pool.query(
      'DELETE FROM activities WHERE user_id=$1',[req.params.id]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN RESET ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.get('/api/admin/user-activities/:id', auth, adminOnly, async (req,res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch(e) {
    console.error('❌ ADMIN USER ACTS ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

app.delete('/api/admin/delete-activity/:id', auth, adminOnly, async (req,res) => {
  try {
    const { rows:[act] } = await pool.query(
      'SELECT * FROM activities WHERE id=$1',[req.params.id]
    );
    if (!act) return res.status(404).json({ error:'Attività non trovata' });
    await pool.query('DELETE FROM activities WHERE id=$1',[req.params.id]);
    await pool.query(
      'UPDATE users SET co2_saved=GREATEST(0,co2_saved-$1), points=GREATEST(0,points-$2) WHERE id=$3',
      [act.co2_saved||0, act.points||0, act.user_id]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ ADMIN DEL ACT ERROR:', e.message);
    res.status(500).json({ error:'Errore server: '+e.message });
  }
});

// ══════════════════════════════════════════
//   SPA FALLBACK + START
// ══════════════════════════════════════════
app.get('*', (req,res) => {
  res.sendFile(path.join(PUBLIC_DIR,'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 EcoTrack running on port ${PORT}`);
    console.log(`🌍 BASE_URL: ${BASE_URL}`);
    console.log(`📧 MAIL: ${MAIL_USER||'non configurata'}`);
  });
}).catch(err => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});
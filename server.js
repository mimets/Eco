'use strict';
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { Pool }   = require('pg');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ecotrack_secret_2024';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/ecotrack',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ✅ AUTO-DETECT public/ o root
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Token mancante' });
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token non valido' }); }
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Accesso negato' });
  next();
}

// ══════════════════════════════════════════
//   INIT DB
// ══════════════════════════════════════════
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100) NOT NULL,
        username      VARCHAR(50)  UNIQUE NOT NULL,
        email         VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        bio           TEXT    DEFAULT '',
        co2_saved     FLOAT   DEFAULT 0,
        points        INTEGER DEFAULT 0,
        is_admin      BOOLEAN DEFAULT false,
        is_banned     BOOLEAN DEFAULT false,
        avatar_color  VARCHAR(20) DEFAULT '#16a34a',
        avatar_skin   VARCHAR(20) DEFAULT '#fde68a',
        avatar_eyes   VARCHAR(30) DEFAULT 'normal',
        avatar_mouth  VARCHAR(30) DEFAULT 'smile',
        avatar_hair   VARCHAR(30) DEFAULT 'none',
        created_at    TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activities (
        id        SERIAL PRIMARY KEY,
        user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type      VARCHAR(50) NOT NULL,
        km        FLOAT   DEFAULT 0,
        hours     FLOAT   DEFAULT 0,
        co2_saved FLOAT   DEFAULT 0,
        points    INTEGER DEFAULT 0,
        note      TEXT    DEFAULT '',
        from_addr TEXT    DEFAULT '',
        to_addr   TEXT    DEFAULT '',
        date      TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS badges (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(100) NOT NULL,
        icon        VARCHAR(10)  NOT NULL,
        desc_text   TEXT DEFAULT '',
        unlocked_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS challenges (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(200) NOT NULL,
        description   TEXT    DEFAULT '',
        co2_target    FLOAT   DEFAULT 0,
        points_reward INTEGER DEFAULT 0,
        end_date      DATE,
        is_public     BOOLEAN DEFAULT true,
        created_at    TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS follows (
        follower_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (follower_id, following_id)
      );

      CREATE TABLE IF NOT EXISTS groups (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT    DEFAULT '',
        creator_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
        is_public   BOOLEAN DEFAULT true,
        invite_code VARCHAR(12) UNIQUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id  INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type       VARCHAR(50) DEFAULT 'info',
        message    TEXT NOT NULL,
        is_read    BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shop_items (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT    DEFAULT '',
        category    VARCHAR(50)  NOT NULL,
        cost        INTEGER DEFAULT 500,
        emoji       VARCHAR(10)  DEFAULT '🎁',
        value       VARCHAR(50)  NOT NULL,
        is_rare     BOOLEAN DEFAULT false,
        created_at  TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_items (
        user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_id   INTEGER REFERENCES shop_items(id) ON DELETE CASCADE,
        bought_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, item_id)
      );
    `);

    // ✅ FIX colonne mancanti su DB esistenti
    await client.query(`
      ALTER TABLE challenges ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE groups     ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12) UNIQUE;
    `);

    // Genera invite_code per gruppi esistenti senza
    await client.query(`
      UPDATE groups SET invite_code = SUBSTRING(MD5(RANDOM()::TEXT), 1, 8)
      WHERE invite_code IS NULL;
    `);

    // ── SEED SHOP ITEMS con prezzi alti ──
    const { rows: existing } = await client.query('SELECT COUNT(*) FROM shop_items');
    if (parseInt(existing[0].count) === 0) {
      await client.query(`
        INSERT INTO shop_items (name, description, category, cost, emoji, value, is_rare) VALUES
        -- CAPELLI (base: 300-600, premium: 1500-4000)
        ('Capelli Corti',   'Stile classico e pulito',      'hair',  300,  '💇', 'short',   false),
        ('Capelli Lunghi',  'Fluente e naturale',           'hair',  400,  '💆', 'long',    false),
        ('Ricci',           'Capelli mossi e voluminosi',   'hair',  400,  '🌀', 'curly',   false),
        ('Crocchia',        'Elegante e ordinata',          'hair',  500,  '🎀', 'bun',     false),
        ('Mohawk',          'Look alternativo',             'hair',  600,  '⚡', 'mohawk',  false),
        ('Ondulati',        'Capelli wavy naturali',        'hair',  500,  '〰️','wavy',    false),
        ('Cappellino',      'Con visiera sportiva',         'hair',  700,  '🧢', 'cap',     false),
        ('Rainbow Hair',    'Capelli arcobaleno premium',   'hair',  1500, '🌈', 'rainbow', true),
        ('Capelli Oro',     'Dorati e luminosi',            'hair',  2000, '✨', 'gold',    true),
        ('Galaxy Hair',     'Galassia nei capelli',         'hair',  3000, '🌌', 'galaxy',  true),
        ('Fiamma',          'Capelli di fuoco',             'hair',  4000, '🔥', 'flame',   true),
        -- OCCHI (base: 250-600, premium: 1500-3500)
        ('Occhi Felici',    'Espressione sorridente',       'eyes',  250,  '😊', 'happy',     false),
        ('Occhi Assonnati', 'Un po'' stanchi...',           'eyes',  250,  '😴', 'sleepy',    false),
        ('Occhi Sorpresi',  'Grande meraviglia',            'eyes',  350,  '😲', 'surprised', false),
        ('Occhiolino',      'Un simpatico ammicco',         'eyes',  350,  '😉', 'wink',      false),
        ('Occhi Cool',      'Con occhiali da sole',         'eyes',  600,  '😎', 'cool',      false),
        ('Occhi Stella',    'Stellari e brillanti',         'eyes',  1500, '⭐', 'star',      true),
        ('Occhi Cuore',     'Tutto amore',                  'eyes',  1500, '❤️','heart',     true),
        ('Laser Eyes',      'Devastanti e potenti',         'eyes',  3500, '🔴', 'laser',     true),
        -- BOCCA (base: 200-400, premium: 2000-3000)
        ('Sorriso Grin',    'Sorriso smagliante',           'mouth', 200,  '😁', 'grin',    false),
        ('Bocca Aperta',    'Stupore totale',               'mouth', 200,  '😮', 'open',    false),
        ('Smirk',           'Mezzo sorriso ironico',        'mouth', 350,  '😏', 'smirk',   false),
        ('Linguaccia',      'Allegro e giocoso',            'mouth', 350,  '😛', 'tongue',  false),
        ('Triste',          'Giornata no...',               'mouth', 150,  '🙁', 'sad',     false),
        ('Bocca Rainbow',   'Colori arcobaleno premium',    'mouth', 2500, '🌈', 'rainbow', true),
        ('Bocca Fuoco',     'Hot! Letteralmente.',          'mouth', 2000, '🔥', 'fire',    true),
        -- COLORI (base: 400-600, premium: 1200)
        ('Verde Lime',      'Colore avatar verde lime',     'color', 400,  '🟢', '#84cc16', false),
        ('Blu Oceano',      'Colore avatar blu oceano',     'color', 400,  '🔵', '#3b82f6', false),
        ('Viola Neon',      'Colore avatar viola neon',     'color', 400,  '🟣', '#8b5cf6', false),
        ('Rosso Fuoco',     'Colore avatar rosso fuoco',    'color', 400,  '🔴', '#ef4444', false),
        ('Rosa Neon',       'Colore avatar rosa neon',      'color', 500,  '🩷', '#ec4899', false),
        ('Teal',            'Colore avatar teal',           'color', 500,  '🩵', '#14b8a6', false),
        ('Arancione',       'Colore avatar arancione',      'color', 500,  '🟠', '#f97316', false),
        ('Indaco',          'Colore avatar indaco scuro',   'color', 1200, '🫐', '#4338ca', true),
        -- PELLE (base: 200-300)
        ('Pelle Miele',     'Tono pelle miele caldo',       'skin',  200,  '👤', '#fde68a', false),
        ('Pelle Chiara',    'Tono pelle molto chiaro',      'skin',  200,  '👤', '#fcd9a0', false),
        ('Pelle Media',     'Tono pelle medio naturale',    'skin',  200,  '👤', '#d4a76a', false),
        ('Pelle Olivastra', 'Tono pelle olivastro',         'skin',  200,  '👤', '#a0714a', false),
        ('Pelle Scura',     'Tono pelle scuro caldo',       'skin',  200,  '👤', '#7c4a2d', false),
        ('Pelle Ebano',     'Tono pelle ebano profondo',    'skin',  300,  '👤', '#4a2512', false)
      `);
      console.log('✅ Shop items seeded con prezzi bilanciati!');
    }

    console.log('✅ Database inizializzato');
    console.log('📁 Static files da:', PUBLIC_DIR);
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════
//   RATES & BADGES
// ══════════════════════════════════════════
const RATES = {
  Remoto:     { t:'h', co2:.5,  pts:10  },
  Treno:      { t:'k', co2:.04, pts:2   },
  Bici:       { t:'k', co2:0,   pts:5   },
  Bus:        { t:'k', co2:.08, pts:1.5 },
  Carpooling: { t:'k', co2:.06, pts:3   },
  Videocall:  { t:'h', co2:.1,  pts:8   }
};

const BADGES_DEF = [
  { name:'Prima Pedalata',  icon:'🚴', desc:'Prima attività in bici',            co2:0,    type:'Bici'      },
  { name:'10 kg CO₂',       icon:'🌱', desc:'Hai salvato 10 kg di CO₂',          co2:10,   type:null        },
  { name:'50 kg CO₂',       icon:'🌿', desc:'Hai salvato 50 kg di CO₂',          co2:50,   type:null        },
  { name:'100 kg CO₂',      icon:'🌳', desc:'Hai salvato 100 kg di CO₂',         co2:100,  type:null        },
  { name:'250 kg CO₂',      icon:'🌲', desc:'Hai salvato 250 kg di CO₂',         co2:250,  type:null        },
  { name:'500 kg CO₂',      icon:'🏆', desc:'Hai salvato 500 kg di CO₂',         co2:500,  type:null        },
  { name:'1000 kg CO₂',     icon:'🌍', desc:'Hai salvato 1000 kg di CO₂',        co2:1000, type:null        },
  { name:'Re del Treno',    icon:'🚂', desc:'10 attività in treno',              co2:0,    type:'Treno'     },
  { name:'Smart Worker',    icon:'🏠', desc:'5 giornate in remote working',      co2:0,    type:'Remoto'    },
  { name:'Videoconferenza', icon:'💻', desc:'Prima videocall invece di viaggio', co2:0,    type:'Videocall' },
];

async function checkBadges(userId) {
  const { rows:[user] } = await pool.query('SELECT co2_saved FROM users WHERE id=$1',[userId]);
  if (!user) return;
  const { rows:acts } = await pool.query(
    'SELECT type, COUNT(*) as cnt FROM activities WHERE user_id=$1 GROUP BY type',[userId]
  );
  const actMap = {};
  acts.forEach(a => actMap[a.type] = parseInt(a.cnt));
  const { rows:existing } = await pool.query('SELECT name FROM badges WHERE user_id=$1',[userId]);
  const existingNames = existing.map(b => b.name);

  for (const b of BADGES_DEF) {
    if (existingNames.includes(b.name)) continue;
    let earned = false;
    if (b.co2>0 && user.co2_saved>=b.co2)                  earned=true;
    if (b.type==='Bici'      && (actMap['Bici']     ||0)>=1)  earned=true;
    if (b.type==='Treno'     && (actMap['Treno']    ||0)>=10) earned=true;
    if (b.type==='Remoto'    && (actMap['Remoto']   ||0)>=5)  earned=true;
    if (b.type==='Videocall' && (actMap['Videocall']||0)>=1)  earned=true;
    if (earned) {
      await pool.query(
        'INSERT INTO badges (user_id,name,icon,desc_text) VALUES ($1,$2,$3,$4)',
        [userId,b.name,b.icon,b.desc]
      );
      await pool.query(
        'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
        [userId,'badge',`🏅 Badge sbloccato: ${b.icon} ${b.name}!`]
      );
    }
  }
}

// helper invite code
function genCode() {
  return Math.random().toString(36).substring(2,10).toUpperCase();
}

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
app.post('/api/register', async (req,res) => {
  const { name,username,email,password } = req.body;
  if (!name||!username||!email||!password)
    return res.status(400).json({ error:'Tutti i campi obbligatori' });
  if (password.length<8)
    return res.status(400).json({ error:'Password troppo corta (min 8)' });
  try {
    const hash = await bcrypt.hash(password,12);
    const { rows } = await pool.query(
      `INSERT INTO users (name,username,email,password_hash)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name,username.toLowerCase(),email.toLowerCase(),hash]
    );
    const token = jwt.sign({ id:rows[0].id,is_admin:rows[0].is_admin },JWT_SECRET,{ expiresIn:'30d' });
    res.json({ token, user:sanitize(rows[0]) });
  } catch(e) {
    if (e.code==='23505') {
      return res.status(400).json({ error: e.detail?.includes('username')?'Username già in uso':'Email già in uso' });
    }
    console.error(e); res.status(500).json({ error:'Errore server' });
  }
});

app.post('/api/login', async (req,res) => {
  const { email,password } = req.body;
  if (!email||!password) return res.status(400).json({ error:'Campi mancanti' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1',[email.toLowerCase()]);
    const user=rows[0];
    if (!user)          return res.status(401).json({ error:'Credenziali non valide' });
    if (user.is_banned) return res.status(403).json({ error:'🚫 Account bannato' });
    if (!await bcrypt.compare(password,user.password_hash))
      return res.status(401).json({ error:'Credenziali non valide' });
    const token = jwt.sign({ id:user.id,is_admin:user.is_admin },JWT_SECRET,{ expiresIn:'30d' });
    res.json({ token, user:sanitize(user) });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

function sanitize(u) { const { password_hash,...s }=u; return s; }

// ══════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════
app.get('/api/profile', auth, async (req,res) => {
  try {
    const { rows }   = await pool.query('SELECT * FROM users WHERE id=$1',[req.user.id]);
    if (!rows[0]) return res.status(404).json({ error:'Non trovato' });
    const { rows:owned } = await pool.query('SELECT item_id FROM user_items WHERE user_id=$1',[req.user.id]);
    const { rows:fol }   = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1',[req.user.id]);
    res.json({ ...sanitize(rows[0]), owned_items:owned.map(r=>r.item_id), followers:parseInt(fol[0].count) });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.patch('/api/profile', auth, async (req,res) => {
  const { name,username,bio,avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1,username=$2,bio=$3,avatar_color=$4,
       avatar_eyes=$5,avatar_mouth=$6,avatar_hair=$7,avatar_skin=$8 WHERE id=$9 RETURNING *`,
      [name,username?.toLowerCase(),bio,avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin,req.user.id]
    );
    res.json(sanitize(rows[0]));
  } catch(e) {
    if (e.code==='23505') return res.status(400).json({ error:'Username già in uso' });
    console.error(e); res.status(500).json({ error:'Errore server' });
  }
});

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
app.get('/api/activities', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 50',[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/activities', auth, async (req,res) => {
  const { type,km=0,hours=0,note='',from_addr='',to_addr='' } = req.body;
  const r=RATES[type];
  if (!r) return res.status(400).json({ error:'Tipo non valido' });
  const val=r.t==='k'?parseFloat(km):parseFloat(hours);
  const co2=parseFloat((val*r.co2).toFixed(2));
  const points=Math.round(val*r.pts);
  try {
    const { rows } = await pool.query(
      `INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note,from_addr,to_addr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id,type,km,hours,co2,points,note,from_addr,to_addr]
    );
    await pool.query('UPDATE users SET co2_saved=co2_saved+$1,points=points+$2 WHERE id=$3',[co2,points,req.user.id]);
    await checkBadges(req.user.id);
    res.json({ ...rows[0], co2_saved:co2, points });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   STATS / YEARLY / BADGES / LEADERBOARD
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req,res) => {
  try {
    const { rows:[u] }     = await pool.query('SELECT co2_saved,points FROM users WHERE id=$1',[req.user.id]);
    const { rows:[week] }  = await pool.query(`SELECT COALESCE(SUM(co2_saved),0) as co2 FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '7 days'`,[req.user.id]);
    const { rows:[month] } = await pool.query(`SELECT COALESCE(SUM(co2_saved),0) as co2 FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '30 days'`,[req.user.id]);
    const { rows:[total] } = await pool.query('SELECT COUNT(*) FROM activities WHERE user_id=$1',[req.user.id]);
    res.json({ co2_total:parseFloat(u.co2_saved||0), co2_week:parseFloat(week.co2||0), co2_month:parseFloat(month.co2||0), points:parseInt(u.points||0), total_activities:parseInt(total.count||0) });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.get('/api/yearly', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT TO_CHAR(date,'Mon') as month, EXTRACT(MONTH FROM date) as month_num,
       COALESCE(SUM(co2_saved),0) as co2, COALESCE(SUM(points),0) as points
       FROM activities WHERE user_id=$1 AND EXTRACT(YEAR FROM date)=EXTRACT(YEAR FROM NOW())
       GROUP BY month,month_num ORDER BY month_num`,[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.get('/api/badges', auth, async (req,res) => {
  try {
    const { rows:unlocked } = await pool.query('SELECT name FROM badges WHERE user_id=$1',[req.user.id]);
    const names=unlocked.map(b=>b.name);
    res.json(BADGES_DEF.map(b=>({ name:b.name,icon:b.icon,desc:b.desc,unlocked:names.includes(b.name) })));
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.get('/api/leaderboard', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,username,co2_saved,points,avatar_color,avatar_skin,avatar_eyes,avatar_mouth,avatar_hair
       FROM users WHERE is_banned=false ORDER BY co2_saved DESC LIMIT 20`
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.get('/api/challenges', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,u.name as creator_name FROM challenges c
       LEFT JOIN users u ON c.user_id=u.id
       WHERE c.is_public=true OR c.user_id=$1 ORDER BY c.created_at DESC`,[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/challenges', auth, async (req,res) => {
  const { title,description='',co2_target=0,points_reward=0,end_date=null,is_public=true } = req.body;
  if (!title) return res.status(400).json({ error:'Titolo obbligatorio' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id,title,description,co2_target,points_reward,end_date||null,is_public]
    );
    res.json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   FOLLOWS
// ══════════════════════════════════════════
app.get('/api/followers', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.points,u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair
       FROM follows f JOIN users u ON f.follower_id=u.id WHERE f.following_id=$1`,[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.get('/api/following', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.points,u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair,true as is_following
       FROM follows f JOIN users u ON f.following_id=u.id WHERE f.follower_id=$1`,[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/follow/:id', auth, async (req,res) => {
  const tid=parseInt(req.params.id);
  if (tid===req.user.id) return res.status(400).json({ error:'Non puoi seguire te stesso' });
  try {
    await pool.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,tid]);
    await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',[tid,'follow','👥 Qualcuno ha iniziato a seguirti!']);
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.delete('/api/follow/:id', auth, async (req,res) => {
  try {
    await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2',[req.user.id,parseInt(req.params.id)]);
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   USERS SEARCH
// ══════════════════════════════════════════
app.get('/api/users/search', auth, async (req,res) => {
  const q=req.query.q||'';
  if (q.length<2) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.points,u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair,
       EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=u.id) as is_following
       FROM users u WHERE u.id!=$1 AND u.is_banned=false
       AND (u.name ILIKE $2 OR u.username ILIKE $2) LIMIT 15`,
      [req.user.id,`%${q}%`]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   GROUPS ✅ + LEADERBOARD + INVITI
// ══════════════════════════════════════════
app.get('/api/groups', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*,COUNT(DISTINCT gm.user_id) as member_count,
       EXISTS(SELECT 1 FROM group_members WHERE group_id=g.id AND user_id=$1) as is_member
       FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id
       WHERE g.is_public=true OR g.creator_id=$1
       GROUP BY g.id ORDER BY g.created_at DESC`,[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/groups', auth, async (req,res) => {
  const { name,description='',is_public=true } = req.body;
  if (!name) return res.status(400).json({ error:'Nome obbligatorio' });
  try {
    const code = genCode();
    const { rows } = await pool.query(
      'INSERT INTO groups (name,description,creator_id,is_public,invite_code) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name,description,req.user.id,is_public,code]
    );
    await pool.query('INSERT INTO group_members (group_id,user_id) VALUES ($1,$2)',[rows[0].id,req.user.id]);
    res.json(rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/groups/:id/join', auth, async (req,res) => {
  try {
    await pool.query(
      'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id,req.user.id]
    );
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.delete('/api/groups/:id/leave', auth, async (req,res) => {
  try {
    await pool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2',[req.params.id,req.user.id]);
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ✅ JOIN con invite code
app.post('/api/groups/join/:code', auth, async (req,res) => {
  try {
    const { rows:[g] } = await pool.query('SELECT * FROM groups WHERE invite_code=$1',[req.params.code.toUpperCase()]);
    if (!g) return res.status(404).json({ error:'Codice invito non valido' });
    await pool.query(
      'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [g.id,req.user.id]
    );
    res.json({ ok:true, group:g });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ✅ Classifica del gruppo
app.get('/api/groups/:id/leaderboard', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.username,u.co2_saved,u.points,
       u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair
       FROM group_members gm JOIN users u ON gm.user_id=u.id
       WHERE gm.group_id=$1 AND u.is_banned=false
       ORDER BY u.co2_saved DESC`,[req.params.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ✅ Invia invito gruppo ai follower
app.post('/api/groups/:id/invite', auth, async (req,res) => {
  const { follower_ids=[] } = req.body;
  if (!follower_ids.length) return res.status(400).json({ error:'Nessun utente selezionato' });
  try {
    const { rows:[g] } = await pool.query('SELECT * FROM groups WHERE id=$1',[req.params.id]);
    if (!g) return res.status(404).json({ error:'Gruppo non trovato' });

    // Verifica che chi invita sia membro
    const { rows:mem } = await pool.query(
      'SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',[g.id,req.user.id]
    );
    if (!mem.length) return res.status(403).json({ error:'Non sei membro del gruppo' });

    const { rows:[inviter] } = await pool.query('SELECT name FROM users WHERE id=$1',[req.user.id]);

    for (const fid of follower_ids) {
      await pool.query(
        'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
        [fid,'group_invite',
         `👥 ${inviter.name} ti ha invitato nel gruppo "${g.name}"! Codice: ${g.invite_code}`]
      );
    }
    res.json({ ok:true, invite_code:g.invite_code, sent:follower_ids.length });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
app.get('/api/notifications', auth, async (req,res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[req.user.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.patch('/api/notifications/read', auth, async (req,res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1',[req.user.id]);
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
app.get('/api/shop', auth, async (req,res) => {
  try {
    const { rows:items }  = await pool.query('SELECT * FROM shop_items ORDER BY category,cost');
    const { rows:owned }  = await pool.query('SELECT item_id FROM user_items WHERE user_id=$1',[req.user.id]);
    const { rows:[u] }    = await pool.query('SELECT points FROM users WHERE id=$1',[req.user.id]);
    res.json({ items, owned:owned.map(r=>r.item_id), points:u.points });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/shop/buy/:itemId', auth, async (req,res) => {
  const itemId=parseInt(req.params.itemId);
  try {
    const { rows:[item] } = await pool.query('SELECT * FROM shop_items WHERE id=$1',[itemId]);
    if (!item) return res.status(404).json({ error:'Item non trovato' });
    const { rows:[u] }    = await pool.query('SELECT points FROM users WHERE id=$1',[req.user.id]);
    if (u.points<item.cost)
      return res.status(400).json({ error:`Punti insufficienti (hai ${u.points}, servono ${item.cost})` });
    const { rows:already } = await pool.query(
      'SELECT 1 FROM user_items WHERE user_id=$1 AND item_id=$2',[req.user.id,itemId]
    );
    if (already.length) return res.status(400).json({ error:'Item già posseduto' });
    await pool.query('INSERT INTO user_items (user_id,item_id) VALUES ($1,$2)',[req.user.id,itemId]);
    await pool.query('UPDATE users SET points=points-$1 WHERE id=$2',[item.cost,req.user.id]);
    await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.user.id,'shop',`🛍️ Hai acquistato "${item.name}"!`]);
    res.json({ ok:true, item });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
app.get('/api/admin/users', auth, adminOnly, async (req,res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,username,email,co2_saved,points,is_admin,is_banned,
       avatar_color,avatar_skin,avatar_eyes,avatar_mouth,avatar_hair,created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.get('/api/admin/users/:id/activities', auth, adminOnly, async (req,res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 50',[req.params.id]
    );
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.delete('/api/admin/activities/:id', auth, adminOnly, async (req,res) => {
  try {
    const { rows:[act] } = await pool.query('SELECT * FROM activities WHERE id=$1',[req.params.id]);
    if (!act) return res.status(404).json({ error:'Non trovata' });
    await pool.query('DELETE FROM activities WHERE id=$1',[req.params.id]);
    await pool.query(
      'UPDATE users SET co2_saved=GREATEST(0,co2_saved-$1),points=GREATEST(0,points-$2) WHERE id=$3',
      [act.co2_saved,act.points,act.user_id]
    );
    res.json({ ok:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

app.post('/api/admin/users/:id/:action', auth, adminOnly, async (req,res) => {
  const { id,action }=req.params;
  if (parseInt(id)===req.user.id&&action==='delete')
    return res.status(400).json({ error:'Non puoi eliminare te stesso' });
  try {
    let msg='';
    switch(action) {
      case 'ban':
        await pool.query('UPDATE users SET is_banned=true WHERE id=$1',[id]);
        await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
          [id,'ban','⛔ Il tuo account è stato bannato.']);
        msg='Utente bannato'; break;
      case 'unban':
        await pool.query('UPDATE users SET is_banned=false WHERE id=$1',[id]);
        await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
          [id,'unban','✅ Il tuo account è stato sbannato. Bentornato!']);
        msg='Utente sbannato'; break;
      case 'delete':
        await pool.query('DELETE FROM users WHERE id=$1',[id]);
        msg='Utente eliminato'; break;
      case 'toggle_admin':
        const { rows:[u] }=await pool.query('SELECT is_admin FROM users WHERE id=$1',[id]);
        await pool.query('UPDATE users SET is_admin=$1 WHERE id=$2',[!u?.is_admin,id]);
        msg=u?.is_admin?'Admin rimosso':'Admin promosso'; break;
      case 'warn':
        await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
          [id,'warn','⚠️ Hai ricevuto un avviso dagli amministratori.']);
        msg='Avviso inviato'; break;
      case 'reset_points':
        await pool.query('UPDATE users SET points=0 WHERE id=$1',[id]);
        msg='Punti azzerati'; break;
      default: return res.status(400).json({ error:'Azione non valida' });
    }
    res.json({ ok:true, message:msg });
  } catch(e) { console.error(e); res.status(500).json({ error:'Errore server' }); }
});

// ══════════════════════════════════════════
//   CATCH-ALL
// ══════════════════════════════════════════
app.get('*', (req,res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error:'Not found' });
  const indexPath=path.join(PUBLIC_DIR,'index.html');
  res.sendFile(indexPath, err => {
    if (err) {
      console.error('❌ index.html non trovato:', indexPath);
      res.status(404).send(`<h2>❌ Metti index.html nella root o in public/</h2>`);
    }
  });
});

// ══════════════════════════════════════════
//   START
// ══════════════════════════════════════════
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🌱 EcoTrack → http://localhost:${PORT}`);
    console.log(`📁 Static: ${PUBLIC_DIR}`);
  });
}).catch(e => { console.error('❌ DB init:', e); process.exit(1); });

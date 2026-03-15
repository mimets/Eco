require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const path     = require('path');

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════
//   DB INIT
// ══════════════════════════════════════════
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      name         TEXT,
      username     TEXT UNIQUE,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      is_admin     BOOLEAN DEFAULT false,
      is_banned    BOOLEAN DEFAULT false,
      ban_until    TIMESTAMP,
      ban_reason   TEXT,
      points       INT DEFAULT 0,
      co2_saved    FLOAT DEFAULT 0,
      avatar_color TEXT DEFAULT '#16a34a',
      avatar_eyes  TEXT DEFAULT 'normal',
      avatar_mouth TEXT DEFAULT 'smile',
      avatar_hair  TEXT DEFAULT 'none',
      avatar_skin  TEXT DEFAULT '#fde68a',
      bio          TEXT DEFAULT '',
      owned_items  JSONB DEFAULT '[]',
      created_at   TIMESTAMP DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id              SERIAL PRIMARY KEY,
      user_id         INT REFERENCES users(id) ON DELETE CASCADE,
      type            TEXT NOT NULL,
      km              FLOAT DEFAULT 0,
      hours           FLOAT DEFAULT 0,
      co2_saved       FLOAT DEFAULT 0,
      points          INT DEFAULT 0,
      note            TEXT,
      from_addr       TEXT,
      to_addr         TEXT,
      carsharing_with TEXT,
      date            TIMESTAMP DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id            SERIAL PRIMARY KEY,
      user_id       INT REFERENCES users(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      description   TEXT,
      co2_target    FLOAT DEFAULT 0,
      points_reward INT DEFAULT 0,
      end_date      DATE,
      is_public     BOOLEAN DEFAULT false,
      created_at    TIMESTAMP DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id          SERIAL PRIMARY KEY,
      follower_id INT REFERENCES users(id) ON DELETE CASCADE,
      following_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         SERIAL PRIMARY KEY,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      image_url  TEXT,
      likes      JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id         SERIAL PRIMARY KEY,
      post_id    INT REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL,
      emoji       TEXT NOT NULL,
      cost        INT NOT NULL,
      description TEXT,
      is_rare     BOOLEAN DEFAULT false
    )`);

  // Aggiungiamo colonne mancanti
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#16a34a'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_eyes  TEXT DEFAULT 'normal'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mouth TEXT DEFAULT 'smile'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hair  TEXT DEFAULT 'none'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_skin  TEXT DEFAULT '#fde68a'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_items JSONB DEFAULT '[]'`);
  } catch (err) {
    console.log('⚠️ Colonne già esistenti');
  }

  // Shop items di default
  const shopCount = await pool.query('SELECT COUNT(*) FROM shop_items');
  if (parseInt(shopCount.rows[0].count) === 0) {
    const defaultItems = [
      ['Capelli Arcobaleno', 'hair', '🌈', 150, 'Capelli color arcobaleno', false],
      ['Capelli Oro', 'hair', '✨', 200, 'Capelli scintillanti dorati', true],
      ['Capelli Galassia', 'hair', '🌌', 250, 'Capelli ispirati alla galassia', true],
      ['Capelli Fiamma', 'hair', '🔥', 300, 'Capelli fiammeggianti', true],
      ['Occhi Stella', 'eyes', '⭐', 100, 'Occhi a forma di stella', false],
      ['Occhi Cuore', 'eyes', '❤️', 150, 'Occhi a cuore', false],
      ['Occhi Laser', 'eyes', '🔴', 200, 'Occhi laser rossi', true],
      ['Bocca Arcobaleno', 'mouth', '🌈', 150, 'Sorriso arcobaleno', false],
      ['Bocca Fuoco', 'mouth', '🔥', 200, 'Bocca di fuoco', true],
    ];

    for (const item of defaultItems) {
      await pool.query(
        'INSERT INTO shop_items (name, category, emoji, cost, description, is_rare) VALUES ($1,$2,$3,$4,$5,$6)',
        item
      );
    }
    console.log('🛍️ Shop items creati');
  }

  // Auto seed admin
  const adminExists = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@ecotrack.com']);
  if (adminExists.rows.length === 0) {
    const hash = await bcrypt.hash('Admin@2026!', 10);
    await pool.query(
      'INSERT INTO users (name, username, email, password, is_admin) VALUES ($1,$2,$3,$4,$5)',
      ['Admin', 'admin', 'admin@ecotrack.com', hash, true]
    );
    console.log('👑 Account admin creato!');
  }

  console.log('✅ DB inizializzato');
}

// ══════════════════════════════════════════
//   MIDDLEWARE
// ══════════════════════════════════════════
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorizzato' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.is_admin) return res.status(403).json({ error: 'Accesso negato' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, username: user.username, is_admin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ══════════════════════════════════════════
//   REGISTER (SENZA VERIFICA EMAIL)
// ══════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  const { name, username, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatorie' });
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Username: 3-20 caratteri, solo lettere/numeri/_' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Email o username già in uso' });
    
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (name, username, email, password, owned_items) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, username || null, email, hash, JSON.stringify([])]
    );
    
    const user = r.rows[0];
    
    // Notifica di benvenuto
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1,$2,$3)',
      [user.id, 'welcome', '👋 Benvenuto su EcoTrack! Inizia a tracciare le tue attività green!']
    );
    
    res.json({ token: makeToken(user), user });
  } catch (e) { 
    console.error('Register error:', e);
    res.status(500).json({ error: 'Errore durante la registrazione' }); 
  }
});

// ══════════════════════════════════════════
//   LOGIN (SENZA VERIFICA EMAIL)
// ══════════════════════════════════════════
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Compila tutti i campi' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1 OR username=$1', [email]);
    if (!r.rows.length) return res.status(400).json({ error: 'Utente non trovato' });
    
    const user = r.rows[0];

    // Check ban
    if (user.is_banned) {
      if (user.ban_until && new Date(user.ban_until) < new Date()) {
        await pool.query('UPDATE users SET is_banned=false, ban_until=null, ban_reason=null WHERE id=$1', [user.id]);
      } else {
        const until = user.ban_until ? ` fino al ${new Date(user.ban_until).toLocaleDateString('it-IT')}` : ' permanentemente';
        return res.status(403).json({ error: `Account bannato${until}. Motivo: ${user.ban_reason || 'N/D'}` });
      }
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Password errata' });
    
    res.json({ token: makeToken(user), user });
  } catch (e) { 
    console.error('Login error:', e);
    res.status(500).json({ error: 'Errore durante il login' }); 
  }
});

// ══════════════════════════════════════════
//   PROFILO
// ══════════════════════════════════════════
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, username, email, is_admin, points, co2_saved, avatar_color, avatar_eyes, avatar_mouth, avatar_hair, avatar_skin, bio, owned_items, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    
    const activities = await pool.query('SELECT COUNT(*) as total FROM activities WHERE user_id=$1', [req.user.id]);
    
    res.json({
      ...user.rows[0],
      total_activities: parseInt(activities.rows[0].total)
    });
  } catch (e) { 
    console.error('Profile error:', e);
    res.status(500).json({ error: 'Errore nel caricamento del profilo' }); 
  }
});

app.patch('/api/profile', auth, async (req, res) => {
  const { name, username, bio } = req.body;
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Username non valido' });
  try {
    if (username) {
      const exists = await pool.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username, req.user.id]);
      if (exists.rows.length) return res.status(400).json({ error: 'Username già in uso' });
    }
    await pool.query(
      'UPDATE users SET name=$1, username=$2, bio=$3 WHERE id=$4',
      [name, username, bio, req.user.id]
    );
    res.json({ success: true });
  } catch (e) { 
    console.error('Profile update error:', e);
    res.status(500).json({ error: 'Errore nel salvataggio del profilo' }); 
  }
});

// Avatar update
app.put('/api/profile/avatar', auth, async (req, res) => {
  const { color, skin, eyes, mouth, hair } = req.body;
  try {
    await pool.query(
      'UPDATE users SET avatar_color=$1, avatar_skin=$2, avatar_eyes=$3, avatar_mouth=$4, avatar_hair=$5 WHERE id=$6',
      [color, skin, eyes, mouth, hair, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Avatar update error:', e);
    res.status(500).json({ error: 'Errore nel salvataggio avatar' });
  }
});

// Change password
app.put('/api/profile/password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const user = await pool.query('SELECT password FROM users WHERE id=$1', [req.user.id]);
    const match = await bcrypt.compare(current_password, user.rows[0].password);
    if (!match) return res.status(400).json({ error: 'Password attuale errata' });
    
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Password change error:', e);
    res.status(500).json({ error: 'Errore nel cambio password' });
  }
});

// Profilo pubblico
app.get('/api/user/:username', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id,name,username,bio,points,co2_saved,avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin FROM users WHERE username=$1',
      [req.params.username]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    const user = r.rows[0];
    const followers = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1', [user.id]);
    const following = await pool.query('SELECT COUNT(*) FROM follows WHERE follower_id=$1',  [user.id]);
    const isFollowing = await pool.query('SELECT id FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, user.id]);
    res.json({ ...user, followers: parseInt(followers.rows[0].count), following: parseInt(following.rows[0].count), isFollowing: isFollowing.rows.length > 0 });
  } catch (e) { 
    console.error('User search error:', e);
    res.status(500).json({ error: 'Errore nella ricerca utente' }); 
  }
});

// ══════════════════════════════════════════
//   FOLLOW / UNFOLLOW
// ══════════════════════════════════════════
app.post('/api/follow/:userId', auth, async (req, res) => {
  if (String(req.params.userId) === String(req.user.id))
    return res.status(400).json({ error: 'Non puoi seguire te stesso' });
  try {
    await pool.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.userId]);
    // Notifica
    await pool.query(
      'INSERT INTO notifications (user_id,type,message,data) VALUES ($1,$2,$3,$4)',
      [req.params.userId, 'follow', `@${req.user.username || req.user.name} ha iniziato a seguirti!`, JSON.stringify({ from: req.user.id })]
    );
    res.json({ success: true });
  } catch (e) { 
    console.error('Follow error:', e);
    res.status(500).json({ error: 'Errore nel follow' }); 
  }
});

app.delete('/api/follow/:userId', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, req.params.userId]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Unfollow error:', e);
    res.status(500).json({ error: 'Errore nell\'unfollow' }); 
  }
});

app.get('/api/followers', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,u.points
      FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=$1`, [req.user.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Followers error:', e);
    res.status(500).json({ error: 'Errore nel caricamento followers' }); 
  }
});

app.get('/api/following', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,u.points
      FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=$1`, [req.user.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Following error:', e);
    res.status(500).json({ error: 'Errore nel caricamento following' }); 
  }
});

// ══════════════════════════════════════════
//   STATS / ACTIVITIES
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req, res) => {
  try {
    const week = await pool.query(`SELECT COALESCE(SUM(co2_saved),0) AS co2_week FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '7 days'`, [req.user.id]);
    const month = await pool.query(`SELECT COALESCE(SUM(co2_saved),0) AS co2_month FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '30 days'`, [req.user.id]);
    const total = await pool.query(`SELECT COALESCE(SUM(points),0) AS points, COALESCE(SUM(co2_saved),0) AS co2_saved FROM activities WHERE user_id=$1`, [req.user.id]);
    res.json({ 
      co2_week: week.rows[0].co2_week,
      co2_month: month.rows[0].co2_month,
      ...total.rows[0] 
    });
  } catch (e) { 
    console.error('Stats error:', e);
    res.status(500).json({ error: 'Errore nel caricamento statistiche' }); 
  }
});

const CO2_RATES = {
  Bici:      { t:'k', co2:0,   pts:5   },
  Treno:     { t:'k', co2:.04, pts:2   },
  Bus:       { t:'k', co2:.08, pts:1.5 },
  Carpooling:{ t:'k', co2:.06, pts:3   },
  Remoto:    { t:'h', co2:.5,  pts:10  },
  Videocall: { t:'h', co2:.1,  pts:8   }
};

app.post('/api/activities', auth, async (req, res) => {
  const { type, km, hours, note, from_addr, to_addr } = req.body;
  const r = CO2_RATES[type];
  if (!r) return res.status(400).json({ error: 'Tipo non valido' });
  const val = r.t==='k' ? (parseFloat(km)||0) : (parseFloat(hours)||0);
  const co2 = parseFloat((val * r.co2).toFixed(2));
  const pts = Math.round(val * r.pts);
  
  try {
    await pool.query(
      'INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note,from_addr,to_addr) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [req.user.id, type, km||0, hours||0, co2, pts, note||'', from_addr||'', to_addr||'']
    );
    await pool.query('UPDATE users SET points=points+$1, co2_saved=co2_saved+$2 WHERE id=$3', [pts, co2, req.user.id]);
    res.json({ success: true, co2_saved: co2, points: pts });
  } catch (e) {
    console.error('Activity error:', e);
    res.status(500).json({ error: 'Errore nel salvataggio attività' });
  }
});

app.get('/api/activities', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 50',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('Activities error:', e);
    res.status(500).json({ error: 'Errore nel caricamento attività' });
  }
});

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
app.get('/api/badges', auth, async (req, res) => {
  try {
    const stats = await pool.query(
      'SELECT COALESCE(SUM(co2_saved),0) AS co2, COALESCE(SUM(points),0) AS pts, COUNT(*) AS acts FROM activities WHERE user_id=$1',
      [req.user.id]
    );
    const { co2, pts, acts } = stats.rows[0];
    res.json([
      { name:'Primo Passo',    icon:'🌱', desc:'Prima attività', unlocked: acts>=1 },
      { name:'Green Warrior',  icon:'♻️', desc:'10 attività',    unlocked: acts>=10 },
      { name:'CO₂ Saver',      icon:'🌍', desc:'10 kg CO₂',      unlocked: co2>=10 },
      { name:'Eco Champion',   icon:'🏆', desc:'50 kg CO₂',      unlocked: co2>=50 },
      { name:'Point Master',   icon:'⭐', desc:'500 punti',       unlocked: pts>=500 },
      { name:'Sustainability', icon:'💚', desc:'100 kg CO₂',     unlocked: co2>=100 },
    ]);
  } catch (e) {
    console.error('Badges error:', e);
    res.status(500).json({ error: 'Errore nel caricamento badge' });
  }
});

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             COALESCE(SUM(a.points),0) AS points, COALESCE(SUM(a.co2_saved),0) AS co2_saved
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY points DESC LIMIT 20
    `);
    res.json(r.rows);
  } catch (e) {
    console.error('Leaderboard error:', e);
    res.status(500).json({ error: 'Errore nel caricamento classifica' });
  }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.get('/api/challenges', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT c.*, u.name as creator_name FROM challenges c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 OR c.is_public=true ORDER BY c.created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('Challenges error:', e);
    res.status(500).json({ error: 'Errore nel caricamento sfide' });
  }
});

app.post('/api/challenges', auth, async (req, res) => {
  const { title, description, co2_target, points_reward, end_date, is_public } = req.body;
  if (!title) return res.status(400).json({ error: 'Titolo obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO challenges (user_id, title, description, co2_target, points_reward, end_date, is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, title, description, co2_target||0, points_reward||0, end_date, is_public||false]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Challenge creation error:', e);
    res.status(500).json({ error: 'Errore nella creazione sfida' });
  }
});

// ══════════════════════════════════════════
//   YEARLY
// ══════════════════════════════════════════
app.get('/api/yearly', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT TO_CHAR(date,'Mon') AS month, EXTRACT(MONTH FROM date) AS month_num,
             COALESCE(SUM(co2_saved),0) AS co2, COALESCE(SUM(points),0) AS points
      FROM activities WHERE user_id=$1 AND EXTRACT(YEAR FROM date)=EXTRACT(YEAR FROM NOW())
      GROUP BY month, month_num ORDER BY month_num
    `, [req.user.id]);
    res.json(r.rows);
  } catch (e) {
    console.error('Yearly error:', e);
    res.status(500).json({ error: 'Errore nel caricamento dati annuali' });
  }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('Notifications error:', e);
    res.status(500).json({ error: 'Errore nel caricamento notifiche' });
  }
});

app.get('/api/notifications/count', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false',
      [req.user.id]
    );
    res.json({ count: parseInt(r.rows[0].count) });
  } catch (e) {
    res.json({ count: 0 });
  }
});

app.post('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

app.post('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ══════════════════════════════════════════
//   SOCIAL - POSTS
// ══════════════════════════════════════════
app.get('/api/social/posts', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, u.name as author_name, u.username as author_username,
             u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count,
             COALESCE(p.likes, '[]'::jsonb) as likes
      FROM posts p JOIN users u ON u.id=p.user_id
      ORDER BY p.created_at DESC LIMIT 50
    `);
    
    const posts = r.rows.map(p => ({
      ...p,
      liked_by_me: p.likes.includes(req.user.id),
      likes_count: p.likes.length
    }));
    
    res.json(posts);
  } catch (e) {
    console.error('Posts error:', e);
    res.status(500).json({ error: 'Errore nel caricamento post' });
  }
});

app.post('/api/social/posts', auth, async (req, res) => {
  const { content, image_url } = req.body;
  if (!content) return res.status(400).json({ error: 'Contenuto obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO posts (user_id, content, image_url, likes) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, content, image_url, JSON.stringify([])]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error('Post creation error:', e);
    res.status(500).json({ error: 'Errore nella creazione post' });
  }
});

app.delete('/api/social/posts/:id', auth, async (req, res) => {
  try {
    const post = await pool.query('SELECT user_id FROM posts WHERE id=$1', [req.params.id]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post non trovato' });
    if (post.rows[0].user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Post delete error:', e);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

app.post('/api/social/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await pool.query('SELECT likes FROM posts WHERE id=$1', [req.params.id]);
    if (!post.rows.length) return res.status(404).json({ error: 'Post non trovato' });
    
    let likes = post.rows[0].likes || [];
    const liked = likes.includes(req.user.id);
    
    if (liked) {
      likes = likes.filter(id => id !== req.user.id);
    } else {
      likes.push(req.user.id);
    }
    
    await pool.query('UPDATE posts SET likes=$1 WHERE id=$2', [JSON.stringify(likes), req.params.id]);
    res.json({ liked: !liked, likes_count: likes.length });
  } catch (e) {
    console.error('Like error:', e);
    res.status(500).json({ error: 'Errore nel like' });
  }
});

// COMMENTS
app.get('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, u.name as author_name, u.username as author_username
      FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.post_id=$1 ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) {
    console.error('Comments error:', e);
    res.status(500).json({ error: 'Errore nel caricamento commenti' });
  }
});

app.post('/api/social/posts/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Contenuto obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, content]
    );
    
    const count = await pool.query('SELECT COUNT(*) FROM comments WHERE post_id=$1', [req.params.id]);
    
    res.json({ 
      ...r.rows[0],
      comments_count: parseInt(count.rows[0].count)
    });
  } catch (e) {
    console.error('Comment creation error:', e);
    res.status(500).json({ error: 'Errore nel commento' });
  }
});

app.delete('/api/social/comments/:id', auth, async (req, res) => {
  try {
    const comment = await pool.query('SELECT user_id FROM comments WHERE id=$1', [req.params.id]);
    if (!comment.rows.length) return res.status(404).json({ error: 'Commento non trovato' });
    if (comment.rows[0].user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    await pool.query('DELETE FROM comments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Comment delete error:', e);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

// SOCIAL USERS
app.get('/api/social/users', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             CASE WHEN f.id IS NOT NULL THEN true ELSE false END as following
      FROM users u
      LEFT JOIN follows f ON f.follower_id=$1 AND f.following_id=u.id
      WHERE u.id != $1
      ORDER BY u.points DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(r.rows);
  } catch (e) {
    console.error('Social users error:', e);
    res.status(500).json({ error: 'Errore nel caricamento utenti' });
  }
});

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
app.get('/api/shop', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM shop_items ORDER BY category, cost');
    res.json(r.rows);
  } catch (e) {
    console.error('Shop error:', e);
    res.status(500).json({ error: 'Errore nel caricamento shop' });
  }
});

app.post('/api/shop/buy', auth, async (req, res) => {
  const { item_id } = req.body;
  try {
    const item = await pool.query('SELECT * FROM shop_items WHERE id=$1', [item_id]);
    if (!item.rows.length) return res.status(404).json({ error: 'Oggetto non trovato' });
    
    const user = await pool.query('SELECT points, owned_items FROM users WHERE id=$1', [req.user.id]);
    if (user.rows[0].points < item.rows[0].cost) {
      return res.status(400).json({ error: 'Punti insufficienti' });
    }
    
    let owned = user.rows[0].owned_items || [];
    if (owned.includes(item_id)) {
      return res.status(400).json({ error: 'Oggetto già posseduto' });
    }
    
    owned.push(item_id);
    
    await pool.query(
      'UPDATE users SET points=points-$1, owned_items=$2 WHERE id=$3',
      [item.rows[0].cost, JSON.stringify(owned), req.user.id]
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error('Buy error:', e);
    res.status(500).json({ error: 'Errore nell\'acquisto' });
  }
});

// ══════════════════════════════════════════
//   ADMIN - USERS
// ══════════════════════════════════════════
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.username, u.email, u.is_admin, u.points, u.co2_saved,
             COUNT(a.id) as activity_count
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY u.points DESC
    `);
    res.json(r.rows);
  } catch (e) {
    console.error('Admin users error:', e);
    res.status(500).json({ error: 'Errore nel caricamento utenti' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const activities = await pool.query('SELECT COUNT(*) FROM activities');
    const co2 = await pool.query('SELECT COALESCE(SUM(co2_saved),0) as total FROM activities');
    const posts = await pool.query('SELECT COUNT(*) FROM posts');
    
    res.json({
      total_users: parseInt(users.rows[0].count),
      total_activities: parseInt(activities.rows[0].count),
      total_co2: co2.rows[0].total,
      total_posts: parseInt(posts.rows[0].count)
    });
  } catch (e) {
    console.error('Admin stats error:', e);
    res.status(500).json({ error: 'Errore nel caricamento statistiche' });
  }
});

app.get('/api/admin/activities', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT a.*, u.name as user_name
      FROM activities a JOIN users u ON u.id=a.user_id
      ORDER BY a.date DESC LIMIT 50
    `);
    res.json(r.rows);
  } catch (e) {
    console.error('Admin activities error:', e);
    res.status(500).json({ error: 'Errore nel caricamento attività' });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const { name, username, points, is_admin } = req.body;
  try {
    await pool.query(
      'UPDATE users SET name=$1, username=$2, points=$3, is_admin=$4 WHERE id=$5',
      [name, username, points, is_admin, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Admin update error:', e);
    res.status(500).json({ error: 'Errore nell\'aggiornamento' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Admin delete error:', e);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

app.post('/api/admin/users/:id/verify', requireAdmin, async (req, res) => {
  // Non serve più, ma manteniamo per compatibilità
  res.json({ success: true });
});

app.delete('/api/admin/activities/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM activities WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Admin delete activity error:', e);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

// ══════════════════════════════════════════
//   DEBUG ROUTE (DA RIMUOVERE IN PRODUZIONE)
// ══════════════════════════════════════════
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, username, is_admin, points FROM users');
    res.json({
      count: users.rows.length,
      users: users.rows,
      message: "Debug route - rimuovere in produzione"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════
//   CATCH ALL
// ══════════════════════════════════════════
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ══════════════════════════════════════════
//   START
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 EcoTrack on port ${PORT}`));
}).catch(err => {
  console.error('❌ Errore durante inizializzazione DB:', err);
  process.exit(1);
});
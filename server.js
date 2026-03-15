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
//   DB INIT - CORRETTO
// ══════════════════════════════════════════
async function initDB() {
  // Prima creiamo la tabella users con tutte le colonne necessarie
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
    CREATE TABLE IF NOT EXISTS groups (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      owner_id    INT REFERENCES users(id) ON DELETE CASCADE,
      is_public   BOOLEAN DEFAULT true,
      created_at  TIMESTAMP DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      id       SERIAL PRIMARY KEY,
      group_id INT REFERENCES groups(id) ON DELETE CASCADE,
      user_id  INT REFERENCES users(id) ON DELETE CASCADE,
      role     TEXT DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(group_id, user_id)
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      is_read    BOOLEAN DEFAULT false,
      data       JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )`);

  // Aggiungiamo eventuali colonne mancanti (sicurezza extra)
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
  } catch (err) {
    console.log('⚠️ Alcune colonne potrebbero già esistere, continuo...');
  }

  // Auto seed admin - ora is_admin esiste sicuramente
  const adminExists = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@ecotrack.com']);
  if (adminExists.rows.length === 0) {
    const hash = await bcrypt.hash('Admin@2026!', 10);
    await pool.query(
      'INSERT INTO users (name, username, email, password, is_admin) VALUES ($1, $2, $3, $4, $5)',
      ['Admin', 'admin', 'admin@ecotrack.com', hash, true]
    );
    console.log('👑 Account admin creato!');
  } else {
    console.log('👑 Account admin già esistente');
  }
  
  console.log('✅ DB inizializzato correttamente');
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
//   REGISTER
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
      'INSERT INTO users (name,username,email,password) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, username || null, email, hash]
    );
    const user = r.rows[0];
    res.json({ token: makeToken(user), user });
  } catch (e) { 
    console.error('Register error:', e);
    res.status(500).json({ error: 'Errore durante la registrazione' }); 
  }
});

// ══════════════════════════════════════════
//   LOGIN
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
    const r = await pool.query('SELECT id,name,username,email,is_admin,points,co2_saved,avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin,bio FROM users WHERE id=$1', [req.user.id]);
    res.json(r.rows[0]);
  } catch (e) { 
    console.error('Profile error:', e);
    res.status(500).json({ error: 'Errore nel caricamento del profilo' }); 
  }
});

app.patch('/api/profile', auth, async (req, res) => {
  const { name, username, bio, avatar_color, avatar_eyes, avatar_mouth, avatar_hair, avatar_skin } = req.body;
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Username non valido' });
  try {
    if (username) {
      const exists = await pool.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username, req.user.id]);
      if (exists.rows.length) return res.status(400).json({ error: 'Username già in uso' });
    }
    const r = await pool.query(`
      UPDATE users SET
        name=$1, username=$2, bio=$3,
        avatar_color=$4, avatar_eyes=$5, avatar_mouth=$6, avatar_hair=$7, avatar_skin=$8
      WHERE id=$9 RETURNING *`,
      [name, username, bio, avatar_color, avatar_eyes, avatar_mouth, avatar_hair, avatar_skin, req.user.id]
    );
    res.json({ success: true, user: r.rows[0] });
  } catch (e) { 
    console.error('Profile update error:', e);
    res.status(500).json({ error: 'Errore nel salvataggio del profilo' }); 
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
//   GRUPPI
// ══════════════════════════════════════════
app.post('/api/groups', auth, async (req, res) => {
  const { name, description, is_public } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome gruppo obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO groups (name,description,owner_id,is_public) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description, req.user.id, is_public !== false]
    );
    const group = r.rows[0];
    await pool.query('INSERT INTO group_members (group_id,user_id,role) VALUES ($1,$2,$3)', [group.id, req.user.id, 'owner']);
    res.json(group);
  } catch (e) { 
    console.error('Group creation error:', e);
    res.status(500).json({ error: 'Errore nella creazione del gruppo' }); 
  }
});

app.get('/api/groups', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT g.*, u.name AS owner_name,
             (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
             EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=$1) AS is_member
      FROM groups g JOIN users u ON u.id=g.owner_id
      WHERE g.is_public=true OR g.owner_id=$1
      ORDER BY g.created_at DESC`, [req.user.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Groups error:', e);
    res.status(500).json({ error: 'Errore nel caricamento gruppi' }); 
  }
});

app.post('/api/groups/:id/join', auth, async (req, res) => {
  try {
    await pool.query('INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Join group error:', e);
    res.status(500).json({ error: 'Errore nell\'unirsi al gruppo' }); 
  }
});

app.delete('/api/groups/:id/leave', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Leave group error:', e);
    res.status(500).json({ error: 'Errore nell\'abbandonare il gruppo' }); 
  }
});

app.get('/api/groups/:id/members', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,u.points,gm.role
      FROM group_members gm JOIN users u ON u.id=gm.user_id
      WHERE gm.group_id=$1 ORDER BY gm.role DESC, u.points DESC`, [req.params.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Group members error:', e);
    res.status(500).json({ error: 'Errore nel caricamento membri' }); 
  }
});

// ══════════════════════════════════════════
//   NOTIFICHE
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

app.patch('/api/notifications/read', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Mark read error:', e);
    res.status(500).json({ error: 'Errore nell\'aggiornamento notifiche' }); 
  }
});

// ══════════════════════════════════════════
//   STATS / ACTIVITIES / BADGES / ecc.
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req, res) => {
  try {
    const week = await pool.query(`SELECT COALESCE(SUM(co2_saved),0) AS co2_week FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '7 days'`, [req.user.id]);
    const tot  = await pool.query(`SELECT COALESCE(SUM(points),0) AS points, COALESCE(SUM(co2_saved),0) AS co2_total, COUNT(*) AS total_activities FROM activities WHERE user_id=$1`, [req.user.id]);
    res.json({ ...week.rows[0], ...tot.rows[0] });
  } catch (e) { 
    console.error('Stats error:', e);
    res.status(500).json({ error: 'Errore nel caricamento statistiche' }); 
  }
});

const CO2_RATES = {
  Remoto:    { t:'h', co2:.5,  pts:10  },
  Treno:     { t:'k', co2:.04, pts:2   },
  Bici:      { t:'k', co2:0,   pts:5   },
  Bus:       { t:'k', co2:.08, pts:1.5 },
  Carpooling:{ t:'k', co2:.06, pts:3   },
  Videocall: { t:'h', co2:.1,  pts:8   }
};

app.post('/api/activity', auth, async (req, res) => {
  const { type, km, hours, note, carsharing_with } = req.body;
  const r = CO2_RATES[type];
  if (!r) return res.status(400).json({ error: 'Tipo non valido' });
  const val = r.t==='k' ? (km||0) : (hours||0);
  const co2 = parseFloat((val*r.co2).toFixed(2));
  const pts = Math.round(val*r.pts);
  try {
    await pool.query('INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note,carsharing_with) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [req.user.id,type,km||0,hours||0,co2,pts,note||'',carsharing_with||'']);
    await pool.query('UPDATE users SET points=points+$1, co2_saved=co2_saved+$2 WHERE id=$3',[pts,co2,req.user.id]);
    if (carsharing_with) {
      const col = await pool.query('SELECT id FROM users WHERE email=$1', [carsharing_with]);
      if (col.rows.length) {
        const cId = col.rows[0].id;
        await pool.query('INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [cId,type,km||0,hours||0,co2,pts,`Carsharing con ${req.user.email}`]);
        await pool.query('UPDATE users SET points=points+$1, co2_saved=co2_saved+$2 WHERE id=$3',[pts,co2,cId]);
        await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
          [cId,'carsharing',`🚗 ${req.user.name || req.user.email} ti ha aggiunto in un carpooling! +${pts} punti`]);
      }
    }
    res.json({ success:true, co2_saved:co2, points:pts });
  } catch (e) { 
    console.error('Activity error:', e);
    res.status(500).json({ error: 'Errore nel salvataggio attività' }); 
  }
});

app.get('/api/activities', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 50',[req.user.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Activities error:', e);
    res.status(500).json({ error: 'Errore nel caricamento attività' }); 
  }
});

app.get('/api/badges', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT COALESCE(SUM(co2_saved),0) AS co2, COALESCE(SUM(points),0) AS pts, COUNT(*) AS acts FROM activities WHERE user_id=$1',[req.user.id]);
    const { co2,pts,acts } = r.rows[0];
    res.json([
      { name:'Primo Passo',    icon:'🌱', desc:'Prima attività', unlocked: acts>=1   },
      { name:'Green Warrior',  icon:'♻️', desc:'10 attività',    unlocked: acts>=10  },
      { name:'CO₂ Saver',      icon:'🌍', desc:'10 kg CO₂',      unlocked: co2>=10   },
      { name:'Eco Champion',   icon:'🏆', desc:'50 kg CO₂',      unlocked: co2>=50   },
      { name:'Point Master',   icon:'⭐', desc:'500 punti',       unlocked: pts>=500  },
      { name:'Sustainability+',icon:'💚', desc:'100 kg CO₂',     unlocked: co2>=100  },
    ]);
  } catch (e) { 
    console.error('Badges error:', e);
    res.status(500).json({ error: 'Errore nel caricamento badge' }); 
  }
});

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,
             COALESCE(SUM(a.points),0) AS points, COALESCE(SUM(a.co2_saved),0) AS co2_saved
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY points DESC LIMIT 20`);
    res.json(r.rows);
  } catch (e) { 
    console.error('Leaderboard error:', e);
    res.status(500).json({ error: 'Errore nel caricamento classifica' }); 
  }
});

app.get('/api/yearly', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT TO_CHAR(date,'Mon') AS month, EXTRACT(MONTH FROM date) AS month_num,
             COALESCE(SUM(co2_saved),0) AS co2, COALESCE(SUM(points),0) AS points
      FROM activities WHERE user_id=$1 AND EXTRACT(YEAR FROM date)=EXTRACT(YEAR FROM NOW())
      GROUP BY month,month_num ORDER BY month_num`,[req.user.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Yearly error:', e);
    res.status(500).json({ error: 'Errore nel caricamento dati annuali' }); 
  }
});

app.get('/api/challenges', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM challenges WHERE user_id=$1 OR is_public=true ORDER BY created_at DESC',[req.user.id]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Challenges error:', e);
    res.status(500).json({ error: 'Errore nel caricamento sfide' }); 
  }
});

app.post('/api/challenges', auth, async (req, res) => {
  const { title,description,co2_target,points_reward,end_date,is_public } = req.body;
  if (!title) return res.status(400).json({ error: 'Titolo obbligatorio' });
  try {
    const r = await pool.query('INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id,title,description,co2_target||0,points_reward||0,end_date,is_public||false]);
    res.json(r.rows[0]);
  } catch (e) { 
    console.error('Challenge creation error:', e);
    res.status(500).json({ error: 'Errore nella creazione sfida' }); 
  }
});

// ══════════════════════════════════════════
//   ADMIN — utenti
// ══════════════════════════════════════════
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.email,u.is_admin,u.is_banned,u.ban_until,u.ban_reason,
             COUNT(a.id) AS activity_count,
             COALESCE(SUM(a.points),0) AS points, COALESCE(SUM(a.co2_saved),0) AS co2_saved
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY points DESC`);
    res.json(r.rows);
  } catch (e) { 
    console.error('Admin users error:', e);
    res.status(500).json({ error: 'Errore nel caricamento utenti' }); 
  }
});

// Ban temporaneo
app.post('/api/admin/user/:id/ban', requireAdmin, async (req, res) => {
  const { reason, days } = req.body;
  const banUntil = days ? new Date(Date.now() + days * 86400000) : null;
  try {
    await pool.query('UPDATE users SET is_banned=true, ban_until=$1, ban_reason=$2 WHERE id=$3',
      [banUntil, reason || 'Violazione regole', req.params.id]);
    await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id, 'ban', `⛔ Il tuo account è stato bannato${days ? ` per ${days} giorni` : ' permanentemente'}. Motivo: ${reason || 'Violazione regole'}`]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Ban error:', e);
    res.status(500).json({ error: 'Errore nel ban' }); 
  }
});

// Unban
app.post('/api/admin/user/:id/unban', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_banned=false, ban_until=null, ban_reason=null WHERE id=$1', [req.params.id]);
    await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id, 'unban', '✅ Il tuo account è stato riattivato dall\'amministratore.']);
    res.json({ success: true });
  } catch (e) { 
    console.error('Unban error:', e);
    res.status(500).json({ error: 'Errore nell\'unban' }); 
  }
});

// Avviso
app.post('/api/admin/user/:id/warn', requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Messaggio obbligatorio' });
  try {
    await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id, 'warn', `⚠️ Avviso dall'admin: ${message}`]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Warn error:', e);
    res.status(500).json({ error: 'Errore nell\'invio avviso' }); 
  }
});

// Azzera punti
app.post('/api/admin/user/:id/reset-points', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET points=0, co2_saved=0 WHERE id=$1', [req.params.id]);
    await pool.query('INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id, 'warn', '⚠️ I tuoi punti sono stati azzerati dall\'amministratore.']);
    res.json({ success: true });
  } catch (e) { 
    console.error('Reset points error:', e);
    res.status(500).json({ error: 'Errore nell\'azzeramento punti' }); 
  }
});

app.patch('/api/admin/user/:id/role', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_admin=$1 WHERE id=$2', [req.body.is_admin, req.params.id]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Role change error:', e);
    res.status(500).json({ error: 'Errore nel cambio ruolo' }); 
  }
});

app.get('/api/admin/activities/:userId', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC', [req.params.userId]);
    res.json(r.rows);
  } catch (e) { 
    console.error('Admin activities error:', e);
    res.status(500).json({ error: 'Errore nel caricamento attività' }); 
  }
});

app.delete('/api/admin/activity/:id', requireAdmin, async (req, res) => {
  try {
    const a = await pool.query('SELECT * FROM activities WHERE id=$1', [req.params.id]);
    if (!a.rows.length) return res.status(404).json({ error: 'Non trovata' });
    await pool.query('DELETE FROM activities WHERE id=$1', [req.params.id]);
    await pool.query('UPDATE users SET points=GREATEST(points-$1,0), co2_saved=GREATEST(co2_saved-$2,0) WHERE id=$3',
      [a.rows[0].points, a.rows[0].co2_saved, a.rows[0].user_id]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Delete activity error:', e);
    res.status(500).json({ error: 'Errore nell\'eliminazione attività' }); 
  }
});

app.delete('/api/admin/user/:id', requireAdmin, async (req, res) => {
  if (String(req.params.id) === String(req.user.id))
    return res.status(400).json({ error: 'Non puoi eliminare te stesso!' });
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { 
    console.error('Delete user error:', e);
    res.status(500).json({ error: 'Errore nell\'eliminazione utente' }); 
  }
});

// ══════════════════════════════════════════
//   DEBUG ROUTE (DA RIMUOVERE DOPO)
// ══════════════════════════════════════════
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, username, is_admin, points FROM users');
    res.json({
      count: users.rows.length,
      users: users.rows,
      message: "Questa route è solo per debug - rimuovila in produzione!"
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
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
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════
//   DB INIT
// ══════════════════════════════════════════
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      is_admin   BOOLEAN DEFAULT false,
      points     INT DEFAULT 0,
      co2_saved  FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id               SERIAL PRIMARY KEY,
      user_id          INT REFERENCES users(id) ON DELETE CASCADE,
      type             TEXT NOT NULL,
      km               FLOAT DEFAULT 0,
      hours            FLOAT DEFAULT 0,
      co2_saved        FLOAT DEFAULT 0,
      points           INT DEFAULT 0,
      note             TEXT,
      carsharing_with  TEXT,
      date             TIMESTAMP DEFAULT NOW()
    )
  `);
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
    )
  `);
  // Colonna is_admin safe (se DB già esistente)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`);
  console.log('✅ DB inizializzato');
}

// ══════════════════════════════════════════
//   AUTH MIDDLEWARE
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
    if (!payload.is_admin) return res.status(403).json({ error: 'Accesso negato: non sei admin' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

// ══════════════════════════════════════════
//   REGISTER
// ══════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password obbligatorie' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Email già registrata' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, hash]
    );
    const user  = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   LOGIN
// ══════════════════════════════════════════
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Compila tutti i campi' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Utente non trovato' });
    const user  = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Password errata' });
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   SEED ADMIN (usala una volta sola!)
// ══════════════════════════════════════════
app.post('/api/seed-admin', async (req, res) => {
  const { secret } = req.body;
  if (secret !== 'ecotrack-setup-2026') return res.status(403).json({ error: 'Chiave errata' });
  try {
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@ecotrack.com']);
    if (existing.rows.length > 0) {
      await pool.query('UPDATE users SET is_admin = true WHERE email = $1', ['admin@ecotrack.com']);
      return res.json({ success: true, msg: 'Admin già esistente, aggiornato!' });
    }
    const hash = await bcrypt.hash('Admin@2026!', 10);
    await pool.query(
      'INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, $4)',
      ['Admin', 'admin@ecotrack.com', hash, true]
    );
    res.json({ success: true, msg: 'Account admin creato! Credenziali: admin@ecotrack.com / Admin@2026!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req, res) => {
  try {
    const week = await pool.query(`
      SELECT COALESCE(SUM(co2_saved),0) AS co2_week
      FROM activities
      WHERE user_id = $1 AND date >= NOW() - INTERVAL '7 days'`,
      [req.user.id]
    );
    const totals = await pool.query(`
      SELECT COALESCE(SUM(points),0) AS points,
             COALESCE(SUM(co2_saved),0) AS co2_total,
             COUNT(*) AS total_activities
      FROM activities WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ ...week.rows[0], ...totals.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════
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
  if (!r) return res.status(400).json({ error: 'Tipo attività non valido' });
  const val      = r.t === 'k' ? (km || 0) : (hours || 0);
  const co2      = parseFloat((val * r.co2).toFixed(2));
  const points   = Math.round(val * r.pts);
  try {
    await pool.query(
      'INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note,carsharing_with) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [req.user.id, type, km || 0, hours || 0, co2, points, note || '', carsharing_with || '']
    );
    await pool.query(
      'UPDATE users SET points = points + $1, co2_saved = co2_saved + $2 WHERE id = $3',
      [points, co2, req.user.id]
    );
    // Carsharing: punti anche al collega
    if (carsharing_with) {
      const colleague = await pool.query('SELECT id FROM users WHERE email = $1', [carsharing_with]);
      if (colleague.rows.length > 0) {
        const cId = colleague.rows[0].id;
        await pool.query(
          'INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [cId, type, km || 0, hours || 0, co2, points, `Carsharing con ${req.user.email}`]
        );
        await pool.query(
          'UPDATE users SET points = points + $1, co2_saved = co2_saved + $2 WHERE id = $3',
          [points, co2, cId]
        );
      }
    }
    res.json({ success: true, co2_saved: co2, points });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activities', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM activities WHERE user_id = $1 ORDER BY date DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   BADGES
// ══════════════════════════════════════════
app.get('/api/badges', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT COALESCE(SUM(co2_saved),0) AS co2, COALESCE(SUM(points),0) AS pts, COUNT(*) AS acts FROM activities WHERE user_id = $1',
      [req.user.id]
    );
    const { co2, pts, acts } = r.rows[0];
    const badges = [
      { name:'Primo Passo',    icon:'🌱', desc:'Prima attività registrata', unlocked: acts >= 1  },
      { name:'Green Warrior',  icon:'♻️', desc:'10 attività registrate',    unlocked: acts >= 10 },
      { name:'CO₂ Saver',      icon:'🌍', desc:'10 kg CO₂ salvati',         unlocked: co2  >= 10 },
      { name:'Eco Champion',   icon:'🏆', desc:'50 kg CO₂ salvati',         unlocked: co2  >= 50 },
      { name:'Point Master',   icon:'⭐', desc:'500 punti guadagnati',       unlocked: pts  >= 500},
      { name:'Sustainability+',icon:'💚', desc:'100 kg CO₂ salvati',        unlocked: co2  >= 100},
    ];
    res.json(badges);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.post('/api/challenges', auth, async (req, res) => {
  const { title, description, co2_target, points_reward, end_date, is_public } = req.body;
  if (!title) return res.status(400).json({ error: 'Titolo obbligatorio' });
  try {
    const result = await pool.query(
      'INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, title, description, co2_target || 0, points_reward || 0, end_date, is_public || false]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/challenges', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM challenges WHERE user_id = $1 OR is_public = true ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════
app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email,
             COALESCE(SUM(a.points),0)    AS points,
             COALESCE(SUM(a.co2_saved),0) AS co2_saved,
             ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(a.points),0) DESC) AS rank
      FROM users u
      LEFT JOIN activities a ON a.user_id = u.id
      GROUP BY u.id ORDER BY points DESC LIMIT 20`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   YEARLY
// ══════════════════════════════════════════
app.get('/api/yearly', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(date,'Mon') AS month,
             EXTRACT(MONTH FROM date) AS month_num,
             COALESCE(SUM(co2_saved),0) AS co2,
             COALESCE(SUM(points),0)    AS points
      FROM activities
      WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())
      GROUP BY month, month_num ORDER BY month_num`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   ADMIN — lista utenti
// ══════════════════════════════════════════
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_admin,
             COUNT(a.id)              AS activity_count,
             COALESCE(SUM(a.points),0)    AS points,
             COALESCE(SUM(a.co2_saved),0) AS co2_saved
      FROM users u
      LEFT JOIN activities a ON a.user_id = u.id
      GROUP BY u.id ORDER BY points DESC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   ADMIN — attività di un utente
// ══════════════════════════════════════════
app.get('/api/admin/activities/:userId', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM activities WHERE user_id = $1 ORDER BY date DESC',
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   ADMIN — elimina attività
// ══════════════════════════════════════════
app.delete('/api/admin/activity/:id', requireAdmin, async (req, res) => {
  try {
    const act = await pool.query('SELECT * FROM activities WHERE id = $1', [req.params.id]);
    if (act.rows.length === 0) return res.status(404).json({ error: 'Attività non trovata' });
    const a = act.rows[0];
    await pool.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
    await pool.query(
      'UPDATE users SET points = GREATEST(points - $1, 0), co2_saved = GREATEST(co2_saved - $2, 0) WHERE id = $3',
      [a.points, a.co2_saved, a.user_id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   ADMIN — promuovi / declassa utente
// ══════════════════════════════════════════
app.patch('/api/admin/user/:id/role', requireAdmin, async (req, res) => {
  try {
    const { is_admin } = req.body;
    await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [is_admin, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   ADMIN — elimina utente
// ══════════════════════════════════════════
app.delete('/api/admin/user/:id', requireAdmin, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id))
      return res.status(400).json({ error: 'Non puoi eliminare te stesso!' });
    await pool.query('DELETE FROM activities WHERE user_id = $1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
//   CATCH ALL → index.html
// ══════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ══════════════════════════════════════════
//   START
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 EcoTrack running on port ${PORT}`));
});

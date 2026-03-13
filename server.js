const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'ecotrack_secret_2026';

// INIT DB
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(50) NOT NULL,
      password VARCHAR(200) NOT NULL,
      points INT DEFAULT 0,
      co2_saved DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      type VARCHAR(50),
      co2_saved DECIMAL(8,2),
      points INT,
      km DECIMAL(8,2) DEFAULT 0,
      hours DECIMAL(5,2) DEFAULT 0,
      note TEXT,
      date TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      creator_id INT REFERENCES users(id),
      title VARCHAR(100),
      description TEXT,
      co2_target DECIMAL(8,2),
      points_reward INT,
      is_public BOOLEAN DEFAULT false,
      end_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS challenge_participants (
      id SERIAL PRIMARY KEY,
      challenge_id INT REFERENCES challenges(id),
      user_id INT REFERENCES users(id),
      progress DECIMAL(8,2) DEFAULT 0
    );
  `);
  console.log('✅ DB inizializzato!');
}

// MIDDLEWARE AUTH
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non autorizzato' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

// ─── AUTH ───────────────────────────────────────

// REGISTER
app.post('/api/register', async (req, res) => {
  const { email, name, password } = req.body;

  // Criteri password
  const pwRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
  if (!pwRegex.test(password)) {
    return res.status(400).json({
      error: 'Password: min 8 caratteri, 1 maiuscola, 1 numero, 1 simbolo (!@#$%^&*)'
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING id, email, name, points, co2_saved',
      [email, name, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    res.status(400).json({ error: 'Email già registrata' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Email o password errati' });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, points: user.points, co2_saved: user.co2_saved } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS ──────────────────────────────────────

app.get('/api/stats', auth, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        u.name, u.points, u.co2_saved,
        COUNT(a.id) as total_activities,
        COALESCE(SUM(CASE WHEN a.date >= NOW() - INTERVAL '7 days' THEN a.co2_saved END), 0) as co2_week,
        COALESCE(SUM(CASE WHEN a.date >= DATE_TRUNC('month', NOW()) THEN a.co2_saved END), 0) as co2_month,
        COALESCE(SUM(CASE WHEN a.date >= DATE_TRUNC('year', NOW()) THEN a.co2_saved END), 0) as co2_year
      FROM users u
      LEFT JOIN activities a ON u.id = a.user_id
      WHERE u.id = $1
      GROUP BY u.id, u.name, u.points, u.co2_saved
    `, [req.user.id]);
    res.json(stats.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ACTIVITIES ─────────────────────────────────

// Aggiungi attività
app.post('/api/activity', auth, async (req, res) => {
  const { type, km, hours, note, carsharing_with } = req.body;

  const ACTIVITY_RATES = {
    'Remoto':     { co2_per_hour: 0.5,  points_per_hour: 10 },
    'Treno':      { co2_per_km: 0.04,   points_per_km: 2 },
    'Bici':       { co2_per_km: 0,      points_per_km: 5 },
    'Bus':        { co2_per_km: 0.08,   points_per_km: 1.5 },
    'Carpooling': { co2_per_km: 0.06,   points_per_km: 3 },
    'Videocall':  { co2_per_hour: 0.1,  points_per_hour: 8 }
  };

  const rate = ACTIVITY_RATES[type];
  if (!rate) return res.status(400).json({ error: 'Tipo attività non valido' });

  let co2_saved = 0;
  let points = 0;

  if (rate.co2_per_km !== undefined) {
    co2_saved = parseFloat((km * rate.co2_per_km).toFixed(2));
    points = Math.round(km * rate.points_per_km);
  } else {
    co2_saved = parseFloat((hours * rate.co2_per_hour).toFixed(2));
    points = Math.round(hours * rate.points_per_hour);
  }

  try {
    // Salva attività
    await pool.query(
      'INSERT INTO activities (user_id, type, co2_saved, points, km, hours, note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, type, co2_saved, points, km || 0, hours || 0, note || '']
    );

    // Aggiorna totali utente
    await pool.query(
      'UPDATE users SET points = points + $1, co2_saved = co2_saved + $2 WHERE id = $3',
      [points, co2_saved, req.user.id]
    );

    // Car sharing: assegna punti anche al collega
    if (carsharing_with) {
      const colleague = await pool.query('SELECT id FROM users WHERE email = $1', [carsharing_with]);
      if (colleague.rows[0]) {
        await pool.query(
          'INSERT INTO activities (user_id, type, co2_saved, points, km, note) VALUES ($1,$2,$3,$4,$5,$6)',
          [colleague.rows[0].id, 'Carpooling', co2_saved, points, km || 0, `Carpool con ${req.user.email}`]
        );
        await pool.query(
          'UPDATE users SET points = points + $1, co2_saved = co2_saved + $2 WHERE id = $3',
          [points, co2_saved, colleague.rows[0].id]
        );
      }
    }

    res.json({ success: true, co2_saved, points });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ultime 10 attività
app.get('/api/activities', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM activities WHERE user_id = $1 ORDER BY date DESC LIMIT 10',
    [req.user.id]
  );
  res.json(result.rows);
});

// Riepilogo annuale
app.get('/api/yearly', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT 
      TO_CHAR(date, 'Mon') as month,
      SUM(co2_saved) as co2,
      SUM(points) as points,
      COUNT(*) as count
    FROM activities
    WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())
    GROUP BY TO_CHAR(date, 'Mon'), EXTRACT(MONTH FROM date)
    ORDER BY EXTRACT(MONTH FROM date)
  `, [req.user.id]);
  res.json(result.rows);
});

// ─── LEADERBOARD ────────────────────────────────

app.get('/api/leaderboard', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT name, points, co2_saved,
      RANK() OVER (ORDER BY points DESC) as rank
    FROM users ORDER BY points DESC LIMIT 10
  `);
  res.json(result.rows);
});

// ─── CHALLENGES ─────────────────────────────────

// Crea challenge
app.post('/api/challenges', auth, async (req, res) => {
  const { title, description, co2_target, points_reward, is_public, end_date } = req.body;
  const result = await pool.query(
    'INSERT INTO challenges (creator_id, title, description, co2_target, points_reward, is_public, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.id, title, description, co2_target, points_reward, is_public, end_date]
  );
  res.json(result.rows[0]);
});

// Lista challenges
app.get('/api/challenges', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM challenges WHERE creator_id = $1 OR is_public = true ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

// ─── BADGES ─────────────────────────────────────

app.get('/api/badges', auth, async (req, res) => {
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const u = user.rows[0];

  const badges = [
    { id: 1, name: 'Primo Passo', icon: '🌱', desc: 'Prima attività registrata', unlocked: u.co2_saved > 0 },
    { id: 2, name: 'Eco Warrior', icon: '🏃', desc: '5 giorni green', unlocked: u.co2_saved >= 25 },
    { id: 3, name: 'Carbon Cutter', icon: '✈️', desc: '100kg CO₂ salvate', unlocked: u.co2_saved >= 100 },
    { id: 4, name: 'Green Leader', icon: '👑', desc: '#1 nel team', unlocked: u.points >= 500 }
  ];

  res.json(badges);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 EcoTrack v2.FF http://localhost:${PORT}`);
  await initDB();
});
// ── SETUP PRIMO ADMIN (rimuovi dopo il primo utilizzo!) ──
app.post('/api/setup-admin', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== 'ecotrack-setup-2026') {
    return res.status(403).json({ error: 'Chiave errata' });
  }
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false');
    const result = await pool.query(
      'UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, name, email',
      [email]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utente non trovato' });
    res.json({ success: true, user: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
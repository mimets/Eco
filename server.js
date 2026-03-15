require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ══════════════════════════════════════════
//   DB INIT
// ══════════════════════════════════════════
async function initDB() {
  try {
    // Tabella users
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
        avatar_color TEXT DEFAULT '#10b981',
        avatar_skin  TEXT DEFAULT '#fde68a',
        avatar_eyes  TEXT DEFAULT 'normal',
        avatar_mouth TEXT DEFAULT 'smile',
        avatar_hair  TEXT DEFAULT 'none',
        bio          TEXT DEFAULT '',
        owned_items  JSONB DEFAULT '[]',
        tutorial_done BOOLEAN DEFAULT false,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella activities
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        km         FLOAT DEFAULT 0,
        hours      FLOAT DEFAULT 0,
        co2_saved  FLOAT DEFAULT 0,
        points     INTEGER DEFAULT 0,
        note       TEXT,
        from_addr  TEXT,
        to_addr    TEXT,
        date       TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella challenges
    await pool.query(`
      CREATE TABLE IF NOT EXISTS challenges (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        description   TEXT,
        co2_target    FLOAT DEFAULT 0,
        points_reward INTEGER DEFAULT 0,
        end_date      DATE,
        is_public     BOOLEAN DEFAULT false,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella follows
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id          SERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(follower_id, following_id)
      )
    `);

    // Tabella posts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        image_url  TEXT,
        likes      JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella comments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id         SERIAL PRIMARY KEY,
        post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella shop_items
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        emoji       TEXT NOT NULL,
        cost        INTEGER NOT NULL,
        description TEXT,
        is_rare     BOOLEAN DEFAULT false
      )
    `);

    // Tabella notifications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        message    TEXT NOT NULL,
        is_read    BOOLEAN DEFAULT false,
        data       JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Shop items di default
    const shopCount = await pool.query('SELECT COUNT(*) FROM shop_items');
    if (parseInt(shopCount.rows[0].count) === 0) {
      const items = [
        ['Capelli Corti', 'hair', '💇', 50, 'Taglio classico', false],
        ['Capelli Lunghi', 'hair', '💁', 80, 'Capelli lunghi', false],
        ['Capelli Ricci', 'hair', '🦱', 100, 'Ricci morbidi', false],
        ['Capelli Arcobaleno', 'hair', '🌈', 200, 'Tutti i colori!', true],
        ['Capelli Oro', 'hair', '✨', 300, 'Brillanti dorati', true],
        ['Capelli Galassia', 'hair', '🌌', 350, 'Stellati come il cielo', true],
        ['Capelli Fiamma', 'hair', '🔥', 400, 'Fiammeggianti', true],
        ['Occhi Normali', 'eyes', '👀', 30, 'Occhi classici', false],
        ['Occhi Felici', 'eyes', '😊', 50, 'Sorridenti', false],
        ['Occhi Assonnati', 'eyes', '😴', 60, 'Mezzi chiusi', false],
        ['Occhi Sorpresi', 'eyes', '😲', 70, 'Grandi e stupiti', false],
        ['Occhi Occhiolino', 'eyes', '😉', 80, 'Fai l\'occhiolino', false],
        ['Occhi Cool', 'eyes', '😎', 100, 'Con gli occhiali', false],
        ['Occhi Stella', 'eyes', '⭐', 150, 'A forma di stella', true],
        ['Occhi Cuore', 'eyes', '❤️', 180, 'Innamorati', true],
        ['Bocca Sorriso', 'mouth', '😊', 30, 'Sorriso semplice', false],
        ['Bocca Ghigno', 'mouth', '😏', 50, 'Sorridente malizioso', false],
        ['Bocca Aperta', 'mouth', '😮', 60, 'Sorpresa', false],
        ['Bocca Smorfia', 'mouth', '😜', 70, 'Linguaccia', false],
        ['Bocca Triste', 'mouth', '😢', 50, 'Triste', false],
        ['Bocca Arcobaleno', 'mouth', '🌈', 200, 'Sorriso arcobaleno', true],
        ['Sfondo Verde', 'color', '🟢', 20, 'Verde natura', false],
        ['Sfondo Blu', 'color', '🔵', 20, 'Blu cielo', false],
        ['Sfondo Viola', 'color', '🟣', 30, 'Viola mistero', false],
        ['Sfondo Arcobaleno', 'color', '🌈', 150, 'Tutti i colori', true],
        ['Pelle Chiara', 'skin', '👤', 0, 'Pelle chiara', false],
        ['Pelle Media', 'skin', '👤', 0, 'Pelle media', false],
        ['Pelle Scura', 'skin', '👤', 0, 'Pelle scura', false],
        ['Pelle Dorata', 'skin', '✨', 50, 'Pelle dorata', true]
      ];

      for (const item of items) {
        await pool.query(
          'INSERT INTO shop_items (name, category, emoji, cost, description, is_rare) VALUES ($1,$2,$3,$4,$5,$6)',
          item
        );
      }
      console.log('🛍️ Shop items creati');
    }

    // Crea admin di default
    const adminExists = await pool.query("SELECT id FROM users WHERE email = $1", ['admin@ecotrack.com']);
    if (adminExists.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@2026!', 10);
      await pool.query(
        'INSERT INTO users (name, username, email, password, is_admin) VALUES ($1, $2, $3, $4, $5)',
        ['Admin', 'admin', 'admin@ecotrack.com', hash, true]
      );
      console.log('👑 Account admin creato!');
    }

    console.log('✅ Database inizializzato');
  } catch (err) {
    console.error('❌ Errore initDB:', err);
    throw err;
  }
}

// ══════════════════════════════════════════
//   MIDDLEWARE
// ══════════════════════════════════════════
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Token mancante' });
  }
  
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token mancante' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Accesso negato' });
  }
  next();
}

// ══════════════════════════════════════════
//   AUTH ROUTES
// ══════════════════════════════════════════

// TEST
app.get('/api/test', (req, res) => {
  res.json({ message: '✅ Server funzionante!' });
});

// REGISTER
app.post('/api/register', async (req, res) => {
  console.log('📝 Tentativo di registrazione:', req.body);
  
  const { name, username, email, password } = req.body;
  
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email o username già in uso' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, username, email, password, owned_items) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, username, email, is_admin, points, co2_saved, 
                 avatar_color, avatar_eyes, avatar_mouth, avatar_hair, avatar_skin, bio, tutorial_done`,
      [name, username, email, hash, JSON.stringify([])]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Notifica di benvenuto
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
      [user.id, 'welcome', '👋 Benvenuto su EcoTrack! Inizia a tracciare le tue attività green!']
    );

    console.log('✅ Registrazione completata:', user.email);
    res.json({ token, user });
  } catch (err) {
    console.error('❌ Errore registrazione:', err);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  console.log('🔑 Tentativo di login:', req.body);
  
  const { identifier, password } = req.body;
  
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Inserisci email/username e password' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Utente non trovato' });
    }

    const user = result.rows[0];

    // Check ban
    if (user.is_banned) {
      if (user.ban_until && new Date(user.ban_until) < new Date()) {
        await pool.query('UPDATE users SET is_banned=false, ban_until=null, ban_reason=null WHERE id=$1', [user.id]);
      } else {
        const until = user.ban_until ? ` fino al ${new Date(user.ban_until).toLocaleDateString('it-IT')}` : ' permanentemente';
        return res.status(403).json({ error: `Account bannato${until}. Motivo: ${user.ban_reason || 'N/D'}` });
      }
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: 'Password errata' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, username: user.username, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete user.password;
    console.log('✅ Login riuscito:', user.email);
    res.json({ token, user });
  } catch (err) {
    console.error('❌ Errore login:', err);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// TUTORIAL COMPLETATO
app.post('/api/tutorial/complete', auth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET tutorial_done = true WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Tutorial error:', err);
    res.status(500).json({ error: 'Errore nel salvare tutorial' });
  }
});

// ══════════════════════════════════════════
//   PROFILE ROUTES
// ══════════════════════════════════════════

app.get('/api/profile', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username, email, is_admin, points, co2_saved, avatar_color, avatar_eyes, avatar_mouth, avatar_hair, avatar_skin, bio, owned_items, tutorial_done FROM users WHERE id = $1',
      [req.user.id]
    );

    const activities = await pool.query(
      'SELECT COUNT(*) as total FROM activities WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      ...result.rows[0],
      total_activities: parseInt(activities.rows[0].total)
    });
  } catch (err) {
    console.error('❌ Profile error:', err);
    res.status(500).json({ error: 'Errore nel caricamento del profilo' });
  }
});

app.put('/api/profile', auth, async (req, res) => {
  const { name, username, bio } = req.body;
  
  try {
    if (username) {
      const exists = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, req.user.id]
      );
      if (exists.rows.length) {
        return res.status(400).json({ error: 'Username già in uso' });
      }
    }

    await pool.query(
      'UPDATE users SET name = $1, username = $2, bio = $3 WHERE id = $4',
      [name, username, bio, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Profile update error:', err);
    res.status(500).json({ error: 'Errore nel salvataggio del profilo' });
  }
});

app.put('/api/profile/avatar', auth, async (req, res) => {
  const { color, skin, eyes, mouth, hair } = req.body;
  
  try {
    await pool.query(
      'UPDATE users SET avatar_color = $1, avatar_skin = $2, avatar_eyes = $3, avatar_mouth = $4, avatar_hair = $5 WHERE id = $6',
      [color, skin, eyes, mouth, hair, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Avatar error:', err);
    res.status(500).json({ error: 'Errore nel salvataggio avatar' });
  }
});

app.put('/api/profile/password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  
  try {
    const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, user.rows[0].password);
    
    if (!valid) {
      return res.status(400).json({ error: 'Password attuale errata' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Password error:', err);
    res.status(500).json({ error: 'Errore nel cambio password' });
  }
});

// ══════════════════════════════════════════
//   STATS ROUTES
// ══════════════════════════════════════════

app.get('/api/stats', auth, async (req, res) => {
  try {
    const total = await pool.query(
      'SELECT COALESCE(SUM(points), 0) as points, COALESCE(SUM(co2_saved), 0) as co2_saved FROM activities WHERE user_id = $1',
      [req.user.id]
    );

    const week = await pool.query(
      "SELECT COALESCE(SUM(co2_saved), 0) as co2_week FROM activities WHERE user_id = $1 AND date >= NOW() - INTERVAL '7 days'",
      [req.user.id]
    );

    const month = await pool.query(
      "SELECT COALESCE(SUM(co2_saved), 0) as co2_month FROM activities WHERE user_id = $1 AND date >= NOW() - INTERVAL '30 days'",
      [req.user.id]
    );

    res.json({
      points: total.rows[0].points,
      co2_saved: total.rows[0].co2_saved,
      co2_week: week.rows[0].co2_week,
      co2_month: month.rows[0].co2_month
    });
  } catch (err) {
    console.error('❌ Stats error:', err);
    res.status(500).json({ error: 'Errore nel caricamento statistiche' });
  }
});

// ══════════════════════════════════════════
//   ACTIVITIES ROUTES - FIXATE
// ══════════════════════════════════════════

const CO2_RATES = {
  'Bici': { type: 'km', co2: 0, points: 5 },
  'Treno': { type: 'km', co2: 0.04, points: 2 },
  'Bus': { type: 'km', co2: 0.08, points: 1.5 },
  'Carpooling': { type: 'km', co2: 0.06, points: 3 },
  'Remoto': { type: 'hours', co2: 0.5, points: 10 },
  'Videocall': { type: 'hours', co2: 0.1, points: 8 }
};

app.post('/api/activities', auth, async (req, res) => {
  console.log('📝 Tentativo salvataggio attività:', req.body);
  
  const { type, km, hours, note, from_addr, to_addr } = req.body;
  
  // Validazione input
  if (!type) {
    return res.status(400).json({ error: 'Tipo attività mancante' });
  }
  
  const rate = CO2_RATES[type];
  if (!rate) {
    return res.status(400).json({ error: 'Tipo attività non valido' });
  }
  
  // Calcola valori
  let value = 0;
  if (rate.type === 'km') {
    value = parseFloat(km) || 0;
  } else {
    value = parseFloat(hours) || 0;
  }
  
  if (value <= 0) {
    return res.status(400).json({ error: 'Inserisci un valore valido' });
  }
  
  const co2_saved = parseFloat((value * rate.co2).toFixed(2));
  const points = Math.round(value * rate.points);
  
  try {
    // Inserisci attività
    const result = await pool.query(
      `INSERT INTO activities 
       (user_id, type, km, hours, co2_saved, points, note, from_addr, to_addr, date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
       RETURNING *`,
      [
        req.user.id, 
        type, 
        km || 0, 
        hours || 0, 
        co2_saved, 
        points, 
        note || '', 
        from_addr || '', 
        to_addr || ''
      ]
    );
    
    // Aggiorna punti utente
    await pool.query(
      'UPDATE users SET points = points + $1, co2_saved = co2_saved + $2 WHERE id = $3',
      [points, co2_saved, req.user.id]
    );
    
    console.log('✅ Attività salvata:', result.rows[0]);
    res.json({ 
      success: true, 
      co2_saved, 
      points,
      activity: result.rows[0]
    });
    
  } catch (err) {
    console.error('❌ Errore salvataggio attività:', err);
    res.status(500).json({ error: 'Errore nel salvataggio attività' });
  }
});

app.get('/api/activities', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM activities WHERE user_id = $1 ORDER BY date DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Activities error:', err);
    res.status(500).json({ error: 'Errore nel caricamento attività' });
  }
});

// ══════════════════════════════════════════
//   BADGES ROUTES
// ══════════════════════════════════════════

app.get('/api/badges', auth, async (req, res) => {
  try {
    const stats = await pool.query(
      'SELECT COALESCE(SUM(co2_saved), 0) as co2, COALESCE(SUM(points), 0) as pts, COUNT(*) as acts FROM activities WHERE user_id = $1',
      [req.user.id]
    );
    
    const { co2, pts, acts } = stats.rows[0];
    
    res.json([
      { name: 'Primo Passo', icon: '🌱', desc: 'Prima attività', unlocked: acts >= 1 },
      { name: 'Green Warrior', icon: '♻️', desc: '10 attività', unlocked: acts >= 10 },
      { name: 'CO₂ Saver', icon: '🌍', desc: '10 kg CO₂', unlocked: co2 >= 10 },
      { name: 'Eco Champion', icon: '🏆', desc: '50 kg CO₂', unlocked: co2 >= 50 },
      { name: 'Point Master', icon: '⭐', desc: '500 punti', unlocked: pts >= 500 }
    ]);
  } catch (err) {
    console.error('❌ Badges error:', err);
    res.status(500).json({ error: 'Errore nel caricamento badge' });
  }
});

// ══════════════════════════════════════════
//   LEADERBOARD ROUTES
// ══════════════════════════════════════════

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_skin,
             COALESCE(SUM(a.points), 0) as points, COALESCE(SUM(a.co2_saved), 0) as co2_saved
      FROM users u
      LEFT JOIN activities a ON a.user_id = u.id
      GROUP BY u.id
      ORDER BY points DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Leaderboard error:', err);
    res.status(500).json({ error: 'Errore nel caricamento classifica' });
  }
});

// ══════════════════════════════════════════
//   YEARLY ROUTES
// ══════════════════════════════════════════

app.get('/api/yearly', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(date, 'Mon') as month, EXTRACT(MONTH FROM date) as month_num,
             COALESCE(SUM(co2_saved), 0) as co2, COALESCE(SUM(points), 0) as points
      FROM activities
      WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM NOW())
      GROUP BY month, month_num
      ORDER BY month_num
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Yearly error:', err);
    res.status(500).json({ error: 'Errore nel caricamento dati annuali' });
  }
});

// ══════════════════════════════════════════
//   CHALLENGES ROUTES
// ══════════════════════════════════════════

app.get('/api/challenges', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, u.name as creator_name
      FROM challenges c
      JOIN users u ON u.id = c.user_id
      WHERE c.user_id = $1 OR c.is_public = true
      ORDER BY c.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Challenges error:', err);
    res.status(500).json({ error: 'Errore nel caricamento sfide' });
  }
});

app.post('/api/challenges', auth, async (req, res) => {
  const { title, description, co2_target, points_reward, end_date, is_public } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Titolo obbligatorio' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO challenges (user_id, title, description, co2_target, points_reward, end_date, is_public) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.user.id, title, description, co2_target || 0, points_reward || 0, end_date, is_public || false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Challenge creation error:', err);
    res.status(500).json({ error: 'Errore nella creazione sfida' });
  }
});

// ══════════════════════════════════════════
//   SOCIAL ROUTES
// ══════════════════════════════════════════

app.get('/api/social/posts', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name as author_name, u.username as author_username,
             u.avatar_color, u.avatar_skin, u.avatar_eyes, u.avatar_mouth, u.avatar_hair,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 50
    `);

    const posts = result.rows.map(p => ({
      ...p,
      liked_by_me: p.likes.includes(req.user.id),
      likes_count: p.likes.length
    }));

    res.json(posts);
  } catch (err) {
    console.error('❌ Posts error:', err);
    res.status(500).json({ error: 'Errore nel caricamento post' });
  }
});

app.post('/api/social/posts', auth, async (req, res) => {
  const { content, image_url } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Contenuto obbligatorio' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, content, image_url, likes) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, content, image_url || '', JSON.stringify([])]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Post creation error:', err);
    res.status(500).json({ error: 'Errore nella creazione post' });
  }
});

app.post('/api/social/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await pool.query('SELECT likes FROM posts WHERE id = $1', [req.params.id]);
    if (!post.rows.length) {
      return res.status(404).json({ error: 'Post non trovato' });
    }

    let likes = post.rows[0].likes || [];
    const liked = likes.includes(req.user.id);

    if (liked) {
      likes = likes.filter(id => id !== req.user.id);
    } else {
      likes.push(req.user.id);
    }

    await pool.query('UPDATE posts SET likes = $1 WHERE id = $2', [JSON.stringify(likes), req.params.id]);
    res.json({ liked: !liked, likes_count: likes.length });
  } catch (err) {
    console.error('❌ Like error:', err);
    res.status(500).json({ error: 'Errore nel like' });
  }
});

app.get('/api/social/posts/:id/comments', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, u.name as author_name, u.username as author_username
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Comments error:', err);
    res.status(500).json({ error: 'Errore nel caricamento commenti' });
  }
});

app.post('/api/social/posts/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Contenuto obbligatorio' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, req.user.id, content]
    );

    const count = await pool.query('SELECT COUNT(*) FROM comments WHERE post_id = $1', [req.params.id]);

    res.json({
      ...result.rows[0],
      comments_count: parseInt(count.rows[0].count)
    });
  } catch (err) {
    console.error('❌ Comment creation error:', err);
    res.status(500).json({ error: 'Errore nel commento' });
  }
});

app.get('/api/social/users', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.avatar_color, u.avatar_skin,
             CASE WHEN f.id IS NOT NULL THEN true ELSE false END as following
      FROM users u
      LEFT JOIN follows f ON f.follower_id = $1 AND f.following_id = u.id
      WHERE u.id != $1
      ORDER BY u.points DESC
      LIMIT 50
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Social users error:', err);
    res.status(500).json({ error: 'Errore nel caricamento utenti' });
  }
});

app.post('/api/social/follow/:userId', auth, async (req, res) => {
  const userId = parseInt(req.params.userId);
  
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Non puoi seguire te stesso' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.id, userId]
    );

    let following;
    if (existing.rows.length) {
      await pool.query(
        'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
        [req.user.id, userId]
      );
      following = false;
    } else {
      await pool.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
        [req.user.id, userId]
      );
      following = true;
      
      await pool.query(
        'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
        [userId, 'follow', `${req.user.name} ha iniziato a seguirti!`]
      );
    }

    res.json({ following });
  } catch (err) {
    console.error('❌ Follow error:', err);
    res.status(500).json({ error: 'Errore nel follow' });
  }
});

// ══════════════════════════════════════════
//   SHOP ROUTES
// ══════════════════════════════════════════

app.get('/api/shop', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shop_items ORDER BY category, cost');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Shop error:', err);
    res.status(500).json({ error: 'Errore nel caricamento shop' });
  }
});

app.post('/api/shop/buy', auth, async (req, res) => {
  const { item_id } = req.body;
  
  try {
    const item = await pool.query('SELECT * FROM shop_items WHERE id = $1', [item_id]);
    if (!item.rows.length) {
      return res.status(404).json({ error: 'Oggetto non trovato' });
    }

    const user = await pool.query('SELECT points, owned_items FROM users WHERE id = $1', [req.user.id]);
    if (user.rows[0].points < item.rows[0].cost) {
      return res.status(400).json({ error: 'Punti insufficienti' });
    }

    let owned = user.rows[0].owned_items || [];
    if (owned.includes(item_id)) {
      return res.status(400).json({ error: 'Oggetto già posseduto' });
    }

    owned.push(item_id);

    await pool.query(
      'UPDATE users SET points = points - $1, owned_items = $2 WHERE id = $3',
      [item.rows[0].cost, JSON.stringify(owned), req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Buy error:', err);
    res.status(500).json({ error: 'Errore nell\'acquisto' });
  }
});

// ══════════════════════════════════════════
//   NOTIFICATIONS ROUTES
// ══════════════════════════════════════════

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Notifications error:', err);
    res.status(500).json({ error: 'Errore nel caricamento notifiche' });
  }
});

app.get('/api/notifications/count', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.json({ count: 0 });
  }
});

app.post('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', 
      [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ══════════════════════════════════════════
//   ADMIN ROUTES
// ══════════════════════════════════════════

app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.email, u.is_admin, u.is_banned,
             u.points, u.co2_saved,
             COUNT(a.id) as activity_count
      FROM users u
      LEFT JOIN activities a ON a.user_id = u.id
      GROUP BY u.id
      ORDER BY u.points DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Admin users error:', err);
    res.status(500).json({ error: 'Errore nel caricamento utenti' });
  }
});

app.get('/api/admin/stats', auth, requireAdmin, async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const activities = await pool.query('SELECT COUNT(*) FROM activities');
    const co2 = await pool.query('SELECT COALESCE(SUM(co2_saved), 0) as total FROM activities');
    const posts = await pool.query('SELECT COUNT(*) FROM posts');

    res.json({
      total_users: parseInt(users.rows[0].count),
      total_activities: parseInt(activities.rows[0].count),
      total_co2: co2.rows[0].total,
      total_posts: parseInt(posts.rows[0].count)
    });
  } catch (err) {
    console.error('❌ Admin stats error:', err);
    res.status(500).json({ error: 'Errore nel caricamento statistiche' });
  }
});

app.get('/api/admin/activities', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name as user_name
      FROM activities a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.date DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Admin activities error:', err);
    res.status(500).json({ error: 'Errore nel caricamento attività' });
  }
});

// ══════════════════════════════════════════
//   DEBUG ROUTES
// ══════════════════════════════════════════

app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, username, is_admin, points FROM users');
    res.json(users.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════
//   STATIC FILES
// ══════════════════════════════════════════

app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════
//   CATCH ALL
// ══════════════════════════════════════════

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route non trovata' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ══════════════════════════════════════════
//   START SERVER
// ══════════════════════════════════════════

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
    console.log(`👑 Admin: admin@ecotrack.com / Admin@2026!`);
  });
}).catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
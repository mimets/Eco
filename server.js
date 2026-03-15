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
        avatar_color TEXT DEFAULT '#16a34a',
        avatar_eyes  TEXT DEFAULT 'normal',
        avatar_mouth TEXT DEFAULT 'smile',
        avatar_hair  TEXT DEFAULT 'none',
        avatar_skin  TEXT DEFAULT '#fde68a',
        bio          TEXT DEFAULT '',
        owned_items  JSONB DEFAULT '[]',
        tutorial_done BOOLEAN DEFAULT false,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella activities
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
        from_lat        FLOAT,
        from_lon        FLOAT,
        to_lat          FLOAT,
        to_lon          FLOAT,
        route_data      JSONB,
        carsharing_with TEXT,
        date            TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella challenges
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

    // Tabella follows
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id          SERIAL PRIMARY KEY,
        follower_id INT REFERENCES users(id) ON DELETE CASCADE,
        following_id INT REFERENCES users(id) ON DELETE CASCADE,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE(follower_id, following_id)
      )
    `);

    // Tabella posts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id         SERIAL PRIMARY KEY,
        user_id    INT REFERENCES users(id) ON DELETE CASCADE,
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
        post_id    INT REFERENCES posts(id) ON DELETE CASCADE,
        user_id    INT REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella shop_items (COMPLETA)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        emoji       TEXT NOT NULL,
        cost        INT NOT NULL,
        description TEXT,
        is_rare     BOOLEAN DEFAULT false,
        is_limited  BOOLEAN DEFAULT false,
        season      TEXT,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabella notifications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL PRIMARY KEY,
        user_id    INT REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        message    TEXT NOT NULL,
        is_read    BOOLEAN DEFAULT false,
        data       JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // SHOP ITEMS COMPLETI (tante cose!)
    const shopCount = await pool.query('SELECT COUNT(*) FROM shop_items');
    if (parseInt(shopCount.rows[0].count) === 0) {
      const items = [
        // CAPELLI
        ['Capelli Corti', 'hair', '💇', 50, 'Taglio classico', false, false, null],
        ['Capelli Lunghi', 'hair', '💁', 80, 'Capelli lunghi e fluidi', false, false, null],
        ['Capelli Ricci', 'hair', '🦱', 100, 'Ricci morbidi', false, false, null],
        ['Capelli Afro', 'hair', '🦳', 120, 'Stile afro', false, false, null],
        ['Capelli Arcobaleno', 'hair', '🌈', 200, 'Tutti i colori!', true, false, null],
        ['Capelli Oro', 'hair', '✨', 300, 'Brillanti dorati', true, true, 'estate'],
        ['Capelli Galassia', 'hair', '🌌', 350, 'Stellati come il cielo', true, true, 'inverno'],
        ['Capelli Fiamma', 'hair', '🔥', 400, 'Fiammeggianti', true, true, 'autunno'],
        ['Capelli Cristallo', 'hair', '💎', 450, 'Di puro cristallo', true, true, 'inverno'],
        ['Capelli Neve', 'hair', '❄️', 250, 'Come la neve', false, true, 'inverno'],
        ['Capelli Foglie', 'hair', '🍃', 220, 'Foglie autunnali', false, true, 'autunno'],
        ['Capelli Fiori', 'hair', '🌸', 280, 'Fiori di ciliegio', false, true, 'primavera'],
        ['Capelli Mare', 'hair', '🌊', 260, 'Onde marine', false, true, 'estate'],
        ['Capelli Tramonto', 'hair', '🌅', 320, 'Colori del tramonto', true, false, null],
        ['Capelli Alba', 'hair', '🌄', 320, 'Colori dell\'alba', true, false, null],
        ['Capelli Ghiaccio', 'hair', '🧊', 380, 'Ghiaccio blu', true, true, 'inverno'],
        ['Capelli Lava', 'hair', '🌋', 420, 'Lava incandescente', true, true, 'estate'],
        ['Capelli Arcobaleno 2', 'hair', '🌈✨', 500, 'Arcobaleno speciale', true, true, 'estate'],
        
        // OCCHI
        ['Occhi Normali', 'eyes', '👀', 30, 'Occhi classici', false, false, null],
        ['Occhi Felici', 'eyes', '😊', 50, 'Sorridenti', false, false, null],
        ['Occhi Assonnati', 'eyes', '😴', 60, 'Mezzi chiusi', false, false, null],
        ['Occhi Sorpresi', 'eyes', '😲', 70, 'Grandi e stupiti', false, false, null],
        ['Occhi Occhiolino', 'eyes', '😉', 80, 'Fai l\'occhiolino', false, false, null],
        ['Occhi Cool', 'eyes', '😎', 100, 'Con gli occhiali', false, false, null],
        ['Occhi Stella', 'eyes', '⭐', 150, 'A forma di stella', true, false, null],
        ['Occhi Cuore', 'eyes', '❤️', 180, 'Innamorati', true, false, null],
        ['Occhi Laser', 'eyes', '🔴', 250, 'Laser rossi', true, true, null],
        ['Occhi Galaxy', 'eyes', '🌠', 300, 'Galassie negli occhi', true, true, 'inverno'],
        ['Occhi Drago', 'eyes', '🐉', 350, 'Occhi di drago', true, true, 'autunno'],
        ['Occhi Fiamma', 'eyes', '🔥', 320, 'Fiamme negli occhi', true, true, 'estate'],
        ['Occhi Ghiaccio', 'eyes', '❄️', 320, 'Ghiaccio azzurro', true, true, 'inverno'],
        ['Occhi Magici', 'eyes', '✨', 280, 'Magici brillanti', true, false, null],
        ['Occhi Alien', 'eyes', '👽', 400, 'Alieni', true, true, null],
        ['Occhi Mistici', 'eyes', '🔮', 380, 'Mistici viola', true, true, null],
        
        // BOCCA
        ['Bocca Sorriso', 'mouth', '😊', 30, 'Sorriso semplice', false, false, null],
        ['Bocca Ghigno', 'mouth', '😏', 50, 'Sorridente malizioso', false, false, null],
        ['Bocca Aperta', 'mouth', '😮', 60, 'Sorpresa', false, false, null],
        ['Bocca Smorfia', 'mouth', '😜', 70, 'Linguaccia', false, false, null],
        ['Bocca Triste', 'mouth', '😢', 50, 'Triste', false, false, null],
        ['Bocca Denti', 'mouth', '😁', 80, 'Sorriso coi denti', false, false, null],
        ['Bocca Arcobaleno', 'mouth', '🌈', 200, 'Sorriso arcobaleno', true, false, null],
        ['Bocca Fuoco', 'mouth', '🔥', 250, 'Fiamme dalla bocca', true, true, 'estate'],
        ['Bocca Oro', 'mouth', '💫', 300, 'Denti d\'oro', true, true, null],
        ['Bocca Cuore', 'mouth', '❤️', 280, 'A forma di cuore', true, true, 'sanvalentino'],
        ['Bocca Rosa', 'mouth', '🌹', 220, 'Bocca di rosa', false, true, 'primavera'],
        ['Bocca Vampiro', 'mouth', '🧛', 350, 'Zanne da vampiro', true, true, 'halloween'],
        ['Bocca Mostro', 'mouth', '👹', 400, 'Bocca mostruosa', true, true, 'halloween'],
        
        // COLORI SFONDO
        ['Sfondo Verde', 'color', '🟢', 20, 'Verde natura', false, false, null],
        ['Sfondo Blu', 'color', '🔵', 20, 'Blu cielo', false, false, null],
        ['Sfondo Viola', 'color', '🟣', 30, 'Viola mistero', false, false, null],
        ['Sfondo Rosso', 'color', '🔴', 30, 'Rosso passione', false, false, null],
        ['Sfondo Arancione', 'color', '🟠', 30, 'Arancione', false, false, null],
        ['Sfondo Giallo', 'color', '🟡', 30, 'Giallo sole', false, false, null],
        ['Sfondo Rosa', 'color', '💖', 40, 'Rosa romantico', false, false, null],
        ['Sfondo Arcobaleno', 'color', '🌈', 150, 'Tutti i colori', true, false, null],
        ['Sfondo Galaxy', 'color', '🌌', 200, 'Galassia', true, true, 'inverno'],
        ['Sfondo Tramonto', 'color', '🌅', 180, 'Tramonto', true, true, 'estate'],
        ['Sfondo Oceano', 'color', '🌊', 160, 'Oceano profondo', true, false, null],
        ['Sfondo Foresta', 'color', '🌳', 140, 'Foresta incantata', true, false, null],
        
        // PELLE
        ['Pelle Chiara', 'skin', '👤', 0, 'Pelle chiara', false, false, null],
        ['Pelle Media', 'skin', '👤', 0, 'Pelle media', false, false, null],
        ['Pelle Scura', 'skin', '👤', 0, 'Pelle scura', false, false, null],
        ['Pelle Oliva', 'skin', '👤', 0, 'Pelle olivastra', false, false, null],
        ['Pelle Dorata', 'skin', '✨', 50, 'Pelle dorata', true, false, null],
        ['Pelle Lunare', 'skin', '🌙', 80, 'Pelle argento', true, true, 'inverno'],
        ['Pelle Solare', 'skin', '☀️', 80, 'Pelle abbronzata', true, true, 'estate'],
        ['Pelle Alien', 'skin', '👽', 120, 'Pelle aliena verde', true, true, null],
        ['Pelle Robot', 'skin', '🤖', 150, 'Pelle metallica', true, true, null],
        
        // ACCESSORI
        ['Cappello', 'accessory', '🧢', 80, 'Cappellino', false, false, null],
        ['Cappello da Chef', 'accessory', '👨‍🍳', 100, 'Cappello da cuoco', false, false, null],
        ['Corona', 'accessory', '👑', 200, 'Corona reale', true, false, null],
        ['Occhiali da Sole', 'accessory', '🕶️', 120, 'Occhiali cool', false, false, null],
        ['Occhiali da Vista', 'accessory', '👓', 90, 'Occhiali da vista', false, false, null],
        ['Monocolo', 'accessory', '🧐', 110, 'Monocolo elegante', true, false, null],
        ['Fascia', 'accessory', '🎀', 70, 'Fascia per capelli', false, false, null],
        ['Fiore', 'accessory', '🌸', 80, 'Fiore tra i capelli', false, true, 'primavera'],
        ['Foglia', 'accessory', '🍃', 60, 'Foglia', false, true, 'autunno'],
        ['Stella', 'accessory', '⭐', 100, 'Stella', false, false, null],
        ['Luna', 'accessory', '🌙', 100, 'Mezzaluna', false, true, 'notte'],
        ['Sole', 'accessory', '☀️', 100, 'Sole', false, true, 'estate'],
        ['Nuvola', 'accessory', '☁️', 90, 'Nuvola', false, false, null],
        ['Arcobaleno', 'accessory', '🌈', 150, 'Arcobaleno', true, false, null],
        ['Fulmine', 'accessory', '⚡', 130, 'Fulmine', true, false, null],
        
        // ANIMALI
        ['Orecchie Gatto', 'accessory', '🐱', 150, 'Orecchie da gatto', false, false, null],
        ['Orecchie Cane', 'accessory', '🐶', 150, 'Orecchie da cane', false, false, null],
        ['Orecchie Coniglio', 'accessory', '🐰', 150, 'Orecchie da coniglio', false, false, null],
        ['Naso Maiale', 'accessory', '🐷', 120, 'Naso da maialino', false, false, null],
        ['Baffi Gatto', 'accessory', '🐱', 100, 'Baffi da gatto', false, false, null],
        ['Coda', 'accessory', '🐒', 180, 'Coda', true, false, null],
        ['Ali Farfalla', 'accessory', '🦋', 250, 'Ali di farfalla', true, true, 'primavera'],
        ['Ali Angelo', 'accessory', '👼', 300, 'Ali angeliche', true, false, null],
        ['Ali Demone', 'accessory', '😈', 300, 'Ali demoniache', true, true, 'halloween'],
        
        // EMOJI SPECIALI
        ['Emoji Cuore', 'accessory', '❤️', 50, 'Cuore volante', false, false, null],
        ['Emoji Stella', 'accessory', '⭐', 50, 'Stella volante', false, false, null],
        ['Emoji Fuoco', 'accessory', '🔥', 70, 'Fiammella', false, false, null],
        ['Emoji Ghiaccio', 'accessory', '❄️', 70, 'Fiocco di neve', false, true, 'inverno'],
        ['Emoji Fulmine', 'accessory', '⚡', 80, 'Fulmine', false, false, null],
        ['Emoji Arcobaleno', 'accessory', '🌈', 100, 'Arcobaleno', true, false, null],
        ['Emoji Unicorno', 'accessory', '🦄', 200, 'Unicorno', true, true, null],
        ['Emoji Drago', 'accessory', '🐉', 220, 'Drago', true, true, null],
        ['Emoji Fantasma', 'accessory', '👻', 150, 'Fantasma', false, true, 'halloween'],
        ['Emoji Teschio', 'accessory', '💀', 180, 'Teschio', false, true, 'halloween'],
        ['Emoji Alieno', 'accessory', '👽', 200, 'Alieno', true, false, null],
        ['Emoji Robot', 'accessory', '🤖', 200, 'Robot', true, false, null],
        ['Emoji Zanna', 'accessory', '🦷', 90, 'Zanna', false, true, 'halloween']
      ];

      for (const item of items) {
        await pool.query(
          'INSERT INTO shop_items (name, category, emoji, cost, description, is_rare, is_limited, season) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          item
        );
      }
      console.log('🛍️ Shop items creati (oltre 100 oggetti!)');
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
//   ACTIVITIES ROUTES
// ══════════════════════════════════════════

const CO2_RATES = {
  Bici:      { t: 'k', co2: 0,    pts: 5 },
  Treno:     { t: 'k', co2: 0.04, pts: 2 },
  Bus:       { t: 'k', co2: 0.08, pts: 1.5 },
  Carpooling:{ t: 'k', co2: 0.06, pts: 3 },
  Remoto:    { t: 'h', co2: 0.5,  pts: 10 },
  Videocall: { t: 'h', co2: 0.1,  pts: 8 }
};

app.post('/api/activities', auth, async (req, res) => {
  const { type, km, hours, note, from_addr, to_addr, from_lat, from_lon, to_lat, to_lon, route_data } = req.body;
  
  const rate = CO2_RATES[type];
  if (!rate) {
    return res.status(400).json({ error: 'Tipo attività non valido' });
  }

  const value = rate.t === 'k' ? (parseFloat(km) || 0) : (parseFloat(hours) || 0);
  const co2 = parseFloat((value * rate.co2).toFixed(2));
  const points = Math.round(value * rate.pts);

  try {
    await pool.query(
      `INSERT INTO activities 
       (user_id, type, km, hours, co2_saved, points, note, from_addr, to_addr, from_lat, from_lon, to_lat, to_lon, route_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [req.user.id, type, km || 0, hours || 0, co2, points, note || '', from_addr || '', to_addr || '', 
       from_lat || null, from_lon || null, to_lat || null, to_lon || null, route_data || null]
    );

    await pool.query(
      'UPDATE users SET points = points + $1, co2_saved = co2_saved + $2 WHERE id = $3',
      [points, co2, req.user.id]
    );

    res.json({ success: true, co2_saved: co2, points });
  } catch (err) {
    console.error('❌ Activity error:', err);
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
      { name: 'Point Master', icon: '⭐', desc: '500 punti', unlocked: pts >= 500 },
      { name: 'Eco Legend', icon: '👑', desc: '1000 punti', unlocked: pts >= 1000 },
      { name: 'Green Machine', icon: '⚡', desc: '100 attività', unlocked: acts >= 100 },
      { name: 'Climate Hero', icon: '🦸', desc: '200 kg CO₂', unlocked: co2 >= 200 },
      { name: 'Bike Lover', icon: '🚴', desc: '50 km in bici', unlocked: acts >= 50 },
      { name: 'Train Master', icon: '🚂', desc: '100 km in treno', unlocked: acts >= 100 },
      { name: 'Carpool King', icon: '🚗', desc: '50 carpooling', unlocked: acts >= 50 },
      { name: 'Remote Worker', icon: '🏠', desc: '100 ore remote', unlocked: acts >= 100 }
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
//   ADMIN ROUTES (COMPLETE)
// ══════════════════════════════════════════

app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username, u.email, u.is_admin, u.is_banned,
             u.ban_until, u.ban_reason, u.points, u.co2_saved,
             COUNT(DISTINCT a.id) as activity_count,
             COUNT(DISTINCT p.id) as post_count,
             COUNT(DISTINCT f1.id) as followers_count,
             COUNT(DISTINCT f2.id) as following_count
      FROM users u
      LEFT JOIN activities a ON a.user_id = u.id
      LEFT JOIN posts p ON p.user_id = u.id
      LEFT JOIN follows f1 ON f1.following_id = u.id
      LEFT JOIN follows f2 ON f2.follower_id = u.id
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
    const comments = await pool.query('SELECT COUNT(*) FROM comments');
    const challenges = await pool.query('SELECT COUNT(*) FROM challenges');
    const follows = await pool.query('SELECT COUNT(*) FROM follows');

    res.json({
      total_users: parseInt(users.rows[0].count),
      total_activities: parseInt(activities.rows[0].count),
      total_co2: co2.rows[0].total,
      total_posts: parseInt(posts.rows[0].count),
      total_comments: parseInt(comments.rows[0].count),
      total_challenges: parseInt(challenges.rows[0].count),
      total_follows: parseInt(follows.rows[0].count)
    });
  } catch (err) {
    console.error('❌ Admin stats error:', err);
    res.status(500).json({ error: 'Errore nel caricamento statistiche' });
  }
});

app.get('/api/admin/activities', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM activities a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.date DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Admin activities error:', err);
    res.status(500).json({ error: 'Errore nel caricamento attività' });
  }
});

app.get('/api/admin/posts', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name as user_name, u.email as user_email,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Admin posts error:', err);
    res.status(500).json({ error: 'Errore nel caricamento post' });
  }
});

app.put('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  const { name, username, email, is_admin, is_banned, points } = req.body;
  
  try {
    await pool.query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        username = COALESCE($2, username),
        email = COALESCE($3, email),
        is_admin = COALESCE($4, is_admin),
        is_banned = COALESCE($5, is_banned),
        points = COALESCE($6, points)
      WHERE id = $7`,
      [name, username, email, is_admin, is_banned, points, req.params.id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Admin update error:', err);
    res.status(500).json({ error: 'Errore nell\'aggiornamento' });
  }
});

app.post('/api/admin/users/:id/ban', auth, requireAdmin, async (req, res) => {
  const { reason, days } = req.body;
  const banUntil = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  
  try {
    await pool.query(
      'UPDATE users SET is_banned = true, ban_until = $1, ban_reason = $2 WHERE id = $3',
      [banUntil, reason || 'Violazione regole', req.params.id]
    );
    
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
      [req.params.id, 'ban', `Sei stato bannato${days ? ` per ${days} giorni` : ''}. Motivo: ${reason || 'Violazione regole'}`]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Ban error:', err);
    res.status(500).json({ error: 'Errore nel ban' });
  }
});

app.post('/api/admin/users/:id/unban', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET is_banned = false, ban_until = null, ban_reason = null WHERE id = $1',
      [req.params.id]
    );
    
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
      [req.params.id, 'unban', 'Il tuo ban è stato rimosso!']
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Unban error:', err);
    res.status(500).json({ error: 'Errore nell\'unban' });
  }
});

app.post('/api/admin/users/:id/warn', auth, requireAdmin, async (req, res) => {
  const { message } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
      [req.params.id, 'warning', message || 'Avviso dall\'amministratore']
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Warn error:', err);
    res.status(500).json({ error: 'Errore nell\'invio avviso' });
  }
});

app.post('/api/admin/users/:id/reset-points', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET points = 0, co2_saved = 0 WHERE id = $1',
      [req.params.id]
    );
    
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
      [req.params.id, 'reset', 'I tuoi punti sono stati azzerati']
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Reset points error:', err);
    res.status(500).json({ error: 'Errore nell\'azzeramento punti' });
  }
});

app.delete('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  }

  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Admin delete error:', err);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

app.delete('/api/admin/activities/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Admin delete activity error:', err);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

app.delete('/api/admin/posts/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Admin delete post error:', err);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
  }
});

app.post('/api/admin/shop/items', auth, requireAdmin, async (req, res) => {
  const { name, category, emoji, cost, description, is_rare, is_limited, season } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO shop_items (name, category, emoji, cost, description, is_rare, is_limited, season) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, category, emoji, cost, description, is_rare || false, is_limited || false, season || null]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Admin add item error:', err);
    res.status(500).json({ error: 'Errore nell\'aggiunta oggetto' });
  }
});

app.delete('/api/admin/shop/items/:id', auth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM shop_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Admin delete item error:', err);
    res.status(500).json({ error: 'Errore nell\'eliminazione' });
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

app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════
//   CATCH ALL
// ══════════════════════════════════════════

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route non trovata' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
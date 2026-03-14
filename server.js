require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const path     = require('path');

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl:{ rejectUnauthorized:false } });

app.use(cors());
app.use(express.json({ limit:'10mb' }));
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
      from_addr       TEXT DEFAULT '',
      to_addr         TEXT DEFAULT '',
      carsharing_with TEXT DEFAULT '',
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
      id           SERIAL PRIMARY KEY,
      follower_id  INT REFERENCES users(id) ON DELETE CASCADE,
      following_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMP DEFAULT NOW(),
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
      id        SERIAL PRIMARY KEY,
      group_id  INT REFERENCES groups(id) ON DELETE CASCADE,
      user_id   INT REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT DEFAULT 'member',
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL,
      value       TEXT NOT NULL,
      cost        INT NOT NULL,
      emoji       TEXT DEFAULT '🎁',
      description TEXT DEFAULT '',
      is_rare     BOOLEAN DEFAULT false
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id         SERIAL PRIMARY KEY,
      user_id    INT REFERENCES users(id) ON DELETE CASCADE,
      item_id    INT REFERENCES shop_items(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, item_id)
    )`);

  // ALTER colonne mancanti
  const alters = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username     TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned    BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until    TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason   TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#16a34a'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_eyes  TEXT DEFAULT 'normal'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mouth TEXT DEFAULT 'smile'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hair  TEXT DEFAULT 'none'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_skin  TEXT DEFAULT '#fde68a'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio          TEXT DEFAULT ''`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS from_addr       TEXT DEFAULT ''`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS to_addr         TEXT DEFAULT ''`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS carsharing_with TEXT DEFAULT ''`,
  ];
  for (const q of alters) await pool.query(q).catch(()=>{});

  // Seed shop items
  const shopCount = await pool.query('SELECT COUNT(*) FROM shop_items');
  if (parseInt(shopCount.rows[0].count) === 0) {
    const items = [
      // Capelli premium
      ['Capelli Arcobaleno','hair','rainbow',  300,'🌈','Capelli con gradiente arcobaleno',true],
      ['Capelli Oro',       'hair','gold',     200,'✨','Capelli dorati brillanti',true],
      ['Capelli Galaxy',    'hair','galaxy',   500,'🌌','Capelli galattici viola',true],
      ['Capelli Fiamma',    'hair','flame',    350,'🔥','Capelli di fuoco arancioni',true],
      ['Capelli Pixel',     'hair','pixel',    150,'👾','Stile retro pixelato',false],
      // Occhi premium
      ['Occhi Stella',      'eyes','star',     200,'⭐','Occhi a forma di stella',true],
      ['Occhi Cuore',       'eyes','heart',    250,'❤️','Occhi a cuore innamorati',true],
      ['Occhi Laser',       'eyes','laser',    400,'🔴','Occhi con raggi laser',true],
      ['Occhi Pixel',       'eyes','pixel',    150,'👾','Occhi in stile retro',false],
      // Bocca premium
      ['Bocca Rainbow',     'mouth','rainbow', 300,'🌈','Sorriso arcobaleno',true],
      ['Bocca Fuoco',       'mouth','fire',    250,'🔥','Bocca di fuoco',true],
      // Colori rari avatar
      ['Colore Oro',        'color','#f59e0b', 200,'🥇','Colore avatar dorato',true],
      ['Colore Galaxy',     'color','#6d28d9', 300,'🌌','Viola galattico profondo',true],
      ['Colore Fuoco',      'color','#ef4444', 150,'🔥','Rosso fuoco intenso',false],
      ['Colore Oceano',     'color','#0ea5e9', 150,'🌊','Blu oceano profondo',false],
      ['Colore Rosa Neon',  'color','#ec4899', 200,'💗','Rosa neon brillante',true],
      // Colori pelle rari
      ['Pelle Oro',         'skin','#FFD700',  350,'✨','Pelle dorata leggendaria',true],
      ['Pelle Neon',        'skin','#00ff88',  400,'💚','Pelle verde neon',true],
    ];
    for (const [name,category,value,cost,emoji,description,is_rare] of items) {
      await pool.query(
        'INSERT INTO shop_items (name,category,value,cost,emoji,description,is_rare) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [name,category,value,cost,emoji,description,is_rare]
      );
    }
    console.log('🛍️ Shop items creati!');
  }

  // Admin seed
  const adminExists = await pool.query('SELECT id FROM users WHERE email=$1',['admin@ecotrack.com']);
  if (!adminExists.rows.length) {
    const hash = await bcrypt.hash('Admin@2026!', 10);
    await pool.query(
      'INSERT INTO users (name,username,email,password,is_admin) VALUES ($1,$2,$3,$4,$5)',
      ['Admin','admin','admin@ecotrack.com',hash,true]
    );
    console.log('👑 Admin creato: admin@ecotrack.com / Admin@2026!');
  }
  console.log('✅ DB inizializzato');
}

// ══════════════════════════════════════════
//   MIDDLEWARE
// ══════════════════════════════════════════
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error:'Non autorizzato' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error:'Token non valido' }); }
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error:'Non autorizzato' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (!p.is_admin) return res.status(403).json({ error:'Accesso negato' });
    req.user = p; next();
  } catch { res.status(401).json({ error:'Token non valido' }); }
}

function makeToken(user) {
  return jwt.sign(
    { id:user.id, email:user.email, name:user.name, username:user.username, is_admin:user.is_admin },
    process.env.JWT_SECRET, { expiresIn:'7d' }
  );
}

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  const { name, username, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error:'Email e password obbligatorie' });
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error:'Username: 3-20 caratteri, solo lettere/numeri/_' });
  try {
    const exists = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR (username=$2 AND username IS NOT NULL)',
      [email, username||'__NONE__']
    );
    if (exists.rows.length) return res.status(400).json({ error:'Email o username già in uso' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (name,username,email,password) VALUES ($1,$2,$3,$4) RETURNING *',
      [name||'', username||null, email, hash]
    );
    res.json({ token:makeToken(r.rows[0]), user:r.rows[0] });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error:'Compila tutti i campi' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1 OR username=$1',[email]);
    if (!r.rows.length) return res.status(400).json({ error:'Utente non trovato' });
    const user = r.rows[0];

    // Check ban
    if (user.is_banned) {
      if (user.ban_until && new Date(user.ban_until) < new Date()) {
        await pool.query(
          'UPDATE users SET is_banned=false,ban_until=null,ban_reason=null WHERE id=$1',
          [user.id]
        );
      } else {
        const until = user.ban_until
          ? ` fino al ${new Date(user.ban_until).toLocaleDateString('it-IT')}`
          : ' permanentemente';
        return res.status(403).json({
          error:`Account bannato${until}. Motivo: ${user.ban_reason||'N/D'}`
        });
      }
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error:'Password errata' });
    res.json({ token:makeToken(user), user });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   PROFILO
// ══════════════════════════════════════════
app.get('/api/profile', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id,name,username,email,is_admin,points,co2_saved,
        avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin,bio
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error:'Utente non trovato' });
    const u = r.rows[0];
    const followers  = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1',[u.id]);
    const following  = await pool.query('SELECT COUNT(*) FROM follows WHERE follower_id=$1',[u.id]);
    // Acquisti
    const purchases  = await pool.query(
      'SELECT item_id FROM purchases WHERE user_id=$1',[u.id]
    );
    res.json({
      ...u,
      followers:  parseInt(followers.rows[0].count),
      following:  parseInt(following.rows[0].count),
      owned_items: purchases.rows.map(p=>p.item_id)
    });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/profile', auth, async (req, res) => {
  const { name, username, bio, avatar_color, avatar_eyes, avatar_mouth, avatar_hair, avatar_skin } = req.body;
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error:'Username non valido' });
  try {
    if (username) {
      const exists = await pool.query(
        'SELECT id FROM users WHERE username=$1 AND id!=$2',[username,req.user.id]
      );
      if (exists.rows.length) return res.status(400).json({ error:'Username già in uso' });
    }
    const r = await pool.query(`
      UPDATE users SET
        name=$1, username=$2, bio=$3,
        avatar_color=$4, avatar_eyes=$5, avatar_mouth=$6,
        avatar_hair=$7, avatar_skin=$8
      WHERE id=$9 RETURNING *`,
      [name,username,bio,avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin,req.user.id]
    );
    res.json({ success:true, user:r.rows[0] });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/user/:username', auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id,name,username,bio,points,co2_saved,
        avatar_color,avatar_eyes,avatar_mouth,avatar_hair,avatar_skin
       FROM users WHERE username=$1`,
      [req.params.username]
    );
    if (!r.rows.length) return res.status(404).json({ error:'Utente non trovato' });
    const u = r.rows[0];
    const followers   = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1',[u.id]);
    const following   = await pool.query('SELECT COUNT(*) FROM follows WHERE follower_id=$1',[u.id]);
    const isFollowing = await pool.query(
      'SELECT id FROM follows WHERE follower_id=$1 AND following_id=$2',[req.user.id,u.id]
    );
    res.json({
      ...u,
      followers:   parseInt(followers.rows[0].count),
      following:   parseInt(following.rows[0].count),
      isFollowing: isFollowing.rows.length > 0
    });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   FOLLOW
// ══════════════════════════════════════════
app.post('/api/follow/:userId', auth, async (req, res) => {
  if (String(req.params.userId)===String(req.user.id))
    return res.status(400).json({ error:'Non puoi seguire te stesso' });
  try {
    await pool.query(
      'INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id,req.params.userId]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message,data) VALUES ($1,$2,$3,$4)',
      [req.params.userId,'follow',
       `@${req.user.username||req.user.name} ha iniziato a seguirti!`,
       JSON.stringify({ from:req.user.id })]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/follow/:userId', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM follows WHERE follower_id=$1 AND following_id=$2',
      [req.user.id,req.params.userId]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/followers', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,u.points
      FROM follows f JOIN users u ON u.id=f.follower_id
      WHERE f.following_id=$1`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/following', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,u.points
      FROM follows f JOIN users u ON u.id=f.following_id
      WHERE f.follower_id=$1`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   GRUPPI
// ══════════════════════════════════════════
app.post('/api/groups', auth, async (req, res) => {
  const { name, description, is_public } = req.body;
  if (!name) return res.status(400).json({ error:'Nome obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO groups (name,description,owner_id,is_public) VALUES ($1,$2,$3,$4) RETURNING *',
      [name,description,req.user.id,is_public!==false]
    );
    await pool.query(
      'INSERT INTO group_members (group_id,user_id,role) VALUES ($1,$2,$3)',
      [r.rows[0].id,req.user.id,'owner']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/groups', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT g.*,u.name AS owner_name,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
        EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=$1) AS is_member
      FROM groups g JOIN users u ON u.id=g.owner_id
      WHERE g.is_public=true OR g.owner_id=$1
      ORDER BY g.created_at DESC`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/groups/:id/join', auth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO group_members (group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id,req.user.id]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/groups/:id/leave', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM group_members WHERE group_id=$1 AND user_id=$2',
      [req.params.id,req.user.id]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   NOTIFICHE
// ══════════════════════════════════════════
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/notifications/read', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1',[req.user.id]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
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
  try {
    const { type, km, hours, note, carsharing_with, from_addr, to_addr } = req.body;
    const r = CO2_RATES[type];
    if (!r) return res.status(400).json({ error:'Tipo attività non valido' });

    const val  = r.t==='k' ? (parseFloat(km)||0)    : (parseFloat(hours)||0);
    const co2  = parseFloat((val * r.co2).toFixed(2));
    const pts  = Math.round(val * r.pts);

    if (val <= 0) return res.status(400).json({ error:'Inserisci km o ore validi' });

    await pool.query(`
      INSERT INTO activities
        (user_id,type,km,hours,co2_saved,points,note,from_addr,to_addr,carsharing_with)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [req.user.id, type,
       r.t==='k'?val:0, r.t==='h'?val:0,
       co2, pts,
       note||'', from_addr||'', to_addr||'', carsharing_with||'']
    );

    await pool.query(
      'UPDATE users SET points=points+$1, co2_saved=co2_saved+$2 WHERE id=$3',
      [pts, co2, req.user.id]
    );

    // Carsharing bonus collega
    if (carsharing_with && carsharing_with.trim()) {
      const col = await pool.query(
        'SELECT id,name,email FROM users WHERE email=$1',[carsharing_with.trim()]
      );
      if (col.rows.length) {
        const cId = col.rows[0].id;
        await pool.query(`
          INSERT INTO activities (user_id,type,km,hours,co2_saved,points,note)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [cId, type, r.t==='k'?val:0, r.t==='h'?val:0, co2, pts,
           `Carpooling con ${req.user.name||req.user.email}`]
        );
        await pool.query(
          'UPDATE users SET points=points+$1, co2_saved=co2_saved+$2 WHERE id=$3',
          [pts, co2, cId]
        );
        await pool.query(
          'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
          [cId,'carsharing',
           `🚗 ${req.user.name||req.user.email} ti ha aggiunto in un carpooling! +${pts} punti 🌍`]
        );
      }
    }

    res.json({ success:true, co2_saved:co2, points:pts });
  } catch(e) {
    console.error('Activity error:', e);
    res.status(500).json({ error:e.message });
  }
});

app.get('/api/activities', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC LIMIT 100',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   ROUTE DISTANCE
// ══════════════════════════════════════════
app.post('/api/route-distance', auth, async (req, res) => {
  const { fromLng, fromLat, toLng, toLat, profile } = req.body;
  if (!fromLat||!fromLng||!toLat||!toLng)
    return res.status(400).json({ error:'Coordinate mancanti' });
  try {
    const r = await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile||'driving-car'}`,
      {
        method: 'POST',
        headers: {
          'Authorization': process.env.ORS_KEY,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ coordinates:[[parseFloat(fromLng),parseFloat(fromLat)],[parseFloat(toLng),parseFloat(toLat)]] })
      }
    );
    const data = await r.json();
    if (!data.routes || !data.routes[0])
      return res.status(400).json({ error:'Percorso non trovato tra questi punti' });
    const km   = (data.routes[0].summary.distance / 1000).toFixed(2);
    const mins = Math.round(data.routes[0].summary.duration / 60);
    res.json({ km:parseFloat(km), mins, geometry:data.routes[0].geometry });
  } catch(e) {
    console.error('Route error:', e);
    res.status(500).json({ error:e.message });
  }
});

// ══════════════════════════════════════════
//   STATS / BADGES / LEADERBOARD / YEARLY
// ══════════════════════════════════════════
app.get('/api/stats', auth, async (req, res) => {
  try {
    const week = await pool.query(`
      SELECT COALESCE(SUM(co2_saved),0) AS co2_week
      FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '7 days'`,[req.user.id]);
    const tot = await pool.query(`
      SELECT COALESCE(SUM(points),0) AS points,
             COALESCE(SUM(co2_saved),0) AS co2_total,
             COUNT(*) AS total_activities
      FROM activities WHERE user_id=$1`,[req.user.id]);
    const month = await pool.query(`
      SELECT COALESCE(SUM(co2_saved),0) AS co2_month
      FROM activities WHERE user_id=$1 AND date>=NOW()-INTERVAL '30 days'`,[req.user.id]);
    res.json({ ...week.rows[0], ...tot.rows[0], ...month.rows[0] });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/badges', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT COALESCE(SUM(co2_saved),0) AS co2,
             COALESCE(SUM(points),0)    AS pts,
             COUNT(*) AS acts
      FROM activities WHERE user_id=$1`,[req.user.id]);
    const { co2, pts, acts } = r.rows[0];
    res.json([
      { name:'Primo Passo',     icon:'🌱', desc:'Prima attività',   unlocked:acts>=1   },
      { name:'Green Warrior',   icon:'♻️', desc:'10 attività',      unlocked:acts>=10  },
      { name:'CO₂ Saver',       icon:'🌍', desc:'10 kg CO₂',        unlocked:co2>=10   },
      { name:'Eco Champion',    icon:'🏆', desc:'50 kg CO₂',        unlocked:co2>=50   },
      { name:'Point Master',    icon:'⭐', desc:'500 punti',         unlocked:pts>=500  },
      { name:'Sustainability+', icon:'💚', desc:'100 kg CO₂',       unlocked:co2>=100  },
      { name:'Leggenda Verde',  icon:'🦸', desc:'500 kg CO₂',       unlocked:co2>=500  },
      { name:'Shopaholic',      icon:'🛍️', desc:'Primo acquisto shop',unlocked:pts>=50  },
    ]);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_skin,
        u.avatar_eyes,u.avatar_mouth,u.avatar_hair,
        COALESCE(SUM(a.points),0)    AS points,
        COALESCE(SUM(a.co2_saved),0) AS co2_saved
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY co2_saved DESC LIMIT 20`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/yearly', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT TO_CHAR(date,'Mon') AS month,
             EXTRACT(MONTH FROM date) AS month_num,
             COALESCE(SUM(co2_saved),0) AS co2,
             COALESCE(SUM(points),0)    AS points
      FROM activities
      WHERE user_id=$1 AND EXTRACT(YEAR FROM date)=EXTRACT(YEAR FROM NOW())
      GROUP BY month, month_num ORDER BY month_num`,[req.user.id]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════
app.get('/api/challenges', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM challenges WHERE user_id=$1 OR is_public=true ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/challenges', auth, async (req, res) => {
  const { title,description,co2_target,points_reward,end_date,is_public } = req.body;
  if (!title) return res.status(400).json({ error:'Titolo obbligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO challenges (user_id,title,description,co2_target,points_reward,end_date,is_public) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id,title,description,co2_target||0,points_reward||0,end_date||null,is_public||false]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════
app.get('/api/shop', auth, async (req, res) => {
  try {
    const items = await pool.query('SELECT * FROM shop_items ORDER BY category,cost');
    const owned = await pool.query('SELECT item_id FROM purchases WHERE user_id=$1',[req.user.id]);
    const user  = await pool.query('SELECT points FROM users WHERE id=$1',[req.user.id]);
    res.json({
      items:    items.rows,
      owned:    owned.rows.map(p=>p.item_id),
      points:   parseInt(user.rows[0].points)
    });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/shop/buy/:itemId', auth, async (req, res) => {
  try {
    const item = await pool.query('SELECT * FROM shop_items WHERE id=$1',[req.params.itemId]);
    if (!item.rows.length) return res.status(404).json({ error:'Item non trovato' });
    const it = item.rows[0];

    const user = await pool.query('SELECT points FROM users WHERE id=$1',[req.user.id]);
    if (user.rows[0].points < it.cost)
      return res.status(400).json({ error:`Punti insufficienti! Servono ${it.cost} pt` });

    const alreadyOwned = await pool.query(
      'SELECT id FROM purchases WHERE user_id=$1 AND item_id=$2',
      [req.user.id, req.params.itemId]
    );
    if (alreadyOwned.rows.length)
      return res.status(400).json({ error:'Hai già questo item!' });

    await pool.query(
      'INSERT INTO purchases (user_id,item_id) VALUES ($1,$2)',
      [req.user.id, req.params.itemId]
    );
    await pool.query(
      'UPDATE users SET points=points-$1 WHERE id=$2',
      [it.cost, req.user.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.user.id,'shop',`🛍️ Hai acquistato "${it.name}"! Usalo nell'avatar builder.`]
    );

    res.json({ success:true, item:it });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   ADMIN
// ══════════════════════════════════════════
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id,u.name,u.username,u.email,u.is_admin,
             u.is_banned,u.ban_until,u.ban_reason,
             u.avatar_color,u.avatar_skin,u.avatar_eyes,u.avatar_mouth,u.avatar_hair,
             COUNT(a.id) AS activity_count,
             COALESCE(SUM(a.points),0)    AS points,
             COALESCE(SUM(a.co2_saved),0) AS co2_saved
      FROM users u LEFT JOIN activities a ON a.user_id=u.id
      GROUP BY u.id ORDER BY u.created_at DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/user/:id/ban', requireAdmin, async (req, res) => {
  try {
    const { reason, days } = req.body;
    const banUntil = days && parseInt(days)>0
      ? new Date(Date.now() + parseInt(days)*86400000)
      : null;
    await pool.query(
      'UPDATE users SET is_banned=true, ban_until=$1, ban_reason=$2 WHERE id=$3',
      [banUntil, reason||'Violazione regole', req.params.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'ban',
       `⛔ Account bannato${days&&parseInt(days)>0?` per ${days} giorni`:' permanentemente'}. Motivo: ${reason||'Violazione regole'}`]
    );
    res.json({ success:true });
  } catch(e) {
    console.error('Ban error:', e);
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/admin/user/:id/unban', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_banned=false, ban_until=NULL, ban_reason=NULL WHERE id=$1 RETURNING id',
      [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error:'Utente non trovato' });
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'unban','✅ Il tuo account è stato riattivato dall\'amministratore.']
    );
    res.json({ success:true });
  } catch(e) {
    console.error('Unban error:', e);
    res.status(500).json({ error:e.message });
  }
});

app.post('/api/admin/user/:id/warn', requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error:'Messaggio obbligatorio' });
  try {
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'warn',`⚠️ Avviso admin: ${message}`]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/admin/user/:id/reset-points', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET points=0, co2_saved=0 WHERE id=$1',
      [req.params.id]
    );
    await pool.query(
      'INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)',
      [req.params.id,'warn','⚠️ I tuoi punti e CO₂ sono stati azzerati da un amministratore.']
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/admin/user/:id/role', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET is_admin=$1 WHERE id=$2',
      [req.body.is_admin, req.params.id]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/api/admin/activities/:userId', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM activities WHERE user_id=$1 ORDER BY date DESC',
      [req.params.userId]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/admin/activity/:id', requireAdmin, async (req, res) => {
  try {
    const a = await pool.query('SELECT * FROM activities WHERE id=$1',[req.params.id]);
    if (!a.rows.length) return res.status(404).json({ error:'Attività non trovata' });
    await pool.query('DELETE FROM activities WHERE id=$1',[req.params.id]);
    await pool.query(
      'UPDATE users SET points=GREATEST(points-$1,0), co2_saved=GREATEST(co2_saved-$2,0) WHERE id=$3',
      [a.rows[0].points, a.rows[0].co2_saved, a.rows[0].user_id]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/admin/user/:id', requireAdmin, async (req, res) => {
  if (String(req.params.id)===String(req.user.id))
    return res.status(400).json({ error:'Non puoi eliminare te stesso!' });
  try {
    await pool.query('DELETE FROM users WHERE id=$1',[req.params.id]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════
//   CATCH ALL
// ══════════════════════════════════════════
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname,'index.html'))
);

const PORT = process.env.PORT || 3000;
initDB().then(() =>
  app.listen(PORT, () => console.log(`🚀 EcoTrack v2 on port ${PORT}`))
);
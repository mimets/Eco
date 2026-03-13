const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// FIX LocalDB nome server
const config = {
  server: 'localhost',  // ← localhost invece di (localdb)
  port: 1433,
  database: 'EcoTrack',
  options: {
    trustedConnection: true,
    encrypt: false,
    trustServerCertificate: true,
    instanceName: 'MSSQLLocalDB'  // ← nome istanza
  }
};

let pool;

async function connectDB() {
  try {
    pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('✅ CONNESSO!');
    
    const stats = await pool.request().query(`
      SELECT Name, Points, COALESCE(SUM(CO2Saved),0) AS co2Saved, COUNT(a.Id) AS activities
      FROM Users u LEFT JOIN Activities a ON u.Id = a.UserId 
      WHERE Email = 'federico@konverto.eu'
      GROUP BY u.Id, Name, Points
    `);
    console.log('📊', stats.recordset[0]);
  } catch (err) {
    console.error('❌', err.message);
  }
}

app.get('/api/stats', async (req, res) => {
  try {
    if (!pool) await connectDB();
    const stats = await pool.request().query(`
      SELECT Points, COALESCE(SUM(CO2Saved),0) AS co2Saved, COUNT(a.Id) AS activities
      FROM Users u LEFT JOIN Activities a ON u.Id = a.UserId 
      WHERE Email = 'federico@konverto.eu'
    `);
    res.json(stats.recordset[0]);
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('🚀 http://localhost:3000');
  connectDB();
});

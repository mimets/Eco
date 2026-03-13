const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Dati temporanei (in memoria)
let users = {};

// Registra/carica utente
app.post('/api/login', (req, res) => {
  const { email, name } = req.body;
  if (!users[email]) {
    users[email] = { name, points: 0, co2Saved: 0, activities: [] };
  }
  res.json(users[email]);
});

// Aggiungi attività
app.post('/api/activity', (req, res) => {
  const { email, type, co2Saved, points } = req.body;
  if (!users[email]) return res.status(404).json({ error: 'Utente non trovato' });

  users[email].co2Saved += co2Saved;
  users[email].points += points;
  users[email].activities.push({ type, co2Saved, points, date: new Date() });

  res.json({ success: true, user: users[email] });
});

// Ottieni stats
app.get('/api/stats/:email', (req, res) => {
  const user = users[req.params.email];
  if (!user) return res.json({ points: 0, co2Saved: 0, activities: [] });
  res.json(user);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));

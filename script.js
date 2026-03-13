const API = '';  // Render usa stessa origin

let currentUser = null;

// Attività con CO2 e punti FISSI (no random!)
const ACTIVITIES = {
  'Remoto':    { co2: 12.5, points: 50 },
  'Treno':     { co2: 8.2,  points: 30 },
  'Bici':      { co2: 5.0,  points: 20 },
  'Carpooling':{ co2: 6.3,  points: 25 },
  'Bus':       { co2: 4.1,  points: 15 }
};

// Login utente
async function login(email, name) {
  const res = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name })
  });
  currentUser = await res.json();
  currentUser.email = email;
  updateDashboard();
}

// Aggiungi attività (punti FISSI!)
async function addActivity(type) {
  if (!currentUser) return alert('Fai login prima!');
  
  const activity = ACTIVITIES[type];
  if (!activity) return;

  const res = await fetch(`${API}/api/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: currentUser.email,
      type,
      co2Saved: activity.co2,
      points: activity.points
    })
  });

  const data = await res.json();
  currentUser = data.user;
  currentUser.email = currentUser.email || '';
  updateDashboard();
  showNotification(`+${activity.points} punti! 🌱 ${activity.co2}kg CO₂ salvata`);
}

// Aggiorna UI
function updateDashboard() {
  document.querySelector('.co2-value').textContent = currentUser.co2Saved.toFixed(1);
  document.querySelector('.points-value').textContent = currentUser.points;
  document.querySelector('.activities-count').textContent = currentUser.activities.length;
}

// Notifica
function showNotification(msg) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Init
window.onload = () => {
  const email = localStorage.getItem('email');
  const name = localStorage.getItem('name');
  if (email && name) {
    login(email, name);
  }
};

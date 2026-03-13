// Show dashboard immediately for demo
showDashboard();

// Elements
const stats = document.querySelectorAll('.stat-value');
const navTabs = document.querySelectorAll('.nav-tab, .nav-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Navigation
navTabs.forEach(tab => {
  tab.addEventListener('click', (e) => {
    const target = e.currentTarget.dataset.tab;
    
    // Update active states
    navTabs.forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // Show tab
    tabPanels.forEach(p => p.classList.remove('active'));
    document.getElementById(target)?.classList.add('active');
  });
});

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  animateStats();
}

function animateStats() {
  const values = [
    { el: '[data-value="co2"]', end: 24, suffix: 'kg', duration: 2000 },
    { el: '[data-value="points"]', end: 150, suffix: '', duration: 1500 },
    { el: '[data-value="activities"]', end: 3, suffix: '', duration: 1200 },
    { el: '[data-value="badges"]', end: 1, suffix: '', duration: 1000 }
  ];
  
  values.forEach(({el, end, suffix, duration}) => {
    const stat = document.querySelector(el);
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        stat.textContent = `${end}${suffix}`;
        clearInterval(timer);
      } else {
        stat.textContent = `${Math.floor(start)}${suffix}`;
      }
    }, 16);
  });
}

// Challenge interactions
document.querySelectorAll('.challenge-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.textContent = 'Iniziato! ✅';
    btn.style.background = '#28a745';
    
    // Add points animation
    animatePoints(50);
  });
});

function animatePoints(amount) {
  const pointsEl = document.querySelector('.points-card .stat-value');
  const current = parseInt(pointsEl.textContent);
  pointsEl.textContent = current + amount;
  
  // Floating +50 animation
  const plus = document.createElement('div');
  plus.textContent = `+${amount}`;
  plus.style.cssText = `
    position: fixed;
    color: #28a745;
    font-size: 24px;
    font-weight: bold;
    pointer-events: none;
    z-index: 1000;
    animation: floatUp 1s ease-out forwards;
  `;
  document.body.appendChild(plus);
  
  setTimeout(() => plus.remove(), 1000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes floatUp {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-60px) scale(1.2); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Badge clicks
document.querySelectorAll('.badge-card').forEach(badge => {
  badge.addEventListener('click', () => {
    if (badge.classList.contains('locked')) {
      badge.classList.add('unlocked');
      badge.querySelector('.badge-icon').classList.remove('locked');
      animatePoints(100);
    }
  });
});

// Auto demo after 3s
setTimeout(() => {
  document.querySelector('.challenge-item.active .challenge-btn').click();
}, 3000);

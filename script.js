'use strict';

// ══════════════════════════════════════════════════════════════════════════════════════
//   GLOBALS
// ══════════════════════════════════════════════════════════════════════════════════════
let token = localStorage.getItem('ecotoken') || null;
let myProfile = null;
let mapInstance = null;
let mapInitialized = false;
let routingControl = null;
let currentActivityType = null;
let confirmCallback = null;
let allShopItems = [];
let ownedItems = [];
let currentShopCategory = 'all';
let tutorialStep = 1;

// Avatar state
let miiState = {
    color: '#10b981',
    skin: '#fde68a',
    eyes: 'normal',
    mouth: 'smile',
    hair: 'none'
};

// CO2 rates per activity type
const CO2_RATES = {
    'Bici': { type: 'km', co2: 0, points: 5 },
    'Treno': { type: 'km', co2: 0.04, points: 2 },
    'Bus': { type: 'km', co2: 0.08, points: 1.5 },
    'Carpooling': { type: 'km', co2: 0.06, points: 3 },
    'Remoto': { type: 'hours', co2: 0.5, points: 10 },
    'Videocall': { type: 'hours', co2: 0.1, points: 8 }
};

const ACTIVITY_ICONS = {
    'Bici': '🚴',
    'Treno': '🚂',
    'Bus': '🚌',
    'Carpooling': '🚗',
    'Remoto': '🏠',
    'Videocall': '💻'
};

// ══════════════════════════════════════════════════════════════════════════════════════
//   UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Show notification toast
 * @param {string} message - Message to display
 * @param {string} type - success, error, info, warning
 */
function showNotification(message, type = 'success') {
    const toast = document.getElementById('notifToast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `notification-toast show ${type}`;
    
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}
window.showNotification = showNotification;

/**
 * Show confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {Function} callback - Function to call on confirm
 * @param {string} icon - Icon emoji
 */
function showConfirm(title, message, callback, icon = '❓') {
    document.getElementById('confirmIcon').textContent = icon;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent = message;
    document.getElementById('confirmModal').style.display = 'flex';
    confirmCallback = callback;
}
window.showConfirm = showConfirm;

/**
 * Close confirmation modal
 */
function closeConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
}
window.closeConfirm = closeConfirm;

/**
 * Confirm action (called by modal)
 */
window.confirmAction = function() {
    closeConfirm();
    if (confirmCallback) {
        confirmCallback();
        confirmCallback = null;
    }
};

/**
 * Toggle password visibility
 * @param {string} inputId - ID of password input
 * @param {HTMLElement} button - Toggle button
 */
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    
    const icon = button.querySelector('i');
    if (icon) {
        icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
}
window.togglePassword = togglePassword;

/**
 * Check password strength
 * @param {string} password - Password to check
 * @returns {boolean} - True if strong enough
 */
function checkPasswordStrength(password) {
    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);
    
    // Update UI indicators
    const updateStrengthItem = (id, valid) => {
        const el = document.getElementById(id);
        if (el) {
            if (valid) {
                el.classList.add('valid');
                el.style.color = '#10b981';
            } else {
                el.classList.remove('valid');
                el.style.color = '#6b7280';
            }
        }
    };
    
    updateStrengthItem('strengthLength', hasLength);
    updateStrengthItem('strengthUpper', hasUpper);
    updateStrengthItem('strengthNumber', hasNumber);
    updateStrengthItem('strengthSymbol', hasSymbol);
    
    updateStrengthItem('resetStrengthLength', hasLength);
    updateStrengthItem('resetStrengthUpper', hasUpper);
    updateStrengthItem('resetStrengthNumber', hasNumber);
    updateStrengthItem('resetStrengthSymbol', hasSymbol);
    
    return hasLength && hasUpper && hasNumber && hasSymbol;
}
window.checkPasswordStrength = checkPasswordStrength;

// ══════════════════════════════════════════════════════════════════════════════════════
//   API HELPER
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Make API request
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} body - Request body
 * @returns {Promise<object>} - Response data
 */
async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const options = {
            method,
            headers
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(endpoint, options);
        const data = await response.json();
        
        if (response.status === 401) {
            // Token expired or invalid
            token = null;
            localStorage.removeItem('ecotoken');
            document.getElementById('authContainer').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
            showNotification('Sessione scaduta, effettua nuovamente il login', 'error');
        }
        
        return data;
    } catch (error) {
        console.error('API request error:', error);
        return { error: 'Errore di connessione al server' };
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════
//   AUTH FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Switch between login/register/forgot/reset tabs
 * @param {string} tab - Tab to show (login/register/forgot/reset)
 */
function switchAuthTab(tab) {
    // Hide all forms
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('forgotForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'none';
    
    // Show selected form
    if (tab === 'login') {
        document.getElementById('loginForm').style.display = 'flex';
    } else if (tab === 'register') {
        document.getElementById('registerForm').style.display = 'flex';
    } else if (tab === 'forgot') {
        document.getElementById('forgotForm').style.display = 'flex';
    } else if (tab === 'reset') {
        document.getElementById('resetForm').style.display = 'flex';
    }
    
    // Update active tab
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.toggle('active', t.textContent.toLowerCase().includes(tab));
    });
}
window.switchAuthTab = switchAuthTab;

/**
 * Handle login form submission
 * @param {Event} e - Form submit event
 */
async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = document.getElementById('loginIdentifier')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    
    if (!identifier || !password) {
        showNotification('Inserisci email/username e password', 'error');
        return;
    }
    
    const loginBtn = document.getElementById('loginBtn');
    const originalText = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accesso in corso...';
    
    const data = await apiRequest('/api/login', 'POST', { identifier, password });
    
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalText;
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    // Save token and user data
    token = data.token;
    localStorage.setItem('ecotoken', token);
    myProfile = data.user;
    
    // Update UI
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    
    // Update sidebar with user data
    updateSidebar(data.user);
    syncMiiState(data.user);
    
    // Load initial data
    await loadDashboard();
    await loadNotificationCount();
    
    // Show tutorial for new users
    if (!data.user.tutorial_done) {
        setTimeout(() => showTutorial(), 1000);
    }
    
    // Start notification polling
    setInterval(loadNotificationCount, 30000);
    
    showNotification(`Benvenuto ${data.user.name || data.user.username}!`, 'success');
}
window.handleLogin = handleLogin;

/**
 * Handle register form submission
 * @param {Event} e - Form submit event
 */
async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName')?.value.trim();
    const username = document.getElementById('registerUsername')?.value.trim();
    const email = document.getElementById('registerEmail')?.value.trim();
    const password = document.getElementById('registerPassword')?.value;
    
    if (!name || !username || !email || !password) {
        showNotification('Tutti i campi sono obbligatori', 'error');
        return;
    }
    
    if (!checkPasswordStrength(password)) {
        showNotification('La password non è abbastanza sicura', 'error');
        return;
    }
    
    const registerBtn = document.getElementById('registerBtn');
    const originalText = registerBtn.innerHTML;
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrazione...';
    
    const data = await apiRequest('/api/register', 'POST', { name, username, email, password });
    
    registerBtn.disabled = false;
    registerBtn.innerHTML = originalText;
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('Registrazione completata! Ora puoi accedere.', 'success');
    switchAuthTab('login');
}
window.handleRegister = handleRegister;

/**
 * Handle forgot password form submission
 * @param {Event} e - Form submit event
 */
async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('forgotEmail')?.value.trim();
    
    if (!email) {
        showNotification('Inserisci la tua email', 'error');
        return;
    }
    
    const data = await apiRequest('/api/forgot-password', 'POST', { email });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('Email inviata! Controlla la tua casella di posta.', 'success');
    setTimeout(() => switchAuthTab('login'), 2000);
}
window.handleForgotPassword = handleForgotPassword;

/**
 * Handle reset password form submission
 * @param {Event} e - Form submit event
 */
async function handleResetPassword(e) {
    e.preventDefault();
    
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('token');
    const newPassword = document.getElementById('resetPassword')?.value;
    
    if (!resetToken) {
        showNotification('Token di reset non valido', 'error');
        return;
    }
    
    if (!newPassword) {
        showNotification('Inserisci la nuova password', 'error');
        return;
    }
    
    if (!checkPasswordStrength(newPassword)) {
        showNotification('La password non è abbastanza sicura', 'error');
        return;
    }
    
    const data = await apiRequest('/api/reset-password', 'POST', {
        token: resetToken,
        new_password: newPassword
    });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('Password resettata! Ora puoi accedere con la nuova password.', 'success');
    setTimeout(() => switchAuthTab('login'), 2000);
}
window.handleResetPassword = handleResetPassword;

/**
 * Logout user
 */
function logout() {
    showConfirm('Logout', 'Sei sicuro di voler uscire?', () => {
        token = null;
        myProfile = null;
        localStorage.removeItem('ecotoken');
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        switchAuthTab('login');
        showNotification('Arrivederci!', 'info');
    }, '👋');
}
window.logout = logout;
// ══════════════════════════════════════════════════════════════════════════════════════
//   SIDEBAR & UI UPDATE
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Update sidebar with user data
 * @param {object} user - User data
 */
function updateSidebar(user) {
    document.getElementById('sidebarName').textContent = user.name || user.username || 'Utente';
    document.getElementById('sidebarEmail').textContent = user.email || '';
    document.getElementById('sidebarPoints').textContent = user.points || 0;
    document.getElementById('sidebarCo2').textContent = (user.co2_saved || 0).toFixed(1);
    
    document.getElementById('topbarCo2').textContent = (user.co2_saved || 0).toFixed(1) + ' kg';
    document.getElementById('topbarPoints').textContent = (user.points || 0) + ' pt';
    
    // Show admin nav item if user is admin
    const adminNav = document.getElementById('adminNavItem');
    if (adminNav) {
        adminNav.style.display = user.is_admin ? 'flex' : 'none';
    }
}
window.updateSidebar = updateSidebar;

/**
 * Sync Mii state with user data
 * @param {object} user - User data
 */
function syncMiiState(user) {
    if (!user) return;
    
    miiState.color = user.avatar_color || '#10b981';
    miiState.skin = user.avatar_skin || '#fde68a';
    miiState.eyes = user.avatar_eyes || 'normal';
    miiState.mouth = user.avatar_mouth || 'smile';
    miiState.hair = user.avatar_hair || 'none';
    
    // Draw avatars
    drawMii(miiState, 'sidebarAvatar', 40);
    if (document.getElementById('miiCanvas')) {
        drawMii(miiState, 'miiCanvas', 200);
    }
}

/**
 * Draw Mii avatar on canvas
 * @param {object} state - Avatar state
 * @param {string} canvasId - Canvas element ID
 * @param {number} size - Canvas size
 */
function drawMii(state, canvasId, size = 120) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    
    const cx = size / 2;
    const cy = size / 2;
    const headRadius = size * 0.35;
    
    ctx.clearRect(0, 0, size, size);
    
    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, headRadius * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = state.color || '#10b981';
    ctx.fill();
    
    // Head
    ctx.beginPath();
    ctx.arc(cx, cy, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = state.skin || '#fde68a';
    ctx.fill();
    
    // Eyes
    const eyeY = cy - headRadius * 0.1;
    const eyeXOffset = headRadius * 0.2;
    const eyeSize = headRadius * 0.1;
    
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(cx - eyeXOffset, eyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeXOffset, eyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Mouth
    ctx.beginPath();
    ctx.arc(cx, cy + headRadius * 0.2, headRadius * 0.15, 0, Math.PI);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = size * 0.02;
    ctx.stroke();
}

// ══════════════════════════════════════════════════════════════════════════════════════
//   TAB NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Switch between main app sections
 * @param {string} section - Section to show
 */
async function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.tab-pane').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(section);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        if (el.getAttribute('onclick')?.includes(section)) {
            el.classList.add('active');
        }
    });
    
    // Load section data
    switch (section) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'activities':
            await loadActivities();
            initMapIfNeeded();
            break;
        case 'challenges':
            await loadChallenges();
            break;
        case 'leaderboard':
            await loadLeaderboard();
            break;
        case 'social':
            await loadSocial();
            break;
        case 'shop':
            await loadShop();
            break;
        case 'profile':
            await loadProfile();
            break;
        case 'avatar':
            await loadProfile(); // Load profile first to get avatar state
            break;
        case 'notifiche':
            await loadNotifications();
            break;
        case 'admin':
            if (myProfile?.is_admin) {
                await loadAdminPanel();
            }
            break;
    }
}
window.showSection = showSection;

/**
 * Toggle mobile navigation
 */
function toggleMobileNav() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('open');
    if (overlay) {
        overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
    }
}
window.toggleMobileNav = toggleMobileNav;

// ══════════════════════════════════════════════════════════════════════════════════════
//   DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load dashboard data
 */
async function loadDashboard() {
    try {
        // Load stats
        const stats = await apiRequest('/api/stats');
        if (!stats.error) {
            document.getElementById('dashboardTotalCo2').textContent = (stats.co2_saved || 0).toFixed(1);
            document.getElementById('dashboardWeekCo2').textContent = (stats.co2_week || 0).toFixed(1);
            document.getElementById('dashboardMonthCo2').textContent = (stats.co2_month || 0).toFixed(1);
            document.getElementById('dashboardPoints').textContent = stats.points || 0;
        }
        
        // Load recent activities
        const activities = await apiRequest('/api/activities');
        if (!activities.error && activities.length > 0) {
            const recentContainer = document.getElementById('recentActivities');
            recentContainer.innerHTML = '';
            
            activities.slice(0, 5).forEach(activity => {
                const activityEl = document.createElement('div');
                activityEl.className = 'activity-item';
                activityEl.innerHTML = `
                    <div class="activity-item-icon">${ACTIVITY_ICONS[activity.type] || '🌱'}</div>
                    <div class="activity-item-content">
                        <div class="activity-item-title">${activity.type}</div>
                        <div class="activity-item-meta">
                            ${activity.km ? activity.km + ' km' : ''}
                            ${activity.hours ? activity.hours + ' ore' : ''}
                            ${activity.note ? ' · ' + activity.note : ''}
                            <span>${new Date(activity.date).toLocaleDateString('it-IT')}</span>
                        </div>
                    </div>
                    <div class="activity-item-stats">
                        <div class="activity-item-co2">-${activity.co2_saved} kg</div>
                        <div class="activity-item-points">+${activity.points} pt</div>
                    </div>
                `;
                recentContainer.appendChild(activityEl);
            });
        } else {
            document.getElementById('recentActivities').innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🌱</div>
                    <p>Nessuna attività ancora</p>
                    <button class="btn btn-primary btn-sm" onclick="showSection('activities')">Registra ora</button>
                </div>
            `;
        }
        
        // Load yearly chart data
        const yearly = await apiRequest('/api/yearly');
        if (!yearly.error && yearly.length > 0) {
            renderYearlyChart(yearly);
        } else {
            renderEmptyChart();
        }
        
        // Load recent badges
        const badges = await apiRequest('/api/badges');
        if (!badges.error) {
            const recentBadges = badges.filter(b => b.unlocked).slice(0, 4);
            const badgesContainer = document.getElementById('recentBadges');
            
            if (recentBadges.length > 0) {
                badgesContainer.innerHTML = recentBadges.map(badge => `
                    <div class="badge-item unlocked">
                        <div class="badge-icon">${badge.icon}</div>
                        <div class="badge-name">${badge.name}</div>
                    </div>
                `).join('');
            } else {
                badgesContainer.innerHTML = `
                    <div class="badge-item locked" style="grid-column: span 2;">
                        <div class="badge-icon">🔒</div>
                        <div class="badge-name">Nessun badge</div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

/**
 * Render yearly chart
 * @param {Array} data - Yearly data
 */
function renderYearlyChart(data) {
    const canvas = document.getElementById('yearlyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = canvas.offsetHeight || 200;
    
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const values = new Array(12).fill(0);
    
    data.forEach(item => {
        const monthIndex = parseInt(item.month_num) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
            values[monthIndex] = parseFloat(item.co2) || 0;
        }
    });
    
    const maxValue = Math.max(...values, 1);
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = (width - 60) / 12;
    
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 20);
    ctx.lineTo(40, height - 30);
    ctx.lineTo(width - 20, height - 30);
    ctx.stroke();
    
    // Draw bars
    values.forEach((value, index) => {
        const barHeight = (value / maxValue) * (height - 70);
        const x = 45 + index * barWidth;
        const y = height - 35 - barHeight;
        
        // Gradient
        const gradient = ctx.createLinearGradient(0, y, 0, height - 35);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(1, '#34d399');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 5, barHeight);
        
        // Month label
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(months[index], x + (barWidth - 5) / 2, height - 15);
        
        // Value label
        if (value > 0) {
            ctx.fillStyle = '#059669';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.fillText(value.toFixed(1), x + (barWidth - 5) / 2, y - 5);
        }
    });
}

/**
 * Render empty chart placeholder
 */
function renderEmptyChart() {
    const canvas = document.getElementById('yearlyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = canvas.offsetHeight || 200;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nessun dato disponibile', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Registra attività per vedere il grafico', canvas.width / 2, canvas.height / 2 + 15);
    
    // Draw placeholder bars
    ctx.fillStyle = '#e5e7eb';
    for (let i = 0; i < 12; i++) {
        const x = 45 + i * ((canvas.width - 60) / 12);
        const height = 30 + Math.sin(i) * 15;
        ctx.fillRect(x, canvas.height - 35 - height, ((canvas.width - 60) / 12) - 5, height);
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════
//   ACTIVITIES
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Select activity type
 * @param {string} type - Activity type
 * @param {HTMLElement} btn - Clicked button
 */
function selectActivityType(type, btn) {
    currentActivityType = type;
    document.getElementById('actType').value = type;
    
    // Update active state
    document.querySelectorAll('.activity-type-btn').forEach(b => {
        b.classList.remove('active');
    });
    btn.classList.add('active');
    
    // Show/hide fields based on type
    const rate = CO2_RATES[type];
    const kmGroup = document.getElementById('kmGroup');
    const hoursGroup = document.getElementById('hoursGroup');
    const mapSection = document.getElementById('mapSection');
    
    if (rate.type === 'km') {
        kmGroup.style.display = 'block';
        hoursGroup.style.display = 'none';
        mapSection.style.display = 'block';
    } else {
        kmGroup.style.display = 'none';
        hoursGroup.style.display = 'block';
        mapSection.style.display = 'none';
    }
    
    // Enable save button
    document.getElementById('saveActivityBtn').disabled = false;
    
    // Update preview
    updateActivityPreview();
    
    // Initialize map if needed
    if (rate.type === 'km' && !mapInitialized) {
        initMap();
    }
}
window.selectActivityType = selectActivityType;

/**
 * Update activity preview (CO2 and points)
 */
function updateActivityPreview() {
    if (!currentActivityType) return;
    
    const rate = CO2_RATES[currentActivityType];
    const km = parseFloat(document.getElementById('actKm')?.value) || 0;
    const hours = parseFloat(document.getElementById('actHours')?.value) || 0;
    
    const value = rate.type === 'km' ? km : hours;
    const co2 = (value * rate.co2).toFixed(2);
    const points = Math.round(value * rate.points);
    
    document.getElementById('pCO2').textContent = co2 + ' kg';
    document.getElementById('pPts').textContent = points + ' pt';
    document.getElementById('activitySummary').style.display = 'block';
}
window.updateActivityPreview = updateActivityPreview;

/**
 * Save activity
 */
async function saveActivity() {
    if (!currentActivityType) {
        showNotification('Seleziona un tipo di attività', 'error');
        return;
    }
    
    const rate = CO2_RATES[currentActivityType];
    const km = parseFloat(document.getElementById('actKm')?.value) || 0;
    const hours = parseFloat(document.getElementById('actHours')?.value) || 0;
    const note = document.getElementById('actNote')?.value || '';
    const fromAddr = document.getElementById('fromAddr')?.value || '';
    const toAddr = document.getElementById('toAddr')?.value || '';
    
    if (rate.type === 'km' && km === 0) {
        showNotification('Inserisci la distanza percorsa', 'error');
        return;
    }
    
    if (rate.type === 'hours' && hours === 0) {
        showNotification('Inserisci il numero di ore', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('saveActivityBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';
    
    const data = await apiRequest('/api/activities', 'POST', {
        type: currentActivityType,
        km,
        hours,
        note,
        from_addr: fromAddr,
        to_addr: toAddr
    });
    
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification(`✅ Attività registrata! +${data.co2_saved} kg CO₂, +${data.points} punti`, 'success');
    
    // Reset form
    document.getElementById('actType').value = '';
    document.getElementById('actKm').value = '';
    document.getElementById('actHours').value = '';
    document.getElementById('actNote').value = '';
    document.getElementById('fromAddr').value = '';
    document.getElementById('toAddr').value = '';
    document.getElementById('activitySummary').style.display = 'none';
    document.getElementById('saveActivityBtn').disabled = true;
    
    document.querySelectorAll('.activity-type-btn').forEach(b => b.classList.remove('active'));
    currentActivityType = null;
    
    // Reload activities list
    await loadActivities();
    
    // Update user points in sidebar
    if (myProfile) {
        myProfile.points = (myProfile.points || 0) + data.points;
        myProfile.co2_saved = (myProfile.co2_saved || 0) + data.co2_saved;
        updateSidebar(myProfile);
    }
}
window.saveActivity = saveActivity;

/**
 * Load activities list
 */
async function loadActivities() {
    try {
        const activities = await apiRequest('/api/activities');
        const container = document.getElementById('actList');
        
        if (!container) return;
        
        if (activities.error || activities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🌱</div>
                    <p>Nessuna attività registrata</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        activities.forEach(activity => {
            const activityEl = document.createElement('div');
            activityEl.className = 'activity-item';
            activityEl.innerHTML = `
                <div class="activity-item-icon">${ACTIVITY_ICONS[activity.type] || '🌱'}</div>
                <div class="activity-item-content">
                    <div class="activity-item-title">${activity.type}</div>
                    <div class="activity-item-meta">
                        ${activity.km ? activity.km + ' km' : ''}
                        ${activity.hours ? activity.hours + ' ore' : ''}
                        ${activity.note ? ' · ' + activity.note : ''}
                        <br>
                        <small>${new Date(activity.date).toLocaleDateString('it-IT')}</small>
                    </div>
                </div>
                <div class="activity-item-stats">
                    <div class="activity-item-co2">-${activity.co2_saved} kg</div>
                    <div class="activity-item-points">+${activity.points} pt</div>
                </div>
            `;
            container.appendChild(activityEl);
        });
    } catch (error) {
        console.error('Error loading activities:', error);
    }
}
// ══════════════════════════════════════════════════════════════════════════════════════
//   MAP FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Initialize map
 */
function initMap() {
    if (mapInitialized || !document.getElementById('map')) return;
    
    mapInstance = L.map('map').setView([41.9028, 12.4964], 6);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);
    
    mapInitialized = true;
}
window.initMap = initMap;

/**
 * Initialize map if needed (called from activities tab)
 */
function initMapIfNeeded() {
    if (!mapInitialized && document.getElementById('map')) {
        initMap();
    }
}

/**
 * Set map layer (street/satellite/transport)
 * @param {string} layer - Layer type
 */
function setMapLayer(layer) {
    if (!mapInstance) return;
    
    // Update active button
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`mapLayer${layer.charAt(0).toUpperCase() + layer.slice(1)}`).classList.add('active');
    
    // Remove existing tile layers
    mapInstance.eachLayer(l => {
        if (l instanceof L.TileLayer) {
            mapInstance.removeLayer(l);
        }
    });
    
    // Add new layer
    if (layer === 'street') {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapInstance);
    } else if (layer === 'satellite') {
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri'
        }).addTo(mapInstance);
    } else if (layer === 'transport') {
        L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenTopoMap'
        }).addTo(mapInstance);
    }
}
window.setMapLayer = setMapLayer;

/**
 * Get user's current location
 */
function getUserLocation() {
    if (!navigator.geolocation) {
        showNotification('Geolocalizzazione non supportata dal browser', 'error');
        return;
    }
    
    showNotification('Rilevamento posizione in corso...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            
            if (mapInstance) {
                mapInstance.setView([latitude, longitude], 13);
                L.marker([latitude, longitude]).addTo(mapInstance)
                    .bindPopup('La tua posizione')
                    .openPopup();
            }
            
            // Reverse geocoding to get address
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
                .then(r => r.json())
                .then(data => {
                    if (data.display_name) {
                        document.getElementById('fromAddr').value = data.display_name;
                        showNotification('Posizione rilevata!', 'success');
                    }
                })
                .catch(() => {
                    showNotification('Posizione rilevata ma indirizzo non trovato', 'warning');
                });
        },
        (error) => {
            let message = 'Errore nel rilevare la posizione';
            if (error.code === 1) {
                message = 'Permesso di geolocalizzazione negato';
            } else if (error.code === 2) {
                message = 'Posizione non disponibile';
            } else if (error.code === 3) {
                message = 'Timeout nel rilevare la posizione';
            }
            showNotification(message, 'error');
        }
    );
}
window.getUserLocation = getUserLocation;

/**
 * Search for address suggestions
 * @param {string} fieldId - Input field ID
 * @param {string} query - Search query
 */
async function searchAddress(fieldId, query) {
    if (query.length < 3) {
        document.getElementById(fieldId + 'Sugg').innerHTML = '';
        return;
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`
        );
        const data = await response.json();
        
        const suggestions = document.getElementById(fieldId + 'Sugg');
        suggestions.innerHTML = '';
        
        data.forEach(place => {
            const div = document.createElement('div');
            div.className = 'addr-item';
            div.textContent = place.display_name;
            div.onclick = () => selectAddress(fieldId, place.display_name);
            suggestions.appendChild(div);
        });
    } catch (error) {
        console.error('Address search error:', error);
    }
}
window.searchAddress = searchAddress;

/**
 * Select address from suggestions
 * @param {string} fieldId - Input field ID
 * @param {string} address - Selected address
 */
function selectAddress(fieldId, address) {
    document.getElementById(fieldId).value = address;
    document.getElementById(fieldId + 'Sugg').innerHTML = '';
}
window.selectAddress = selectAddress;

/**
 * Calculate route between start and end
 */
async function calculateRoute() {
    const from = document.getElementById('fromAddr')?.value.trim();
    const to = document.getElementById('toAddr')?.value.trim();
    
    if (!from || !to) {
        showNotification('Inserisci partenza e destinazione', 'error');
        return;
    }
    
    showNotification('Calcolo percorso in corso...', 'info');
    
    try {
        // Geocode start
        const fromResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(from)}&format=json&limit=1`
        );
        const fromData = await fromResponse.json();
        
        if (!fromData[0]) {
            showNotification('Partenza non trovata', 'error');
            return;
        }
        
        // Geocode end
        const toResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(to)}&format=json&limit=1`
        );
        const toData = await toResponse.json();
        
        if (!toData[0]) {
            showNotification('Destinazione non trovata', 'error');
            return;
        }
        
        const fromLat = parseFloat(fromData[0].lat);
        const fromLon = parseFloat(fromData[0].lon);
        const toLat = parseFloat(toData[0].lat);
        const toLon = parseFloat(toData[0].lon);
        
        // Remove existing route
        if (routingControl) {
            mapInstance.removeControl(routingControl);
        }
        
        // Add route
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(fromLat, fromLon),
                L.latLng(toLat, toLon)
            ],
            routeWhileDragging: false,
            showAlternatives: true,
            fitSelectedRoutes: true,
            lineOptions: {
                styles: [{ color: '#10b981', weight: 6 }]
            }
        }).addTo(mapInstance);
        
        routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            const distance = routes[0].summary.totalDistance / 1000; // km
            
            document.getElementById('actKm').value = distance.toFixed(1);
            updateActivityPreview();
            showNotification(`Distanza: ${distance.toFixed(1)} km`, 'success');
        });
        
    } catch (error) {
        console.error('Route calculation error:', error);
        showNotification('Errore nel calcolo del percorso', 'error');
    }
}
window.calculateRoute = calculateRoute;

// ══════════════════════════════════════════════════════════════════════════════════════
//   LEADERBOARD
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load leaderboard
 */
async function loadLeaderboard() {
    try {
        const data = await apiRequest('/api/leaderboard');
        const container = document.getElementById('lbList');
        
        if (!container) return;
        
        if (data.error || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🏆</div>
                    <p>Nessun utente in classifica</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        data.forEach((user, index) => {
            const rankClass = index === 0 ? 'top1' : index === 1 ? 'top2' : index === 2 ? 'top3' : '';
            
            const userEl = document.createElement('div');
            userEl.className = 'leaderboard-item';
            userEl.innerHTML = `
                <div class="leaderboard-rank ${rankClass}">${index + 1}</div>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${user.name}</div>
                    <div class="leaderboard-username">@${user.username || ''}</div>
                </div>
                <div class="leaderboard-stats">
                    <div class="leaderboard-co2">🌱 ${(user.co2_saved || 0).toFixed(1)} kg</div>
                    <div class="leaderboard-points">⭐ ${user.points || 0} pt</div>
                </div>
            `;
            container.appendChild(userEl);
        });
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}
window.loadLeaderboard = loadLeaderboard;

// ══════════════════════════════════════════════════════════════════════════════════════
//   CHALLENGES
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load challenges
 */
async function loadChallenges() {
    try {
        const data = await apiRequest('/api/challenges');
        const container = document.getElementById('chList');
        
        if (!container) return;
        
        if (data.error || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🏆</div>
                    <p>Nessuna sfida attiva</p>
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('challengeForm').scrollIntoView({behavior: 'smooth'})">Crea la prima sfida</button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        data.forEach(challenge => {
            const challengeEl = document.createElement('div');
            challengeEl.className = 'challenge-item';
            
            const isExpired = challenge.end_date && new Date(challenge.end_date) < new Date();
            
            challengeEl.innerHTML = `
                <div class="challenge-header">
                    <h4>${challenge.title}</h4>
                    <span class="challenge-badge ${challenge.is_public ? 'public' : 'private'}">
                        ${challenge.is_public ? '🌍 Pubblica' : '🔒 Privata'}
                    </span>
                </div>
                <p class="challenge-description">${challenge.description || 'Nessuna descrizione'}</p>
                <div class="challenge-meta">
                    <span>🎯 ${challenge.co2_target} kg CO₂</span>
                    <span>⭐ ${challenge.points_reward} pt</span>
                    <span>📅 ${new Date(challenge.end_date).toLocaleDateString('it-IT')}</span>
                </div>
                ${isExpired ? '<div class="challenge-expired">⏰ Scaduta</div>' : ''}
            `;
            container.appendChild(challengeEl);
        });
    } catch (error) {
        console.error('Error loading challenges:', error);
    }
}
window.loadChallenges = loadChallenges;

/**
 * Create new challenge
 */
async function createChallenge() {
    const title = document.getElementById('chTitle')?.value.trim();
    const description = document.getElementById('chDesc')?.value.trim();
    const co2Target = parseFloat(document.getElementById('chCo2')?.value) || 0;
    const pointsReward = parseInt(document.getElementById('chPts')?.value) || 0;
    const endDate = document.getElementById('chDate')?.value;
    const isPublic = document.getElementById('chPublic')?.checked || false;
    
    if (!title) {
        showNotification('Inserisci un titolo per la sfida', 'error');
        return;
    }
    
    if (co2Target <= 0) {
        showNotification('Inserisci un target CO₂ valido', 'error');
        return;
    }
    
    if (pointsReward <= 0) {
        showNotification('Inserisci un premio in punti valido', 'error');
        return;
    }
    
    if (!endDate) {
        showNotification('Seleziona una data di scadenza', 'error');
        return;
    }
    
    const data = await apiRequest('/api/challenges', 'POST', {
        title,
        description,
        co2_target: co2Target,
        points_reward: pointsReward,
        end_date: endDate,
        is_public: isPublic
    });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('✅ Sfida creata con successo!', 'success');
    
    // Reset form
    document.getElementById('chTitle').value = '';
    document.getElementById('chDesc').value = '';
    document.getElementById('chCo2').value = '';
    document.getElementById('chPts').value = '';
    document.getElementById('chDate').value = '';
    document.getElementById('chPublic').checked = true;
    
    // Reload challenges
    await loadChallenges();
}
window.createChallenge = createChallenge;

// ══════════════════════════════════════════════════════════════════════════════════════
//   PROFILE
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load profile data
 */
async function loadProfile() {
    try {
        const profile = await apiRequest('/api/profile');
        
        if (profile.error) {
            showNotification(profile.error, 'error');
            return;
        }
        
        myProfile = profile;
        
        // Fill edit form
        document.getElementById('editName').value = profile.name || '';
        document.getElementById('editUsername').value = profile.username || '';
        document.getElementById('editBio').value = profile.bio || '';
        
        // Update stats
        document.getElementById('profPoints').textContent = profile.points || 0;
        document.getElementById('profCo2').textContent = (profile.co2_saved || 0).toFixed(1);
        document.getElementById('profActs').textContent = profile.total_activities || 0;
        
        // Calculate level and XP
        const points = profile.points || 0;
        const level = Math.floor(points / 100) + 1;
        const nextLevelPoints = level * 100;
        const xpProgress = ((points % 100) / 100) * 100;
        
        document.getElementById('profLevel').textContent = `Livello ${level}`;
        document.getElementById('xpText').textContent = `${points}/${nextLevelPoints} XP`;
        document.getElementById('xpBar').style.width = xpProgress + '%';
        
        // Load badges
        await loadBadges();
        
        // Sync avatar state
        syncMiiState(profile);
        
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}
window.loadProfile = loadProfile;

/**
 * Load badges
 */
async function loadBadges() {
    try {
        const badges = await apiRequest('/api/badges');
        const container = document.getElementById('badgeList');
        
        if (!container) return;
        
        if (badges.error || badges.length === 0) {
            container.innerHTML = '<div class="empty-state">Nessun badge disponibile</div>';
            return;
        }
        
        container.innerHTML = '';
        
        badges.forEach(badge => {
            const badgeEl = document.createElement('div');
            badgeEl.className = `badge-item ${badge.unlocked ? 'unlocked' : 'locked'}`;
            badgeEl.innerHTML = `
                <div class="badge-icon">${badge.icon}</div>
                <div class="badge-name">${badge.name}</div>
                <div class="badge-desc">${badge.desc}</div>
            `;
            container.appendChild(badgeEl);
        });
    } catch (error) {
        console.error('Error loading badges:', error);
    }
}

/**
 * Save profile changes
 */
async function saveProfile() {
    const name = document.getElementById('editName')?.value.trim();
    const username = document.getElementById('editUsername')?.value.trim();
    const bio = document.getElementById('editBio')?.value.trim();
    
    if (!name || !username) {
        showNotification('Nome e username sono obbligatori', 'error');
        return;
    }
    
    const data = await apiRequest('/api/profile', 'PUT', { name, username, bio });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('✅ Profilo aggiornato!', 'success');
    
    // Update sidebar
    if (myProfile) {
        myProfile.name = name;
        myProfile.username = username;
        myProfile.bio = bio;
        updateSidebar(myProfile);
    }
}
window.saveProfile = saveProfile;

// ══════════════════════════════════════════════════════════════════════════════════════
//   AVATAR BUILDER
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Select background color
 * @param {string} color - Color code
 * @param {HTMLElement} el - Clicked element
 */
function selectBgColor(color, el) {
    miiState.color = color;
    
    document.querySelectorAll('#bgColors .color-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    el.classList.add('selected');
    
    drawMii(miiState, 'miiCanvas', 200);
    drawMii(miiState, 'sidebarAvatar', 40);
}
window.selectBgColor = selectBgColor;

/**
 * Select skin color
 * @param {string} color - Color code
 * @param {HTMLElement} el - Clicked element
 */
function selectSkinColor(color, el) {
    miiState.skin = color;
    
    document.querySelectorAll('#skinColors .color-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    el.classList.add('selected');
    
    drawMii(miiState, 'miiCanvas', 200);
    drawMii(miiState, 'sidebarAvatar', 40);
}
window.selectSkinColor = selectSkinColor;

/**
 * Select hair style
 * @param {string} style - Hair style
 */
function selectHairStyle(style) {
    miiState.hair = style;
    
    document.querySelectorAll('#hairStyles .style-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.target.classList.add('selected');
    
    drawMii(miiState, 'miiCanvas', 200);
    drawMii(miiState, 'sidebarAvatar', 40);
}
window.selectHairStyle = selectHairStyle;

/**
 * Select eyes style
 * @param {string} style - Eyes style
 */
function selectEyesStyle(style) {
    miiState.eyes = style;
    
    document.querySelectorAll('#eyesStyles .style-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.target.classList.add('selected');
    
    drawMii(miiState, 'miiCanvas', 200);
    drawMii(miiState, 'sidebarAvatar', 40);
}
window.selectEyesStyle = selectEyesStyle;

/**
 * Select mouth style
 * @param {string} style - Mouth style
 */
function selectMouthStyle(style) {
    miiState.mouth = style;
    
    document.querySelectorAll('#mouthStyles .style-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.target.classList.add('selected');
    
    drawMii(miiState, 'miiCanvas', 200);
    drawMii(miiState, 'sidebarAvatar', 40);
}
window.selectMouthStyle = selectMouthStyle;

/**
 * Save avatar
 */
async function saveAvatar() {
    const data = await apiRequest('/api/profile/avatar', 'PUT', {
        color: miiState.color,
        skin: miiState.skin,
        eyes: miiState.eyes,
        mouth: miiState.mouth,
        hair: miiState.hair
    });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('✅ Avatar salvato!', 'success');
    
    // Update sidebar
    if (myProfile) {
        myProfile.avatar_color = miiState.color;
        myProfile.avatar_skin = miiState.skin;
        myProfile.avatar_eyes = miiState.eyes;
        myProfile.avatar_mouth = miiState.mouth;
        myProfile.avatar_hair = miiState.hair;
        drawMii(miiState, 'sidebarAvatar', 40);
    }
}
window.saveAvatar = saveAvatar;

// ══════════════════════════════════════════════════════════════════════════════════════
//   SHOP
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load shop items
 */
async function loadShop() {
    try {
        const items = await apiRequest('/api/shop');
        if (items.error) {
            showNotification(items.error, 'error');
            return;
        }
        
        allShopItems = items;
        
        // Get user's owned items
        const profile = await apiRequest('/api/profile');
        ownedItems = profile.owned_items || [];
        
        document.getElementById('shopPoints').textContent = (profile.points || 0) + ' pt';
        
        renderShop(currentShopCategory);
    } catch (error) {
        console.error('Error loading shop:', error);
    }
}
window.loadShop = loadShop;

/**
 * Filter shop by category
 * @param {string} category - Category to filter
 */
function filterShop(category) {
    currentShopCategory = category;
    
    document.querySelectorAll('.shop-category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    renderShop(category);
}
window.filterShop = filterShop;

/**
 * Render shop items
 * @param {string} category - Category to display
 */
function renderShop(category) {
    const container = document.getElementById('shopGrid');
    if (!container) return;
    
    let items = allShopItems;
    if (category !== 'all') {
        items = items.filter(item => item.category === category);
    }
    
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">🛍️</div>
                <p>Nessun oggetto in questa categoria</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    items.forEach(item => {
        const owned = ownedItems.includes(item.id);
        
        const itemEl = document.createElement('div');
        itemEl.className = `shop-item ${owned ? 'owned' : ''} ${item.is_rare ? 'rare' : ''}`;
        itemEl.onclick = () => openShopPreview(item);
        
        itemEl.innerHTML = `
            <div class="shop-item-emoji">${item.emoji}</div>
            <div class="shop-item-name">${item.name}</div>
            <div class="shop-item-price">⭐ ${item.cost}</div>
            ${item.is_rare ? '<div class="shop-item-badge">✨ Raro</div>' : ''}
            ${owned ? '<div class="owned-badge">✅</div>' : ''}
        `;
        
        container.appendChild(itemEl);
    });
}

/**
 * Open shop item preview
 * @param {object} item - Shop item
 */
function openShopPreview(item) {
    const owned = ownedItems.includes(item.id);
    
    const content = document.getElementById('shopPreviewContent');
    content.innerHTML = `
        <div class="shop-preview">
            <div class="shop-preview-emoji">${item.emoji}</div>
            <h3 class="shop-preview-name">${item.name}</h3>
            ${item.description ? `<p class="shop-preview-desc">${item.description}</p>` : ''}
            <p class="shop-preview-category">Categoria: ${item.category}</p>
            ${item.is_rare ? '<p class="shop-preview-rare">✨ Oggetto raro</p>' : ''}
            <p class="shop-preview-price">Costo: ⭐ ${item.cost}</p>
            ${owned ? 
                '<p class="shop-preview-owned">✅ Già posseduto</p>' : 
                `<button class="btn btn-primary" onclick="buyShopItem(${item.id})">Acquista</button>`
            }
        </div>
    `;
    
    document.getElementById('shopPreviewModal').style.display = 'flex';
}
window.openShopPreview = openShopPreview;

/**
 * Close shop preview
 */
function closeShopPreview() {
    document.getElementById('shopPreviewModal').style.display = 'none';
}
window.closeShopPreview = closeShopPreview;

/**
 * Buy shop item
 * @param {number} itemId - Item ID
 */
async function buyShopItem(itemId) {
    closeShopPreview();
    
    showConfirm('Conferma acquisto', 'Sei sicuro di voler acquistare questo oggetto?', async () => {
        const data = await apiRequest('/api/shop/buy', 'POST', { item_id: itemId });
        
        if (data.error) {
            showNotification(data.error, 'error');
            return;
        }
        
        showNotification('✅ Oggetto acquistato!', 'success');
        
        // Reload shop
        await loadShop();
        
        // Update user points in sidebar
        const profile = await apiRequest('/api/profile');
        if (!profile.error) {
            myProfile = profile;
            updateSidebar(profile);
        }
    }, '🛒');
}
window.buyShopItem = buyShopItem;

// ══════════════════════════════════════════════════════════════════════════════════════
//   SOCIAL
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load social feed and users
 */
async function loadSocial() {
    try {
        // Load posts
        const posts = await apiRequest('/api/social/posts');
        const feed = document.getElementById('socialFeed');
        
        if (!feed) return;
        
        if (posts.error || posts.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <p>Nessun post nel feed</p>
                </div>
            `;
        } else {
            feed.innerHTML = '';
            
            posts.forEach(post => {
                const postEl = document.createElement('div');
                postEl.className = 'post-card';
                postEl.innerHTML = `
                    <div class="post-header">
                        <strong>${post.author_name}</strong>
                        <span>@${post.author_username}</span>
                        <small>${new Date(post.created_at).toLocaleDateString('it-IT')}</small>
                    </div>
                    <div class="post-content">${post.content}</div>
                    ${post.image_url ? `<img src="${post.image_url}" class="post-image" onerror="this.style.display='none'">` : ''}
                    <div class="post-actions">
                        <button class="post-like ${post.liked_by_me ? 'liked' : ''}" onclick="toggleLike(${post.id})">
                            ❤️ ${post.likes_count || 0}
                        </button>
                        <button class="post-comment" onclick="toggleComments(${post.id})">
                            💬 ${post.comments_count || 0}
                        </button>
                    </div>
                    <div id="comments-${post.id}" class="comments-section" style="display: none;"></div>
                `;
                feed.appendChild(postEl);
            });
        }
        
        // Load users
        const users = await apiRequest('/api/social/users');
        const userList = document.getElementById('userList');
        
        if (!userList) return;
        
        if (users.error || users.length === 0) {
            userList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <p>Nessun utente trovato</p>
                </div>
            `;
        } else {
            userList.innerHTML = '';
            
            users.forEach(user => {
                const userEl = document.createElement('div');
                userEl.className = 'user-item';
                userEl.innerHTML = `
                    <div class="user-info">
                        <strong>${user.name}</strong>
                        <span>@${user.username}</span>
                    </div>
                    <button class="btn-sm ${user.following ? 'btn-secondary' : 'btn-primary'}" 
                            onclick="toggleFollow(${user.id}, this)">
                        ${user.following ? 'Seguito' : 'Segui'}
                    </button>
                `;
                userList.appendChild(userEl);
            });
        }
    } catch (error) {
        console.error('Error loading social:', error);
    }
}
window.loadSocial = loadSocial;

/**
 * Create new post
 */
async function createPost() {
    const content = document.getElementById('postContent')?.value.trim();
    const imageUrl = document.getElementById('postImage')?.value.trim();
    
    if (!content) {
        showNotification('Scrivi qualcosa da condividere', 'error');
        return;
    }
    
    const data = await apiRequest('/api/social/posts', 'POST', { content, image_url: imageUrl });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    showNotification('✅ Post pubblicato!', 'success');
    
    document.getElementById('postContent').value = '';
    document.getElementById('postImage').value = '';
    
    await loadSocial();
}
window.createPost = createPost;

/**
 * Toggle like on post
 * @param {number} postId - Post ID
 */
async function toggleLike(postId) {
    const data = await apiRequest(`/api/social/posts/${postId}/like`, 'POST');
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    await loadSocial();
}
window.toggleLike = toggleLike;

/**
 * Toggle follow user
 * @param {number} userId - User ID
 * @param {HTMLElement} btn - Button element
 */
async function toggleFollow(userId, btn) {
    const data = await apiRequest(`/api/social/follow/${userId}`, 'POST');
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    if (data.following) {
        btn.textContent = 'Seguito';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        showNotification('Utente seguito', 'success');
    } else {
        btn.textContent = 'Segui';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        showNotification('Utente non seguito', 'info');
    }
}
window.toggleFollow = toggleFollow;

/**
 * Toggle comments section
 * @param {number} postId - Post ID
 */
async function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    
    if (commentsSection.style.display === 'none') {
        commentsSection.style.display = 'block';
        
        const comments = await apiRequest(`/api/social/posts/${postId}/comments`);
        
        if (comments.error || comments.length === 0) {
            commentsSection.innerHTML = `
                <div class="empty-state small">
                    <p>Nessun commento</p>
                </div>
                <div class="comment-form">
                    <input type="text" id="comment-${postId}" placeholder="Scrivi un commento..." class="input-field">
                    <button class="btn btn-primary btn-sm" onclick="addComment(${postId})">Invia</button>
                </div>
            `;
        } else {
            commentsSection.innerHTML = comments.map(c => `
                <div class="comment-item">
                    <strong>${c.author_name}</strong>
                    <span>${c.content}</span>
                    <small>${new Date(c.created_at).toLocaleDateString('it-IT')}</small>
                </div>
            `).join('');
            commentsSection.innerHTML += `
                <div class="comment-form">
                    <input type="text" id="comment-${postId}" placeholder="Scrivi un commento..." class="input-field">
                    <button class="btn btn-primary btn-sm" onclick="addComment(${postId})">Invia</button>
                </div>
            `;
        }
    } else {
        commentsSection.style.display = 'none';
    }
}
window.toggleComments = toggleComments;

/**
 * Add comment to post
 * @param {number} postId - Post ID
 */
async function addComment(postId) {
    const commentInput = document.getElementById(`comment-${postId}`);
    const content = commentInput?.value.trim();
    
    if (!content) return;
    
    const data = await apiRequest(`/api/social/posts/${postId}/comments`, 'POST', { content });
    
    if (data.error) {
        showNotification(data.error, 'error');
        return;
    }
    
    commentInput.value = '';
    await toggleComments(postId);
}
window.addComment = addComment;

// ══════════════════════════════════════════════════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load notifications
 */
async function loadNotifications() {
    try {
        const notifications = await apiRequest('/api/notifications');
        const container = document.getElementById('notifList');
        
        if (!container) return;
        
        if (notifications.error || notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔔</div>
                    <p>Nessuna notifica</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        notifications.forEach(notif => {
            const notifEl = document.createElement('div');
            notifEl.className = `notification-item ${notif.is_read ? '' : 'unread'}`;
            notifEl.onclick = () => markNotificationRead(notif.id);
            
            notifEl.innerHTML = `
                <div class="notification-icon">🔔</div>
                <div class="notification-content">
                    <div class="notification-message">${notif.message}</div>
                    <div class="notification-time">${new Date(notif.created_at).toLocaleString('it-IT')}</div>
                </div>
            `;
            
            container.appendChild(notifEl);
        });
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}
window.loadNotifications = loadNotifications;

/**
 * Load notification count
 */
async function loadNotificationCount() {
    try {
        const data = await apiRequest('/api/notifications/count');
        const count = data.count || 0;
        
        const badge = document.getElementById('notificationsBadge');
        const topBadge = document.getElementById('topbarNotifBadge');
        
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline';
            topBadge.textContent = count;
            topBadge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
            topBadge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
    }
}
window.loadNotificationCount = loadNotificationCount;

/**
 * Mark notification as read
 * @param {number} notifId - Notification ID
 */
async function markNotificationRead(notifId) {
    await apiRequest(`/api/notifications/${notifId}/read`, 'POST');
    await loadNotifications();
    await loadNotificationCount();
}
window.markNotificationRead = markNotificationRead;

// ══════════════════════════════════════════════════════════════════════════════════════
//   ADMIN PANEL
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Load admin panel
 */
async function loadAdminPanel() {
    if (!myProfile?.is_admin) return;
    
    try {
        // Load stats
        const stats = await apiRequest('/api/admin/stats');
        if (!stats.error) {
            document.getElementById('adminStats').innerHTML = `
                <div class="admin-stat-card">
                    <div class="admin-stat-value">${stats.total_users || 0}</div>
                    <div class="admin-stat-label">Utenti</div>
                </div>
                <div class="admin-stat-card">
                    <div class="admin-stat-value">${stats.total_activities || 0}</div>
                    <div class="admin-stat-label">Attività</div>
                </div>
                <div class="admin-stat-card">
                    <div class="admin-stat-value">${(stats.total_co2 || 0).toFixed(1)}</div>
                    <div class="admin-stat-label">kg CO₂</div>
                </div>
                <div class="admin-stat-card">
                    <div class="admin-stat-value">${stats.total_posts || 0}</div>
                    <div class="admin-stat-label">Post</div>
                </div>
            `;
        }
        
        // Load users
        await loadAdminUsers();
        
        // Load activities
        await loadAdminActivities();
        
        // Load posts
        await loadAdminPosts();
        
        // Load shop items
        await loadAdminShop();
        
    } catch (error) {
        console.error('Error loading admin panel:', error);
    }
}
window.loadAdminPanel = loadAdminPanel;

/**
 * Load admin users
 */
async function loadAdminUsers() {
    const users = await apiRequest('/api/admin/users');
    if (users.error) return;
    
    const tbody = document.getElementById('adminTbody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${user.name}</strong><br>
                <small>@${user.username || ''}</small>
            </td>
            <td>${user.email}</td>
            <td>${user.points || 0}</td>
            <td>${(user.co2_saved || 0).toFixed(1)}</td>
            <td>
                <span class="pill ${user.is_admin ? 'pill-admin' : user.is_banned ? 'pill-banned' : 'pill-user'}">
                    ${user.is_admin ? 'Admin' : user.is_banned ? 'Bannato' : 'Utente'}
                </span>
            </td>
            <td class="admin-actions">
                <button class="admin-btn" onclick="editUser(${user.id})">✏️</button>
                <button class="admin-btn admin-btn-danger" onclick="deleteUser(${user.id}, '${user.name}')">🗑️</button>
                ${user.is_banned ? 
                    `<button class="admin-btn" onclick="unbanUser(${user.id})">🔓</button>` :
                    `<button class="admin-btn admin-btn-danger" onclick="banUser(${user.id})">🔨</button>`
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Load admin activities
 */
async function loadAdminActivities() {
    const activities = await apiRequest('/api/admin/activities');
    if (activities.error) return;
    
    const tbody = document.getElementById('adminActivitiesTable');
    tbody.innerHTML = '';
    
    activities.forEach(act => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${act.user_name}</td>
            <td>${act.type}</td>
            <td>${act.km ? act.km + ' km' : act.hours ? act.hours + ' ore' : '-'}</td>
            <td>-${act.co2_saved} kg</td>
            <td>+${act.points}</td>
            <td>${new Date(act.date).toLocaleDateString('it-IT')}</td>
            <td>
                <button class="admin-btn admin-btn-danger" onclick="deleteActivity(${act.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Load admin posts
 */
async function loadAdminPosts() {
    const posts = await apiRequest('/api/admin/posts');
    if (posts.error) return;
    
    const tbody = document.getElementById('adminPostsTable');
    tbody.innerHTML = '';
    
    posts.forEach(post => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${post.user_name}</td>
            <td>${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}</td>
            <td>${post.likes?.length || 0}</td>
            <td>${post.comment_count || 0}</td>
            <td>${new Date(post.created_at).toLocaleDateString('it-IT')}</td>
            <td>
                <button class="admin-btn admin-btn-danger" onclick="deletePost(${post.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Load admin shop
 */
async function loadAdminShop() {
    const items = await apiRequest('/api/shop');
    if (items.error) return;
    
    const tbody = document.getElementById('adminShopTable');
    tbody.innerHTML = '';
    
    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.emoji} ${item.name}</td>
            <td>${item.category}</td>
            <td>⭐ ${item.cost}</td>
            <td>${item.is_rare ? '✨ Sì' : 'No'}</td>
            <td>
                <button class="admin-btn admin-btn-danger" onclick="deleteShopItem(${item.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Switch admin tab
 * @param {string} tab - Tab to show
 */
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-content').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById(`admin${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`).style.display = 'block';
    
    document.querySelectorAll('.admin-tab').forEach(el => {
        el.classList.remove('active');
    });
    event.target.classList.add('active');
}
window.switchAdminTab = switchAdminTab;

// Admin action stubs (to be implemented fully if needed)
window.editUser = (userId) => showNotification('Funzione in sviluppo', 'info');
window.deleteUser = (userId, userName) => {
    showConfirm('Elimina utente', `Sei sicuro di voler eliminare ${userName}?`, () => {
        showNotification('Funzione in sviluppo', 'info');
    }, '⚠️');
};
window.banUser = (userId) => showNotification('Funzione in sviluppo', 'info');
window.unbanUser = (userId) => showNotification('Funzione in sviluppo', 'info');
window.deleteActivity = (activityId) => {
    showConfirm('Elimina attività', 'Sei sicuro di voler eliminare questa attività?', () => {
        showNotification('Funzione in sviluppo', 'info');
    }, '⚠️');
};
window.deletePost = (postId) => {
    showConfirm('Elimina post', 'Sei sicuro di voler eliminare questo post?', () => {
        showNotification('Funzione in sviluppo', 'info');
    }, '⚠️');
};
window.deleteShopItem = (itemId) => showNotification('Funzione in sviluppo', 'info');

// ══════════════════════════════════════════════════════════════════════════════════════
//   TUTORIAL
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * Show tutorial
 */
function showTutorial() {
    tutorialStep = 1;
    document.getElementById('tutorialOverlay').style.display = 'flex';
    updateTutorial();
}
window.showTutorial = showTutorial;

/**
 * Close tutorial
 */
function closeTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'none';
    apiRequest('/api/tutorial/complete', 'POST');
}
window.closeTutorial = closeTutorial;

/**
 * Next tutorial step
 */
function nextTutorialStep() {
    if (tutorialStep < 5) {
        tutorialStep++;
        updateTutorial();
    } else {
        closeTutorial();
    }
}
window.nextTutorialStep = nextTutorialStep;

/**
 * Previous tutorial step
 */
function prevTutorialStep() {
    if (tutorialStep > 1) {
        tutorialStep--;
        updateTutorial();
    }
}
window.prevTutorialStep = prevTutorialStep;

/**
 * Update tutorial display
 */
function updateTutorial() {
    document.querySelectorAll('.tutorial-step').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelector(`[data-step="${tutorialStep}"]`).classList.add('active');
    
    document.querySelectorAll('.tutorial-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === tutorialStep - 1);
    });
    
    const prevBtn = document.getElementById('tutorialPrevBtn');
    const nextBtn = document.getElementById('tutorialNextBtn');
    
    prevBtn.style.opacity = tutorialStep === 1 ? '0.5' : '1';
    prevBtn.style.pointerEvents = tutorialStep === 1 ? 'none' : 'auto';
    nextBtn.textContent = tutorialStep === 5 ? 'Inizia!' : 'Avanti →';
}
window.updateTutorial = updateTutorial;

// ══════════════════════════════════════════════════════════════════════════════════════
//   INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is already logged in
    if (token) {
        const profile = await apiRequest('/api/profile');
        
        if (!profile.error) {
            myProfile = profile;
            
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('appContainer').style.display = 'flex';
            
            updateSidebar(profile);
            syncMiiState(profile);
            await loadDashboard();
            await loadNotificationCount();
            
            setInterval(loadNotificationCount, 30000);
            
            if (!profile.tutorial_done) {
                setTimeout(() => showTutorial(), 1000);
            }
        } else {
            token = null;
            localStorage.removeItem('ecotoken');
        }
    }
    
    // Check for reset password token in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token') && urlParams.get('action') === 'reset') {
        switchAuthTab('reset');
    }
    
    // Default to login tab
    switchAuthTab('login');
});
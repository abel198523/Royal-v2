const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}`);
const bingoBoard = document.getElementById('bingo-board');
const activeBall = document.getElementById('active-ball');
const recentBalls = document.getElementById('recent-balls');
const callCount = document.getElementById('call-count');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const colors = {
    B: '#3b82f6',
    I: '#8b5cf6',
    N: '#22c55e',
    G: '#f59e0b',
    O: '#ef4444'
};

// --- NAVIGATION & UI ---
function showAuth(type) {
    const welcome = document.getElementById('welcome-screen');
    const auth = document.getElementById('auth-screen');
    if (welcome) welcome.style.display = 'none';
    if (auth) {
        auth.style.display = 'flex';
        auth.classList.add('active');
    }
    if (type === 'signup') showSignup();
    else showLogin();
}

function showLogin() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const otpForm = document.getElementById('otp-form');
    if (loginForm) loginForm.style.display = 'block';
    if (signupForm) signupForm.style.display = 'none';
    if (otpForm) otpForm.style.display = 'none';
}

function showSignup() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const otpForm = document.getElementById('otp-form');
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'block';
    if (otpForm) otpForm.style.display = 'none';
}

function navTo(screenId) {
    const screens = [
        'welcome-screen', 'auth-screen', 'stake-screen', 'profile-screen', 
        'wallet-screen', 'deposit-screen', 'withdraw-screen', 'admin-screen', 
        'selection-screen', 'game-screen'
    ];
    
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const shouldShow = (id === screenId || id === screenId + '-screen');
            el.style.display = shouldShow ? (id === 'auth-screen' ? 'flex' : 'block') : 'none';
            if (shouldShow) el.classList.add('active');
            else el.classList.remove('active');
        }
    });

    if (['stake', 'profile', 'wallet', 'deposit', 'withdraw', 'admin', 'selection', 'game'].includes(screenId)) {
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.style.display = 'block';
    }
}

function closeMenu() {
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    if (sideMenu) sideMenu.classList.remove('active');
    if (menuOverlay) menuOverlay.classList.remove('active');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminToken');
    window.location.reload();
}

// --- ADMIN LOGIC ---
let lastLogoTap = 0;
function handleLogoClick() {
    const now = Date.now();
    if (now - lastLogoTap < 500) promptAdminPassword();
    lastLogoTap = now;
}

async function promptAdminPassword() {
    const password = prompt("Enter Admin Password:");
    if (!password) return;

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('isAdmin', 'true');
            localStorage.setItem('adminToken', data.token);
            const adminMenu = document.getElementById('admin-menu-item');
            if (adminMenu) adminMenu.style.display = 'flex';
            navTo('admin');
            closeMenu();
        } else alert("Invalid Password");
    } catch (err) { console.error("Admin login error:", err); }
}

// Admin Search & Balance
document.getElementById('admin-search-btn')?.addEventListener('click', async () => {
    const playerId = document.getElementById('admin-search-player-id')?.value;
    if (!playerId) return;

    try {
        const res = await fetch(`/api/admin/user/${playerId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const data = await res.json();
        if (data.success) {
            const resultDiv = document.getElementById('admin-user-result');
            if (resultDiv) resultDiv.style.display = 'block';
            document.getElementById('admin-user-name').textContent = data.user.username;
            document.getElementById('admin-user-phone').textContent = data.user.phone_number;
            document.getElementById('admin-user-balance').textContent = parseFloat(data.user.balance).toFixed(2);
            window.currentAdminTargetId = data.user.id;
        } else alert("User not found");
    } catch (err) { alert("Error searching user"); }
});

async function updateBalance(action) {
    const amount = parseFloat(document.getElementById('admin-balance-amount')?.value);
    if (!amount || amount <= 0 || !window.currentAdminTargetId) return;

    try {
        const res = await fetch('/api/admin/update-balance', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ userId: window.currentAdminTargetId, amount, action })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('admin-user-balance').textContent = parseFloat(data.newBalance).toFixed(2);
            document.getElementById('admin-balance-amount').value = '';
            alert(`Balance ${action === 'add' ? 'added' : 'subtracted'} successfully`);
        } else alert(data.error || "Update failed");
    } catch (err) { alert("Error updating balance"); }
}

document.getElementById('admin-add-balance')?.addEventListener('click', () => updateBalance('add'));
document.getElementById('admin-sub-balance')?.addEventListener('click', () => updateBalance('sub'));

// --- GAME LOGIC ---
function createBingoNumbers() {
    if (!bingoBoard) return;
    bingoBoard.innerHTML = '';
    for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 5; col++) {
            const num = (col * 15) + row + 1;
            const cell = document.createElement('div');
            cell.className = 'bingo-cell';
            cell.id = `num-${num}`;
            cell.innerText = num;
            bingoBoard.appendChild(cell);
        }
    }
}

const STAKES = [5, 10, 20];
let currentRoom = null;
let roomTakenCards = [];
let roomStates = {};

function updateRoomStats(stats, roomTimers, prizes) {
    Object.keys(stats).forEach(amount => {
        const countEl = document.getElementById(`stake-count-${amount}`);
        if (countEl) countEl.innerText = `${stats[amount]} Players`;
        
        const prizeEl = document.getElementById(`stake-prize-${amount}`);
        if (prizeEl && prizes && prizes[amount] !== undefined) {
            prizeEl.innerText = `Prize: ${prizes[amount].toFixed(2)} ETB`;
            prizeEl.style.display = 'block';
        }
        
        const timerEl = document.getElementById(`stake-timer-${amount}`);
        if (timerEl && roomTimers && roomTimers[amount] !== undefined) {
            const val = roomTimers[amount];
            if (val === 'PLAYING') {
                timerEl.innerText = '🎮 PLAYING';
                timerEl.className = 'stake-timer playing';
            } else {
                timerEl.innerText = `⏰ ${val}`;
                timerEl.className = 'stake-timer';
            }
        }
    });
}

function updateCountdown(seconds) {
    const timerEl = document.getElementById('selection-timer');
    const timerLargeEl = document.getElementById('selection-timer-large');
    const timeStrWithEmoji = seconds === 'PLAYING' ? '🎮 በጨዋታ ላይ' : `⏰ ${seconds}`;
    if (timerEl) timerEl.innerText = timeStrWithEmoji;
    if (timerLargeEl) timerLargeEl.innerText = seconds === 'PLAYING' ? 'በጨዋታ ላይ' : seconds;
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    createBingoNumbers();
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('menu-overlay');
    const toggleMenu = () => {
        if (sideMenu) sideMenu.classList.toggle('active');
        if (menuOverlay) menuOverlay.classList.toggle('active');
    };

    document.getElementById('close-menu')?.addEventListener('click', toggleMenu);
    document.getElementById('menu-overlay')?.addEventListener('click', toggleMenu);
    document.getElementById('open-menu-stake')?.addEventListener('click', toggleMenu);
    document.getElementById('open-menu-game')?.addEventListener('click', toggleMenu);
});

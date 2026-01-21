const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws; // WebSocket variable

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
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('otp-form').style.display = 'none';
}

function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('otp-form').style.display = 'none';
}

function navTo(screenId) {
    const screens = [
        'welcome-screen', 'auth-screen', 'stake-screen', 'profile-screen', 
        'wallet-screen', 'deposit-screen', 'withdraw-screen', 'admin-screen', 
        'selection-screen', 'game-screen'
    ];
    
    // ለሁሉም ስክሪኖች display: none መስጠት
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });

    // ትክክለኛውን ስክሪን ማሳየት
    const targetId = (screenId.endsWith('-screen')) ? screenId : screenId + '-screen';
    const targetEl = document.getElementById(targetId);
    
    if (targetEl) {
        targetEl.style.display = (targetId === 'auth-screen') ? 'flex' : 'block';
        targetEl.classList.add('active');
    }

    // Main content መታየቱን ማረጋገጥ
    const mainContent = document.getElementById('main-content');
    if (['stake', 'profile', 'wallet', 'deposit', 'withdraw', 'admin', 'selection', 'game'].some(s => screenId.includes(s))) {
        if (mainContent) mainContent.style.display = 'block';
        if (document.getElementById('welcome-screen')) document.getElementById('welcome-screen').style.display = 'none';
    }
}

// --- AUTH LOGIC ---
async function handleLogin() {
    const username = document.getElementById('login-telegram')?.value;
    const password = document.getElementById('login-pass')?.value;
    const errorEl = document.getElementById('auth-error');

    if (!username || !password) {
        if (errorEl) errorEl.innerText = "እባክዎ ሁሉንም መረጃዎች ያስገቡ";
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            if (data.is_admin) {
                localStorage.setItem('isAdmin', 'true');
                const adminMenu = document.getElementById('admin-menu-item');
                if (adminMenu) adminMenu.style.display = 'flex';
            }
            if(document.getElementById('stake-username')) document.getElementById('stake-username').innerText = data.username;
            navTo('stake');
            setupWebSocket();
        } else {
            if (errorEl) errorEl.innerText = data.error || "የመግባት ስህተት";
        }
    } catch (err) {
        if (errorEl) errorEl.innerText = "የሰርቨር ግንኙነት ተቋርጧል";
    }
}

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

// --- ካርዶችን የመፍጠርና የመምረጥ ሎጂክ (የተስተካከለ) ---
function createAvailableCards(roomTakenCards = []) {
    const cardsGrid = document.getElementById('cards-grid');
    if (!cardsGrid) return;
    cardsGrid.innerHTML = '';

    for (let i = 1; i <= 100; i++) {
        const card = document.createElement('div');
        card.className = 'card-item';
        if (roomTakenCards.includes(i)) card.classList.add('taken');
        card.innerText = i;
        
        card.onclick = () => {
            if (card.classList.contains('taken')) return;
            
            // ሁሉንም selected አጥፋና አዲሱን ማርክ አድርግ
            document.querySelectorAll('.card-item').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            
            if (typeof showCardPreview === 'function') showCardPreview(i);
        };
        cardsGrid.appendChild(card);
    }
}

function updateRoomStats(stats, roomTimers, prizes) {
    if (!stats) return;
    Object.keys(stats).forEach(amount => {
        const countEl = document.getElementById(`stake-count-${amount}`);
        if (countEl) countEl.innerText = `${stats[amount]} Players`;
        
        const prizeEl = document.getElementById(`stake-prize-${amount}`);
        if (prizeEl && prizes && prizes[amount] !== undefined) {
            prizeEl.innerText = `Prize: ${prizes[amount].toFixed(2)} ETB`;
        }
        
        const timerEl = document.getElementById(`stake-timer-${amount}`);
        if (timerEl && roomTimers && roomTimers[amount] !== undefined) {
            const val = roomTimers[amount];
            timerEl.innerText = val === 'PLAYING' ? '🎮 PLAYING' : `⏰ ${val}`;
            timerEl.className = val === 'PLAYING' ? 'stake-timer playing' : 'stake-timer';
        }
    });
}

function setupWebSocket() {
    const token = localStorage.getItem('token');
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        if (token) ws.send(JSON.stringify({ type: 'AUTH', token }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'STATS') {
            updateRoomStats(data.stats, data.timers, data.prizes);
        } else if (data.type === 'COUNTDOWN') {
            const timerEl = document.getElementById('selection-timer');
            if (timerEl) timerEl.innerText = `⏰ ${data.value}`;
        } else if (data.type === 'GAME_START') {
            navTo('game');
        } else if (data.type === 'ROOM_DATA') {
            createAvailableCards(data.takenCards || []);
        }
    };
}

async function selectStake(amount) {
    const token = localStorage.getItem('token');
    if (!token) {
        navTo('auth');
        return;
    }
    
    const selStakeEl = document.getElementById('sel-stake-amount');
    if (selStakeEl) selStakeEl.innerText = amount;
    
    navTo('selection');
    createAvailableCards(); // መጀመሪያ ባዶ ካርዶችን አሳይ

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'JOIN_ROOM', room: amount, token: token }));
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    createBingoNumbers();
    
    const token = localStorage.getItem('token');
    if (token) {
        setupWebSocket();
        navTo('stake');
    } else {
        // ቶከን ከሌለ እንኳን ደህና መጡ ስክሪን ብቻ እንዲታይ
        navTo('welcome');
    }

    // Event Listeners
    document.getElementById('do-login')?.addEventListener('click', handleLogin);
    document.getElementById('do-signup')?.addEventListener('click', () => {
        const user = document.getElementById('signup-username')?.value;
        const tel = document.getElementById('signup-telegram')?.value;
        if(user && tel) handleSignup();
    });
});

// Expose functions
window.showAuth = showAuth;
window.navTo = navTo;
window.selectStake = selectStake;
window.logout = () => { localStorage.clear(); window.location.reload(); };

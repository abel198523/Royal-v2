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

// Admin Panel Trigger (Double Tap)
let lastLogoTap = 0;
function handleLogoClick() {
    const now = Date.now();
    if (now - lastLogoTap < 500) {
        promptAdminPassword();
    }
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
            document.getElementById('admin-menu-item').style.display = 'flex';
            navTo('admin');
            closeMenu();
        } else {
            alert("Invalid Password");
        }
    } catch (err) {
        console.error("Admin login error:", err);
    }
}

// User Balance Search
document.getElementById('admin-search-btn')?.addEventListener('click', async () => {
    const playerId = document.getElementById('admin-search-player-id').value;
    if (!playerId) return;

    try {
        const res = await fetch(`/api/admin/user/${playerId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('admin-user-result').style.display = 'block';
            document.getElementById('admin-user-name').textContent = data.user.username;
            document.getElementById('admin-user-phone').textContent = data.user.phone_number;
            document.getElementById('admin-user-balance').textContent = parseFloat(data.user.balance).toFixed(2);
            // Store current search ID for balance updates
            window.currentAdminTargetId = data.user.id;
        } else {
            alert("User not found");
        }
    } catch (err) {
        alert("Error searching user");
    }
});

// Update Balance
async function updateBalance(action) {
    const amount = parseFloat(document.getElementById('admin-balance-amount').value);
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
        } else {
            alert(data.error || "Update failed");
        }
    } catch (err) {
        alert("Error updating balance");
    }
}

document.getElementById('admin-add-balance')?.addEventListener('click', () => updateBalance('add'));
document.getElementById('admin-sub-balance')?.addEventListener('click', () => updateBalance('sub'));

function createBingoNumbers() {
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

let currentRoom = null;
let roomTakenCards = [];
let roomStates = {};

function getRoomState(roomId) {
    if (!roomStates[roomId]) {
        roomStates[roomId] = {
            myGameCard: null,
            currentSelectedCard: null,
            currentCardData: null,
            lastHistory: []
        };
    }
    return roomStates[roomId];
}

function updateRoomStats(stats, roomTimers, prizes) {
    Object.keys(stats).forEach(amount => {
        const countEl = document.getElementById(`stake-count-${amount}`);
        if (countEl) {
            countEl.innerText = `${stats[amount]} Players`;
            countEl.style.fontWeight = 'bold';
            countEl.style.color = stats[amount] > 0 ? '#3b82f6' : '#6b7280';
        }
        
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
                timerEl.style.color = '#22c55e';
                timerEl.style.background = 'rgba(34, 197, 94, 0.1)';
            } else {
                const seconds = parseInt(val);
                timerEl.innerText = `⏰ ${seconds}`;
                timerEl.style.color = '#f59e0b';
                timerEl.style.background = 'rgba(245, 158, 11, 0.1)';
            }
        }
    });
}

function updateCountdown(seconds) {
    const timerEl = document.getElementById('selection-timer');
    const timerLargeEl = document.getElementById('selection-timer-large');
    const stakeTimerEl = document.getElementById('stake-selection-timer');
    
    const timeStr = seconds === 'PLAYING' ? 'በጨዋታ ላይ' : seconds;
    const timeStrWithEmoji = seconds === 'PLAYING' ? '🎮 በጨዋታ ላይ' : `⏰ ${seconds}`;
    
    if (timerEl) timerEl.innerText = timeStrWithEmoji;
    if (timerLargeEl) timerLargeEl.innerText = timeStr;
    if (stakeTimerEl) stakeTimerEl.innerText = timeStrWithEmoji;
    
    if (typeof STAKES !== 'undefined') {
        STAKES.forEach(amount => {
            const rowTimer = document.getElementById(`stake-timer-${amount}`);
            if (rowTimer && currentRoom == amount) {
                rowTimer.innerText = timeStrWithEmoji;
            }
        });
    }
}

const STAKES = [5, 10, 20];

let staticCards = [];
fetch('cards.json')
    .then(r => r.json())
    .then(data => {
        staticCards = data;
    })
    .catch(err => console.error('Error loading cards:', err));

function getCardById(id) {
    const found = staticCards.find(c => c.id === id);
    return found ? found.data : (staticCards[0] ? staticCards[0].data : null);
}

function createAvailableCards() {
    const cardsGrid = document.getElementById('cards-grid');
    if (!cardsGrid) return;
    cardsGrid.innerHTML = '';
    
    // Ensure we are working with numbers
    const takenNumbers = roomTakenCards.map(Number);
    const availableCount = 100 - takenNumbers.length;
    const takenCount = takenNumbers.length;

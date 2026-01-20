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

const STAKES = [5, 10, 20, 30, 40, 50, 100, 200, 500];

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
    
    const availableCount = 100 - roomTakenCards.length;
    const takenCount = roomTakenCards.length;
    
    const legendAvailable = document.querySelector('.legend-item:nth-child(1)');
    const legendTaken = document.querySelector('.legend-item:nth-child(2)');
    
    if (legendAvailable) legendAvailable.innerHTML = `<div class="dot green"></div> Available (${availableCount})`;
    if (legendTaken) legendTaken.innerHTML = `<div class="dot red"></div> Taken (${takenCount})`;

    for (let i = 1; i <= 100; i++) {
        const card = document.createElement('div');
        card.className = 'card-item';
        if (roomTakenCards.includes(i)) card.classList.add('taken');
        card.innerText = i;
        
        card.onclick = () => {
            if (card.classList.contains('taken')) return;
            showCardPreview(i);
        };
        cardsGrid.appendChild(card);
    }
}

function showToast(message) {
    const toast = document.getElementById('notification-toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

function showWinnerModal(name, winCard, winPattern) {
    const modal = document.getElementById('winner-modal');
    const nameEl = document.getElementById('winner-display-name');
    const cardCont = document.getElementById('winner-card-container');
    if (!modal || !nameEl || !cardCont) return;
    nameEl.innerText = name;
    cardCont.innerHTML = '';
    if (winCard && winPattern) {
        const letters = ['B', 'I', 'N', 'G', 'O'];
        for (let row = 0; row < 5; row++) {
            letters.forEach(l => {
                const val = winCard[l][row];
                const cell = document.createElement('div');
                cell.className = 'win-cell';
                cell.innerText = val === 'FREE' ? '★' : val;
                if (winPattern.includes(val) || val === 'FREE') cell.classList.add('highlight');
                cardCont.appendChild(cell);
            });
        }
    }
    modal.classList.add('active');
}

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT') {
        currentRoom = data.room;
        const state = getRoomState(currentRoom);
        roomTakenCards = data.takenCards || [];
        if (!data.isGameRunning) {
            state.myGameCard = null;
            state.currentSelectedCard = null;
            state.currentCardData = null;
        }
        updateGameUI(data.history);
        updateCountdown(data.isGameRunning ? 'PLAYING' : data.countdown);
        createAvailableCards();
    } else if (data.type === 'NEW_BALL') {
        const state = getRoomState(data.room);
        state.lastHistory = data.history;
        if (data.room == currentRoom) updateGameUI(data.history);
    } else if (data.type === 'COUNTDOWN') {
        if (data.room == currentRoom) {
            updateCountdown(data.value);
            if (data.value <= 0) startGame();
        }
    } else if (data.type === 'GAME_START') {
        if (data.room == currentRoom) startGame();
    } else if (data.type === 'GAME_OVER') {
        const state = getRoomState(data.room);
        state.myGameCard = null;
        state.currentSelectedCard = null;
        state.currentCardData = null;
        state.lastHistory = [];
        if (data.room == currentRoom || !data.room) {
            showWinnerModal(data.winner, data.winCard, data.winPattern);
            setTimeout(() => {
                const modal = document.getElementById('winner-modal');
                if (modal) modal.classList.remove('active');
                const screens = ['game-screen', 'selection-screen', 'profile-screen', 'wallet-screen'];
                screens.forEach(s => {
                    const el = document.getElementById(s);
                    if (el) el.classList.remove('active');
                });
                document.getElementById('stake-screen').classList.add('active');
            }, 8000);
        }
    } else if (data.type === 'ERROR') {
        showToast(data.message);
    } else if (data.type === 'ROOM_STATS') {
        if (data.takenCards && data.takenCards[currentRoom]) {
            roomTakenCards = data.takenCards[currentRoom];
            createAvailableCards();
        }
        updateRoomStats(data.stats, data.timers, data.prizes);
        if (currentRoom && data.timers[currentRoom] !== undefined) {
            updateCountdown(data.timers[currentRoom]);
        }
    }
};

function startGame() {
    const screens = ['stake-screen', 'selection-screen', 'profile-screen', 'wallet-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });
    document.getElementById('game-screen').classList.add('active');
    createBingoNumbers();
    const state = getRoomState(currentRoom);
    if (state.myGameCard) {
        displayCard(state.myGameCard);
    }
    if (state.lastHistory) {
        updateGameUI(state.lastHistory);
    }
}

function updateGameUI(history) {
    if (!history) return;
    
    document.querySelectorAll('.bingo-cell').forEach(c => c.classList.remove('active'));
    
    history.forEach(num => {
        const cell = document.getElementById(`num-${num}`);
        if (cell) cell.classList.add('active');
    });

    if (history.length > 0) {
        const lastNum = history[history.length - 1];
        const letter = getBingoLetter(lastNum);
        activeBall.innerText = `${letter}${lastNum}`;
        activeBall.style.backgroundColor = colors[letter];
        activeBall.classList.remove('pop');
        void activeBall.offsetWidth;
        activeBall.classList.add('pop');
    }

    recentBalls.innerHTML = '';
    const recent = [...history].reverse().slice(1, 6);
    recent.forEach(num => {
        const letter = getBingoLetter(num);
        const ball = document.createElement('div');
        ball.className = 'ball-small';
        ball.innerText = num;
        ball.style.borderColor = colors[letter];
        ball.style.color = colors[letter];
        recentBalls.appendChild(ball);
    });

    callCount.innerText = history.length;
    const progress = (history.length / 75) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.innerText = `${history.length}/75`;

    const state = getRoomState(currentRoom);
    if (state.myGameCard) {
        updateCardHighlights(state.myGameCard, history);
    }
}

function getBingoLetter(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
}

function selectRoom(amount) {
    currentRoom = amount;
    socket.send(JSON.stringify({ type: 'JOIN_ROOM', room: amount }));
    document.getElementById('stake-screen').classList.remove('active');
    document.getElementById('selection-screen').classList.add('active');
}

function showCardPreview(cardId) {
    const state = getRoomState(currentRoom);
    state.currentSelectedCard = cardId;
    const cardData = getCardById(cardId);
    state.currentCardData = cardData;
    
    const previewContainer = document.getElementById('card-preview-container');
    previewContainer.innerHTML = '';
    
    const letters = ['B', 'I', 'N', 'G', 'O'];
    for (let row = 0; row < 5; row++) {
        letters.forEach(l => {
            const val = cardData[l][row];
            const cell = document.createElement('div');
            cell.className = 'preview-cell';
            cell.innerText = val === 'FREE' ? '★' : val;
            if (val === 'FREE') cell.classList.add('free');
            previewContainer.appendChild(cell);
        });
    }
    
    document.getElementById('selected-card-number').innerText = cardId;
    document.getElementById('card-modal').classList.add('active');
}

function closeCardModal() {
    document.getElementById('card-modal').classList.remove('active');
}

function buyCard() {
    const state = getRoomState(currentRoom);
    if (state.currentSelectedCard) {
        socket.send(JSON.stringify({
            type: 'BUY_CARD',
            room: currentRoom,
            cardId: state.currentSelectedCard
        }));
        state.myGameCard = state.currentCardData;
        closeCardModal();
        showToast(`Card #${state.currentSelectedCard} purchased!`);
    }
}

function displayCard(cardData) {
    const cardGrid = document.getElementById('game-card-grid');
    cardGrid.innerHTML = '';
    const letters = ['B', 'I', 'N', 'G', 'O'];
    
    for (let row = 0; row < 5; row++) {
        letters.forEach(l => {
            const val = cardData[l][row];
            const cell = document.createElement('div');
            cell.className = 'game-cell';
            cell.id = `card-cell-${val}`;
            cell.innerText = val === 'FREE' ? '★' : val;
            if (val === 'FREE') cell.classList.add('marked');
            cardGrid.appendChild(cell);
        });
    }
}

function updateCardHighlights(cardData, history) {
    const letters = ['B', 'I', 'N', 'G', 'O'];
    letters.forEach(l => {
        cardData[l].forEach(val => {
            if (val !== 'FREE' && history.includes(val)) {
                const cell = document.getElementById(`card-cell-${val}`);
                if (cell) cell.classList.add('marked');
            }
        });
    });
}

// Simple Tab Switching
// Event Listeners for Auth
document.addEventListener('DOMContentLoaded', () => {
    const signupBtn = document.getElementById('do-signup');
    if (signupBtn) {
        signupBtn.addEventListener('click', async () => {
            const username = document.getElementById('signup-username').value;
            const telegramId = document.getElementById('signup-telegram').value;
            const password = document.getElementById('signup-pass').value;

            if (!username || !telegramId || !password) {
                showToast('እባክዎ ሁሉንም ክፍተቶች ይሙሉ።');
                return;
            }

            try {
                const res = await fetch('/api/signup-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, telegram_chat_id: telegramId, password })
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(data.message);
                    document.getElementById('signup-form').style.display = 'none';
                    document.getElementById('otp-form').style.display = 'block';
                } else {
                    showToast(data.error || 'ስህተት ተፈጥሯል።');
                }
            } catch (e) {
                showToast('ከሰርቨር ጋር መገናኘት አልተቻለም።');
            }
        });
    }

    const verifyOtpBtn = document.getElementById('verify-otp');
    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', async () => {
            const otp = document.getElementById('otp-code').value;
            const telegramId = document.getElementById('signup-telegram').value;
            const username = document.getElementById('signup-username').value;
            const password = document.getElementById('signup-pass').value;

            if (!otp) {
                showToast('እባክዎ የማረጋገጫ ኮዱን ያስገቡ።');
                return;
            }

            try {
                const res = await fetch('/api/signup-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ otp, telegram_chat_id: telegramId, username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('ምዝገባዎ ተጠናቋል። አሁን መግባት ይችላሉ።');
                    showLogin();
                } else {
                    showToast(data.error || 'የተሳሳተ ኮድ።');
                }
            } catch (e) {
                showToast('ከሰርቨር ጋር መገናኘት አልተቻለም።');
            }
        });
    }

    const loginBtn = document.getElementById('do-login');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const telegramId = document.getElementById('login-telegram').value;
            const password = document.getElementById('login-pass').value;

            if (!telegramId || !password) {
                showToast('እባክዎ ቴሌግራም አይዲ እና ፓስወርድ ያስገቡ።');
                return;
            }

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: telegramId, password })
                });
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showToast('እንኳን በደህና መጡ!');
                    navTo('stake');
                } else {
                    showToast(data.error || 'የተሳሳተ ቴሌግራም አይዲ ወይም ፓስወርድ።');
                }
            } catch (e) {
                showToast('ከሰርቨር ጋር መገናኘት አልተቻለም።');
            }
        });
    }
});

function showAuth(type) {
    document.getElementById('welcome-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
    if (type === 'signup') {
        showSignup();
    } else {
        showLogin();
    }
}

function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('otp-form').style.display = 'none';
}

function showLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('otp-form').style.display = 'none';
}

function navTo(screenId) {
    const screens = ['stake-screen', 'selection-screen', 'game-screen', 'profile-screen', 'wallet-screen', 'deposit-screen', 'withdraw-screen', 'admin-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });
    
    // Also hide auth and welcome screens when navigating to app screens
    document.getElementById('welcome-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('main-content').style.display = 'block';
    
    const target = document.getElementById(screenId + '-screen');
    if (target) {
        target.classList.add('active');
    } else {
        const directTarget = document.getElementById(screenId);
        if (directTarget) directTarget.classList.add('active');
    }
    
    if (screenId === 'profile') updateProfile();
}

function showScreen(screenId) {
    const screens = ['stake-screen', 'selection-screen', 'game-screen', 'profile-screen', 'wallet-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    
    if (screenId === 'profile-screen') updateProfile();
}

function updateProfile() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('prof-username').innerText = user.username || 'Guest';
    document.getElementById('prof-balance').innerText = `${user.balance || 0} ETB`;
}

async function requestOTP() {
    const phone = document.getElementById('reg-phone').value;
    const username = document.getElementById('reg-username').value;
    const telegramId = document.getElementById('reg-telegram-id').value;
    
    if (!phone || !username || !telegramId) {
        showToast('Please fill all fields');
        return;
    }

    try {
        const res = await fetch('/api/request-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, username, telegram_chat_id: telegramId })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('otp-section').style.display = 'block';
            showToast('OTP sent to your Telegram!');
        } else {
            showToast(data.message);
        }
    } catch (e) {
        showToast('Error sending OTP');
    }
}

async function register() {
    const phone = document.getElementById('reg-phone').value;
    const username = document.getElementById('reg-username').value;
    const telegramId = document.getElementById('reg-telegram-id').value;
    const password = document.getElementById('reg-password').value;
    const otp = document.getElementById('reg-otp').value;

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, username, telegram_chat_id: telegramId, password, otp })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Registration successful! Please login.');
            showAuth('login');
        } else {
            showToast(data.message);
        }
    } catch (e) {
        showToast('Registration error');
    }
}

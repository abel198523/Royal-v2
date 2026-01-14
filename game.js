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
    // Create columns B(1-15), I(16-30), N(31-45), G(46-60), O(61-75)
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

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT') {
        currentRoom = data.room;
        roomTakenCards = data.takenCards || [];
        updateGameUI(data.history);
        if (data.isGameRunning) {
            updateCountdown(0); // Show it's already started or playing
        } else {
            updateCountdown(data.countdown);
        }
        createAvailableCards();
    } else if (data.type === 'NEW_BALL') {
        if (data.room === currentRoom) updateGameUI(data.history);
    } else if (data.type === 'COUNTDOWN') {
        if (data.room === currentRoom) updateCountdown(data.value);
    } else if (data.type === 'GAME_START') {
        if (data.room === currentRoom) startGame();
    } else if (data.type === 'ROOM_STATS') {
        if (data.takenCards && data.takenCards[currentRoom]) {
            roomTakenCards = data.takenCards[currentRoom];
            createAvailableCards();
        }
        updateRoomStats(data.stats, data.timers);
    }
};

function updateRoomStats(stats, roomTimers) {
    Object.keys(stats).forEach(amount => {
        const countEl = document.getElementById(`stake-count-${amount}`);
        if (countEl) countEl.innerText = `${stats[amount]} Players`;
        
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
    const stakeTimerEl = document.getElementById('stake-selection-timer');
    
    const timeStr = `⏰ ${seconds}`;
    
    if (timerEl) {
        timerEl.innerText = timeStr;
    }
    if (stakeTimerEl) stakeTimerEl.innerText = timeStr;
}

function startGame() {
    // Switch to game screen
    selectionScreen.classList.remove('active');
    stakeScreen.classList.remove('active'); // Ensure both are closed
    console.log('Game started, switching to game board');
}

function getBallLetter(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
}

function updateGameUI(history) {
    if (history.length === 0) {
        activeBall.innerText = '--';
        recentBalls.innerHTML = '';
        return;
    }
    
    const lastBall = history[history.length - 1];
    const letter = getBallLetter(lastBall);
    activeBall.innerText = `${letter}${lastBall}`;
    activeBall.parentElement.style.borderColor = colors[letter];

    // Reset styles
    document.querySelectorAll('.bingo-cell').forEach(cell => {
        cell.classList.remove('called', 'last-called', 'blue-highlight');
    });

    const counts = { B: 0, I: 0, N: 0, G: 0, O: 0 };

    history.forEach((num, index) => {
        const el = document.getElementById(`num-${num}`);
        const l = getBallLetter(num);
        counts[l]++;
        
        if (el) {
            if (index === history.length - 1) {
                el.classList.add('last-called');
            } else if (l === 'B' || l === 'I') {
                el.classList.add('blue-highlight');
            } else if (l === 'N') {
                el.classList.add('called');
            } else {
                el.classList.add('called');
            }
        }
    });

    // Update headers counts
    Object.keys(counts).forEach(l => {
        const header = document.querySelector(`.h-${l}`);
        if (header) header.setAttribute('data-count', counts[l]);
    });

    const recent = history.slice(-4, -1).reverse();
    recentBalls.innerHTML = recent.map(n => {
        const l = getBallLetter(n);
        return `<div class="hist-ball" style="background: ${colors[l]}">${l}${n}</div>`;
    }).join('');
    
    callCount.innerText = history.length;
    progressText.innerText = `${history.length}/75`;
    progressBar.style.width = `${(history.length / 75) * 100}%`;
}

const cardsGrid = document.getElementById('cards-grid');
const selectionScreen = document.getElementById('selection-screen');
const stakeScreen = document.getElementById('stake-screen');

const STAKES = [5, 10, 20, 30, 40, 50, 100, 200, 500];

function createStakeList() {
    const list = document.getElementById('stake-list');
    if (!list) return;
    list.innerHTML = '';
    
    STAKES.forEach(amount => {
        const row = document.createElement('div');
        row.className = 'stake-row';
        row.innerHTML = `
            <div class="stake-amount">${amount} ETB</div>
            <div class="stake-info">
                <div class="stake-players" id="stake-count-${amount}">0 Players</div>
                <div class="stake-timer" id="stake-timer-${amount}">⏰ 0:30</div>
            </div>
            <button class="join-btn" onclick="joinStake(${amount})">JOIN</button>
        `;
        list.appendChild(row);
    });
}

window.joinStake = (amount) => {
    // Here we will eventually check balance
    currentRoom = amount;
    socket.send(JSON.stringify({ type: 'JOIN_ROOM', room: amount }));
    
    stakeScreen.classList.remove('active');
    selectionScreen.classList.add('active');
    console.log(`Joined stake room: ${amount}`);
};

function generateBingoCard() {
    const card = {};
    const ranges = {
        B: [1, 15],
        I: [16, 30],
        N: [31, 45],
        G: [46, 60],
        O: [61, 75]
    };

    Object.keys(ranges).forEach(letter => {
        const [min, max] = ranges[letter];
        const nums = [];
        while (nums.length < 5) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!nums.includes(num)) nums.push(num);
        }
        card[letter] = nums.sort((a, b) => a - b);
    });
    
    // Middle spot is FREE
    card['N'][2] = 'FREE';
    return card;
}

function createCardPreview(cardData) {
    const container = document.createElement('div');
    container.className = 'card-preview';
    
    const letters = ['B', 'I', 'N', 'G', 'O'];
    letters.forEach(l => {
        const header = document.createElement('div');
        header.className = 'preview-header';
        header.innerText = l;
        container.appendChild(header);
    });

    for (let row = 0; row < 5; row++) {
        letters.forEach(l => {
            const cell = document.createElement('div');
            cell.className = 'preview-cell';
            if (cardData[l][row] === 'FREE') cell.classList.add('free-spot');
            cell.innerText = cardData[l][row];
            container.appendChild(cell);
        });
    }
    return container;
}

const previewOverlay = document.getElementById('preview-overlay');
const modalCardContent = document.getElementById('modal-card-content');
const previewCardNumber = document.getElementById('preview-card-number');
const closePreview = document.getElementById('close-preview');
const rejectCard = document.getElementById('reject-card');
const confirmCard = document.getElementById('confirm-card');

let currentSelectedCard = null;
let currentCardData = null;

let staticCards = [];

// Load cards from cards.json
async function loadCards() {
    try {
        const response = await fetch('cards.json');
        staticCards = await response.json();
        createAvailableCards();
    } catch (err) {
        console.error('Error loading cards:', err);
    }
}

function createAvailableCards() {
    const cardsGrid = document.getElementById('cards-grid');
    if (!cardsGrid) return;
    cardsGrid.innerHTML = '';
    
    // Update legend counts
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

function showCardPreview(num) {
    if (userBalance < currentRoom) {
        alert("በቂ ባላንስ የልዎትም፤ እባክዎን ዲፖዚት ያድርጉ።");
        return;
    }
    currentSelectedCard = num;
    const cardObj = staticCards.find(c => c.id === num);
    currentCardData = cardObj ? cardObj.data : generateBingoCard();
    
    previewCardNumber.innerText = `Card #${num}`;
    modalCardContent.innerHTML = '';
    modalCardContent.appendChild(createCardPreview(currentCardData));
    previewOverlay.classList.add('active');
}

closePreview.onclick = () => {
    previewOverlay.classList.remove('active');
    currentSelectedCard = null;
    currentCardData = null;
};

rejectCard.onclick = () => {
    previewOverlay.classList.remove('active');
    currentSelectedCard = null;
    currentCardData = null;
};

confirmCard.onclick = () => {
    if (!currentSelectedCard || !currentCardData) return;
    
    socket.send(JSON.stringify({ 
        type: 'BUY_CARD', 
        cardNumber: currentSelectedCard, 
        cardData: currentCardData 
    }));
    
    // Update the selection screen UI
    const myBoardLabel = document.getElementById('sel-my-board');
    if (myBoardLabel) myBoardLabel.innerText = `#${currentSelectedCard}`;
    
    // Just close preview, wait for timer to start game
    previewOverlay.classList.remove('active');
    
    console.log('Confirmed card selection, waiting for game start:', currentSelectedCard);
};

// Auth Screen logic
function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('auth-error').innerText = '';
}

function showLogin() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('auth-error').innerText = '';
}

// Attach to window for onclick handlers in HTML
window.showSignup = showSignup;
window.showLogin = showLogin;

document.getElementById('do-login').onclick = async () => {
    const phone = document.getElementById('login-phone').value;
    const password = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('auth-error');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('bingo_token', data.token);
            updateUserData(data);
            document.getElementById('auth-screen').classList.remove('active');
            document.getElementById('main-content').style.display = 'block';
            document.getElementById('selection-screen').classList.add('active');
        } else {
            errorEl.innerText = data.error || 'Login failed';
        }
    } catch (err) {
        errorEl.innerText = 'Connection error';
    }
};

let signupData = null;

document.getElementById('do-signup').onclick = async () => {
    const name = document.getElementById('signup-name').value;
    const phone = document.getElementById('signup-phone').value;
    const password = document.getElementById('signup-pass').value;
    const errorEl = document.getElementById('auth-error');

    if (!name || !phone || !password) {
        errorEl.innerText = 'Please fill all fields';
        return;
    }

    try {
        const res = await fetch('/api/signup-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (res.ok) {
            signupData = { name, phone, password };
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('otp-form').style.display = 'block';
            errorEl.innerText = '';
        } else {
            errorEl.innerText = data.error || 'Signup request failed';
        }
    } catch (err) {
        errorEl.innerText = 'Connection error';
    }
};

document.getElementById('verify-otp').onclick = async () => {
    const otp = document.getElementById('otp-code').value;
    const errorEl = document.getElementById('auth-error');

    if (!otp || otp.length !== 4) {
        errorEl.innerText = 'Enter 4-digit code';
        return;
    }

    try {
        const res = await fetch('/api/signup-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...signupData, otp })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('bingo_token', data.token);
            updateUserData(data);
            document.getElementById('auth-screen').classList.remove('active');
            document.getElementById('main-content').style.display = 'block';
            document.getElementById('selection-screen').classList.add('active');
        } else {
            errorEl.innerText = data.error || 'Verification failed';
        }
    } catch (err) {
        errorEl.innerText = 'Connection error';
    }
};

let userBalance = 0;

function updateUserData(user) {
    userBalance = parseFloat(user.balance) || 0;
    const usernameEls = [
        document.getElementById('username'), 
        document.getElementById('sel-username'),
        document.getElementById('stake-username')
    ];
    const balanceEl = document.getElementById('sel-balance');
    
    usernameEls.forEach(el => { if(el) el.innerText = user.name || user.username; });
    if(balanceEl) balanceEl.innerText = userBalance;

    // Show Admin Panel if user is admin
    const adminMenuItem = document.getElementById('admin-menu-item');
    if (adminMenuItem) {
        if (user.role === 'admin' || user.username === '0980682889') { // Assuming this phone is admin for now
            adminMenuItem.style.display = 'flex';
        } else {
            adminMenuItem.style.display = 'none';
        }
    }
}

// Sidebar Logic
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('menu-overlay');
const openMenuBtns = ['open-menu-stake', 'open-menu-selection', 'open-menu-game'];
const closeMenuBtn = document.getElementById('close-menu');

function toggleMenu() {
    sideMenu.classList.toggle('active');
    menuOverlay.classList.toggle('active');
}

openMenuBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = toggleMenu;
});

if (closeMenuBtn) closeMenuBtn.onclick = toggleMenu;
if (menuOverlay) menuOverlay.onclick = toggleMenu;

window.navTo = (target) => {
    console.log(`Navigating to: ${target}`);
    // Update active state in UI
    document.querySelectorAll('.menu-item').forEach(el => {
        el.classList.remove('active');
        if (el.innerText.toLowerCase().includes(target)) el.classList.add('active');
    });
    
    // Logic for actual navigation
    if (target === 'stake') {
        document.getElementById('selection-screen').classList.remove('active');
        document.getElementById('stake-screen').classList.add('active');
    }
    toggleMenu();
};

window.logout = () => {
    localStorage.removeItem('bingo_token');
    location.reload();
};

createBingoNumbers();
loadCards();
createStakeList();

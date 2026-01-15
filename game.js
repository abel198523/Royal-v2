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
    const timerLargeEl = document.getElementById('selection-timer-large');
    const stakeTimerEl = document.getElementById('stake-selection-timer');
    
    // Also update the legend timer if it exists (the one near Available 100)
    const legendTimerEl = document.querySelector('.timer-badge span');
    
    // Ensure we handle 'PLAYING' status
    const timeStr = seconds === 'PLAYING' ? 'በጨዋታ ላይ' : seconds;
    const timeStrWithEmoji = seconds === 'PLAYING' ? '🎮 በጨዋታ ላይ' : `⏰ ${seconds}`;
    
    if (timerEl) {
        timerEl.innerText = timeStrWithEmoji;
    }
    if (timerLargeEl) {
        timerLargeEl.innerText = timeStr;
    }
    if (stakeTimerEl) stakeTimerEl.innerText = timeStrWithEmoji;
    if (legendTimerEl) legendTimerEl.innerText = timeStr;
}

// Load cards from cards.json
async function loadCards() {
    try {
        const response = await fetch('cards.json');
        if (!response.ok) throw new Error('Failed to load cards.json');
        staticCards = await response.json();
        console.log(`Loaded ${staticCards.length} cards strictly from cards.json`);
        createAvailableCards();
    } catch (err) {
        console.error('CRITICAL: Error loading static cards.json:', err);
        // We no longer fallback to generating random cards.
        // If it fails, we show an error in the grid.
        const cardsGrid = document.getElementById('cards-grid');
        if (cardsGrid) {
            cardsGrid.innerHTML = '<div class="error-msg">ካርዶችን መጫን አልተቻለም። እባክዎ ገጹን ያድሱ።</div>';
        }
    }
}

// Global variables
let staticCards = [];
let myGameCard = null;
let currentSelectedCard = null;
let currentCardData = null;

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT') {
        currentRoom = data.room;
        roomTakenCards = data.takenCards || [];
        updateGameUI(data.history);
        if (data.isGameRunning) {
            updateCountdown('PLAYING');
        } else {
            updateCountdown(data.countdown);
        }
        createAvailableCards();
    } else if (data.type === 'NEW_BALL') {
        if (data.room === currentRoom) updateGameUI(data.history);
    } else if (data.type === 'COUNTDOWN') {
        if (data.room === currentRoom) {
            updateCountdown(data.value);
            if (data.value <= 0) {
                startGame();
            }
        }
    } else if (data.type === 'GAME_START') {
        if (data.room === currentRoom) startGame();
    } else if (data.type === 'ROOM_STATS') {
        if (data.takenCards && data.takenCards[currentRoom]) {
            roomTakenCards = data.takenCards[currentRoom];
            createAvailableCards();
        }
        updateRoomStats(data.stats, data.timers);
        
        // Also update the selection timer from ROOM_STATS if we're in a room
        if (currentRoom && data.timers[currentRoom] !== undefined) {
            updateCountdown(data.timers[currentRoom]);
        }
    }
};

function startGame() {
    // Hide all other screens
    const screens = ['selection-screen', 'stake-screen', 'profile-screen', 'wallet-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });
    
    // Show game screen
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) gameScreen.classList.add('active');
    
    // Render the selected card on the board
    renderMyGameCard();
    
    console.log('Game started, showing game board with player card');
}

function getBallLetter(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
}

let autoMarking = true;

const autoToggle = document.getElementById('auto-toggle');
if (autoToggle) {
    autoToggle.classList.add('active'); // Default to ON
    autoToggle.onclick = () => {
        autoMarking = !autoMarking;
        autoToggle.classList.toggle('active', autoMarking);
        console.log(`Auto-marking: ${autoMarking ? 'ON' : 'OFF'}`);
    };
}

function renderMyGameCard() {
    const bingoBoard = document.getElementById('bingo-board');
    if (!bingoBoard || !myGameCard) return;

    bingoBoard.innerHTML = '';
    
    // Middle spot is FREE
    const cardData = JSON.parse(JSON.stringify(myGameCard));
    cardData['N'][2] = 'FREE';

    const letters = ['B', 'I', 'N', 'G', 'O'];
    for (let row = 0; row < 5; row++) {
        letters.forEach(l => {
            const val = cardData[l][row];
            const cell = document.createElement('div');
            cell.className = 'bingo-cell';
            if (val === 'FREE') {
                cell.classList.add('free-spot', 'called');
                cell.innerText = 'FREE';
            } else {
                cell.id = `cell-${val}`;
                cell.innerText = val;
                
                // Add click event for manual marking
                cell.onclick = () => {
                    if (!autoMarking) {
                        // Only allow manual marking if it was actually called
                        // We check the history stored in currentGameState (if we had it)
                        // For now, let's just allow toggling the 'called' class manually if auto is off
                        cell.classList.toggle('called');
                    }
                };
            }
            bingoBoard.appendChild(cell);
        });
    }
}

let lastHistory = [];

function updateGameUI(history) {
    lastHistory = history;
    if (history.length === 0) {
        activeBall.innerText = '--';
        recentBalls.innerHTML = '';
        if (myGameCard) renderMyGameCard();
        return;
    }
    
    const lastBall = history[history.length - 1];
    const letter = getBallLetter(lastBall);
    activeBall.innerText = `${letter}${lastBall}`;
    activeBall.parentElement.style.borderColor = colors[letter];

    // Mark called numbers on the player's card ONLY IF AUTO IS ON
    if (autoMarking) {
        history.forEach((num, index) => {
            const el = document.getElementById(`cell-${num}`);
            if (el) {
                el.classList.add('called');
                if (index === history.length - 1) {
                    el.classList.add('last-called');
                } else {
                    el.classList.remove('last-called');
                }
            }
        });
    } else {
        // If auto is off, still update last-called highlight if the player already marked it
        document.querySelectorAll('.bingo-cell.last-called').forEach(el => el.classList.remove('last-called'));
        const el = document.getElementById(`cell-${lastBall}`);
        if (el && el.classList.contains('called')) {
            el.classList.add('last-called');
        }
    }

    // Update progress
    callCount.innerText = history.length;
    progressText.innerText = `${history.length}/75`;
    progressBar.style.width = `${(history.length / 75) * 100}%`;

    // Recent balls strip
    const recent = history.slice(-4, -1).reverse();
    recentBalls.innerHTML = recent.map(n => {
        const l = getBallLetter(n);
        return `<div class="hist-ball" style="background: ${colors[l]}">${l}${n}</div>`;
    }).join('');
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
    
    // Switch to selection screen (card board)
    const screens = ['stake-screen', 'profile-screen', 'wallet-screen'];
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });
    
    if (selectionScreen) selectionScreen.classList.add('active');
    
    // Ensure the main game layout is hidden while selecting cards
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.display = 'block';
    
    console.log(`Joined stake room: ${amount}, switched to card selection`);
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
    
    myGameCard = currentCardData; // Store the card for gameplay
    
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
        document.getElementById('stake-username'),
        document.getElementById('profile-username-top'),
        document.getElementById('profile-full-name')
    ];
    const balanceEl = document.getElementById('sel-balance');
    const walletBalanceEl = document.getElementById('wallet-balance-value');
    const profilePhoneEl = document.getElementById('profile-phone-number');
    
    usernameEls.forEach(el => { if(el) el.innerText = user.name || user.username; });
    if(balanceEl) balanceEl.innerText = userBalance;
    if(walletBalanceEl) walletBalanceEl.innerText = userBalance.toFixed(2);
    if(profilePhoneEl) profilePhoneEl.innerText = user.phone_number || user.username;

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
const openMenuBtns = ['open-menu-stake', 'open-menu-selection', 'open-menu-game', 'open-menu-profile', 'open-menu-wallet'];
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
    
    // Define all screen IDs
    const screens = ['stake-screen', 'selection-screen', 'profile-screen', 'wallet-screen'];
    
    // Hide all screens
    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });

    // Special case for deposit/withdraw (redirect to wallet for now)
    let finalTarget = target;
    if (target === 'deposit' || target === 'withdraw') {
        finalTarget = 'wallet';
    }

    // Show target screen
    const targetId = `${finalTarget}-screen`;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
        targetEl.classList.add('active');
    }

    // Update active state in UI
    document.querySelectorAll('.menu-item').forEach(el => {
        el.classList.remove('active');
        // Check if the link text or icon matches the target
        if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(`'${target}'`)) {
            el.classList.add('active');
        }
    });
    
    toggleMenu();
};

window.logout = () => {
    localStorage.removeItem('bingo_token');
    location.reload();
};

createBingoNumbers();
loadCards();
createStakeList();

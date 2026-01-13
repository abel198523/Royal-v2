const socket = new WebSocket(`ws://${window.location.host}`);
const bingoBoard = document.getElementById('bingo-board');
const activeBall = document.getElementById('active-ball');
const recentBalls = document.getElementById('recent-balls');
const callCount = document.getElementById('call-count');
const progressFill = document.getElementById('progress-fill');
const cardsGrid = document.getElementById('available-cards');

// 1. የቢንጎ ቁጥሮች ሰሌዳ (1-75)
function createBingoNumbers() {
    bingoBoard.innerHTML = '';
    for (let i = 1; i <= 75; i++) {
        const cell = document.createElement('div');
        cell.className = 'num-cell';
        cell.id = `num-${i}`;
        cell.innerText = i;
        bingoBoard.appendChild(cell);
    }
}

// 2. የካርድ መምረጫ (1-100)
function createAvailableCards() {
    cardsGrid.innerHTML = '';
    for (let i = 1; i <= 100; i++) {
        const card = document.createElement('div');
        card.className = 'card-item';
        card.innerText = i;
        card.onclick = () => {
            document.querySelectorAll('.card-item').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            socket.send(JSON.stringify({ type: 'BUY_CARD', cardNumber: i }));
        };
        cardsGrid.appendChild(card);
    }
}

// 3. መረጃ ከሰርቨር ሲመጣ
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT' || data.type === 'NEW_BALL') {
        updateGameUI(data.history);
    }
};

function updateGameUI(history) {
    if (history.length === 0) return;
    
    const lastBall = history[history.length - 1];
    activeBall.innerText = lastBall;
    
    history.forEach(num => {
        const el = document.getElementById(`num-${num}`);
        if (el) el.classList.add('called');
    });

    const recent = history.slice(-4, -1).reverse();
    recentBalls.innerHTML = recent.map(n => `<span>${n}</span>`).join(' ');
    
    callCount.innerText = history.length;
    progressFill.style.width = `${(history.length / 75) * 100}%`;
}

// ማስጀመሪያ
createBingoNumbers();
createAvailableCards();
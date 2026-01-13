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

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT' || data.type === 'NEW_BALL') {
        updateGameUI(data.history);
    }
};

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

function createAvailableCards() {
    cardsGrid.innerHTML = '';
    const takenCards = [14, 38]; // Mock data matching screenshot
    for (let i = 1; i <= 100; i++) {
        const card = document.createElement('div');
        card.className = 'card-item';
        if (takenCards.includes(i)) card.classList.add('taken');
        card.innerText = i;
        card.onclick = () => {
            if (card.classList.contains('taken')) return;
            document.querySelectorAll('.card-item').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            socket.send(JSON.stringify({ type: 'BUY_CARD', cardNumber: i }));
        };
        cardsGrid.appendChild(card);
    }
}

createBingoNumbers();
createAvailableCards();

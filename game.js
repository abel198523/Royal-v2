const socket = new WebSocket(`ws://${window.location.host}`);
const bingoBoard = document.getElementById('bingo-board');
const activeBall = document.getElementById('active-ball');
const recentBalls = document.getElementById('recent-balls');
const callCount = document.getElementById('call-count');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// Create the 75 number grid
function createBingoNumbers() {
    bingoBoard.innerHTML = '';
    for (let i = 1; i <= 75; i++) {
        const cell = document.createElement('div');
        cell.className = 'bingo-cell';
        cell.id = `num-${i}`;
        cell.innerText = i;
        bingoBoard.appendChild(cell);
    }
}

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'INIT' || data.type === 'NEW_BALL') {
        updateGameUI(data.history);
    }
};

function updateGameUI(history) {
    if (history.length === 0) {
        activeBall.innerText = '--';
        recentBalls.innerHTML = '';
        return;
    }
    
    const lastBall = history[history.length - 1];
    let letter = '';
    if (lastBall <= 15) letter = 'B';
    else if (lastBall <= 30) letter = 'I';
    else if (lastBall <= 45) letter = 'N';
    else if (lastBall <= 60) letter = 'G';
    else letter = 'O';

    activeBall.innerText = `${letter} ${lastBall}`;
    
    // Clear previous called states
    document.querySelectorAll('.bingo-cell').forEach(cell => cell.classList.remove('called'));

    history.forEach(num => {
        const el = document.getElementById(`num-${num}`);
        if (el) el.classList.add('called');
    });

    const recent = history.slice(-4, -1).reverse();
    recentBalls.innerHTML = recent.map(n => `<div class="history-ball">${n}</div>`).join('');
    
    callCount.innerText = history.length;
    progressText.innerText = `${history.length}/75`;
    progressBar.style.width = `${(history.length / 75) * 100}%`;
}

createBingoNumbers();

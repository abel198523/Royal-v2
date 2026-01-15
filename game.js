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

// 100 static bingo cards embedded directly for production stability
const staticCards = [{"id":1,"data":{"B":[7,10,13,14,15],"I":[18,21,23,29,30],"N":[35,36,"FREE",40,43],"G":[46,47,48,49,56],"O":[65,67,69,70,75]}},{"id":2,"data":{"B":[2,7,11,14,15],"I":[16,18,20,21,25],"N":[31,32,"FREE",39,43],"G":[50,53,56,58,60],"O":[63,66,72,73,74]}},{"id":3,"data":{"B":[2,4,12,13,14],"I":[16,22,24,29,30],"N":[32,33,"FREE",44,45],"G":[47,52,56,59,60],"O":[61,62,64,66,68]}},{"id":4,"data":{"B":[3,6,7,10,13],"I":[16,21,24,26,30],"N":[32,33,"FREE",36,41],"G":[46,48,52,54,59],"O":[63,65,66,72,75]}},{"id":5,"data":{"B":[1,4,7,12,15],"I":[17,19,26,29,30],"N":[31,32,"FREE",36,37],"G":[46,51,52,54,58],"O":[64,68,71,73,74]}},{"id":6,"data":{"B":[3,4,5,6,10],"I":[18,20,25,26,27],"N":[32,34,"FREE",41,45],"G":[48,50,51,53,54],"O":[62,63,65,67,75]}},{"id":7,"data":{"B":[1,2,4,5,6],"I":[17,21,24,27,30],"N":[31,33,"FREE",42,45],"G":[48,49,50,56,57],"O":[67,68,71,73,74]}},{"id":8,"data":{"B":[1,6,7,9,12],"I":[17,19,21,27,28],"N":[31,40,"FREE",42,43],"G":[47,49,50,51,57],"O":[64,65,66,70,74]}},{"id":9,"data":{"B":[3,6,9,12,14],"I":[16,17,20,22,27],"N":[31,37,"FREE",39,40],"G":[49,54,55,57,59],"O":[63,67,69,70,74]}},{"id":10,"data":{"B":[1,5,9,10,15],"I":[23,24,27,29,30],"N":[35,39,"FREE",43,45],"G":[47,52,56,58,59],"O":[62,63,64,67,71]}},{"id":11,"data":{"B":[1,2,6,12,14],"I":[16,18,21,28,30],"N":[31,37,"FREE",41,45],"G":[46,52,54,55,56],"O":[63,68,71,72,73]}},{"id":12,"data":{"B":[1,6,7,12,14],"I":[16,17,18,21,29],"N":[31,33,"FREE",43,45],"G":[46,54,55,56,59],"O":[62,63,65,69,70]}},{"id":13,"data":{"B":[1,6,8,11,15],"I":[16,19,20,22,30],"N":[35,38,"FREE",41,42],"G":[48,51,53,56,58],"O":[68,69,70,73,75]}},{"id":14,"data":{"B":[2,9,11,14,15],"I":[16,21,22,25,29],"N":[35,38,"FREE",41,45],"G":[46,51,52,54,57],"O":[66,67,69,72,75]}},{"id":15,"data":{"B":[5,7,11,12,14],"I":[18,19,22,25,26],"N":[33,41,"FREE",44,45],"G":[46,51,53,54,55],"O":[63,67,70,73,74]}},{"id":16,"data":{"B":[1,7,8,14,15],"I":[17,19,25,27,30],"N":[32,37,"FREE",42,44],"G":[50,52,55,56,58],"O":[61,66,67,69,75]}},{"id":17,"data":{"B":[3,4,5,14,15],"I":[19,21,23,28,29],"N":[31,33,"FREE",42,43],"G":[46,47,50,58,59],"O":[67,62,69,70,73]}},{"id":18,"data":{"B":[1,7,8,10,12],"I":[19,20,21,23,25],"N":[34,36,"FREE",41,44],"G":[46,50,51,54,57],"O":[61,72,73,74,75]}},{"id":19,"data":{"B":[2,5,6,12,15],"I":[19,22,28,29,30],"N":[31,32,"FREE",44,45],"G":[47,48,50,51,53],"O":[62,66,67,68,75]}},{"id":20,"data":{"B":[3,5,7,10,15],"I":[16,19,20,24,25],"N":[31,32,"FREE",35,44],"G":[46,48,51,56,59],"O":[62,65,66,72,73]}},{"id":21,"data":{"B":[4,6,9,12,15],"I":[16,18,21,28,29],"N":[31,34,"FREE",43,44],"G":[47,49,52,54,58],"O":[62,63,66,67,74]}},{"id":22,"data":{"B":[1,2,6,10,14],"I":[16,18,22,29,30],"N":[36,37,"FREE",42,43],"G":[46,51,53,54,59],"O":[61,62,63,69,72]}},{"id":23,"data":{"B":[3,8,10,12,13],"I":[16,17,25,27,30],"N":[32,41,"FREE",44,45],"G":[46,47,56,57,59],"O":[61,62,71,74,75]}},{"id":24,"data":{"B":[3,6,8,10,13],"I":[18,20,23,29,30],"N":[31,32,"FREE",38,41],"G":[48,54,56,57,60],"O":[62,63,69,70,75]}},{"id":25,"data":{"B":[5,7,11,13,15],"I":[16,18,20,21,26],"N":[31,32,"FREE",40,45],"G":[48,50,53,58,60],"O":[66,67,70,71,73]}},{"id":26,"data":{"B":[2,7,8,11,15],"I":[19,21,22,27,29],"N":[31,39,"FREE",42,44],"G":[46,47,54,57,59],"O":[62,64,68,70,74]}},{"id":27,"data":{"B":[1,2,5,7,8],"I":[16,18,21,22,29],"N":[31,33,"FREE",39,41],"G":[53,54,55,59,60],"O":[64,65,69,70,71]}},{"id":28,"data":{"B":[3,5,6,9,12],"I":[17,19,23,26,29],"N":[31,32,"FREE",34,44],"G":[47,48,53,54,56],"O":[61,63,65,69,71]}},{"id":29,"data":{"B":[1,6,9,12,15],"I":[17,21,23,26,27],"N":[31,32,"FREE",34,45],"G":[46,48,49,54,58],"O":[62,63,65,71,72]}},{"id":30,"data":{"B":[5,10,11,12,13],"I":[16,17,22,25,27],"N":[32,35,"FREE",39,44],"G":[46,47,51,55,60],"O":[61,63,65,71,75]}},{"id":31,"data":{"B":[1,6,10,12,13],"I":[20,22,23,24,25],"N":[31,32,"FREE",36,44],"G":[47,50,53,55,60],"O":[62,64,67,69,72]}},{"id":32,"data":{"B":[2,5,8,11,15],"I":[17,19,24,26,30],"N":[31,35,"FREE",38,41],"G":[47,52,54,58,60],"O":[61,64,65,68,73]}},{"id":33,"data":{"B":[3,4,10,12,15],"I":[17,19,22,25,26],"N":[34,36,"FREE",40,43],"G":[48,53,55,56,58],"O":[62,64,67,69,75]}},{"id":34,"data":{"B":[4,6,7,9,11],"I":[17,21,22,28,30],"N":[31,33,"FREE",35,42],"G":[46,47,51,57,58],"O":[61,62,64,67,73]}},{"id":35,"data":{"B":[1,2,5,10,12],"I":[16,21,24,25,30],"N":[31,32,"FREE",39,41],"G":[46,50,51,57,60],"O":[62,64,66,72,74]}},{"id":36,"data":{"B":[1,3,6,13,14],"I":[18,19,23,25,26],"N":[31,34,"FREE",38,40],"G":[46,50,54,57,59],"O":[63,65,66,69,72]}},{"id":37,"data":{"B":[4,7,9,11,15],"I":[16,22,23,24,25],"N":[32,35,"FREE",39,41],"G":[46,47,50,55,56],"O":[62,64,68,72,74]}},{"id":38,"data":{"B":[1,2,5,7,12],"I":[16,21,23,24,30],"N":[33,35,"FREE",37,45],"G":[48,52,55,58,59],"O":[61,65,66,67,75]}},{"id":39,"data":{"B":[2,3,6,10,15],"I":[16,18,22,24,30],"N":[31,32,"FREE",35,42],"G":[46,51,56,57,59],"O":[62,64,67,70,73]}},{"id":40,"data":{"B":[1,6,8,10,13],"I":[19,22,23,26,27],"N":[31,34,"FREE",38,40],"G":[49,51,54,55,59],"O":[63,65,66,67,72]}},{"id":41,"data":{"B":[2,7,11,14,15],"I":[16,18,20,21,25],"N":[31,32,"FREE",39,43],"G":[50,53,56,58,60],"O":[63,66,72,73,74]}},{"id":42,"data":{"B":[2,4,12,13,14],"I":[16,22,24,29,30],"N":[32,33,"FREE",44,45],"G":[47,52,56,59,60],"O":[61,62,64,66,68]}},{"id":43,"data":{"B":[3,6,7,10,13],"I":[16,21,24,26,30],"N":[32,33,"FREE",36,41],"G":[46,48,52,54,59],"O":[63,65,66,72,75]}},{"id":44,"data":{"B":[1,4,7,12,15],"I":[17,19,26,29,30],"N":[31,32,"FREE",36,37],"G":[46,51,52,54,58],"O":[64,68,71,73,74]}},{"id":45,"data":{"B":[3,4,5,6,10],"I":[18,20,25,26,27],"N":[32,34,"FREE",41,45],"G":[48,50,51,53,54],"O":[62,63,65,67,75]}},{"id":46,"data":{"B":[1,2,4,5,6],"I":[17,21,24,27,30],"N":[31,33,"FREE",42,45],"G":[48,49,50,56,57],"O":[67,68,71,73,74]}},{"id":47,"data":{"B":[1,6,7,9,12],"I":[17,19,21,27,28],"N":[31,40,"FREE",42,43],"G":[47,49,50,51,57],"O":[64,65,66,70,74]}},{"id":48,"data":{"B":[3,6,9,12,14],"I":[16,17,20,22,27],"N":[31,37,"FREE",39,40],"G":[49,54,55,57,59],"O":[63,67,69,70,74]}},{"id":49,"data":{"B":[1,5,9,10,15],"I":[23,24,27,29,30],"N":[35,39,"FREE",43,45],"G":[47,52,56,58,59],"O":[62,63,64,67,71]}},{"id":50,"data":{"B":[1,2,6,12,14],"I":[16,18,21,28,30],"N":[31,37,"FREE",41,45],"G":[46,52,54,55,56],"O":[63,68,71,72,73]}},{"id":51,"data":{"B":[1,6,7,12,14],"I":[16,17,18,21,29],"N":[31,33,"FREE",43,45],"G":[46,54,55,56,59],"O":[62,63,65,69,70]}},{"id":52,"data":{"B":[1,6,8,11,15],"I":[16,19,20,22,30],"N":[35,38,"FREE",41,42],"G":[48,51,53,56,58],"O":[68,69,70,73,75]}},{"id":53,"data":{"B":[2,9,11,14,15],"I":[16,21,22,25,29],"N":[35,38,"FREE",41,45],"G":[46,51,52,54,57],"O":[66,67,69,72,75]}},{"id":54,"data":{"B":[5,7,11,12,14],"I":[18,19,22,25,26],"N":[33,41,"FREE",44,45],"G":[46,51,53,54,55],"O":[63,67,70,73,74]}},{"id":55,"data":{"B":[1,7,8,14,15],"I":[17,19,25,27,30],"N":[32,37,"FREE",42,44],"G":[50,52,55,56,58],"O":[61,66,67,69,75]}},{"id":56,"data":{"B":[3,4,5,14,15],"I":[19,21,23,28,29],"N":[31,33,"FREE",42,43],"G":[46,47,50,58,59],"O":[67,62,69,70,73]}},{"id":57,"data":{"B":[1,7,8,10,12],"I":[19,20,21,23,25],"N":[34,36,"FREE",41,44],"G":[46,50,51,54,57],"O":[61,72,73,74,75]}},{"id":58,"data":{"B":[2,5,6,12,15],"I":[19,22,28,29,30],"N":[31,32,"FREE",44,45],"G":[47,48,50,51,53],"O":[62,66,67,68,75]}},{"id":59,"data":{"B":[3,5,7,10,15],"I":[16,19,20,24,25],"N":[31,32,"FREE",35,44],"G":[46,48,51,56,59],"O":[62,65,66,72,73]}},{"id":60,"data":{"B":[4,6,9,12,15],"I":[16,18,21,28,29],"N":[31,34,"FREE",43,44],"G":[47,49,52,54,58],"O":[62,63,66,67,74]}},{"id":61,"data":{"B":[1,2,6,10,14],"I":[16,18,22,29,30],"N":[36,37,"FREE",42,43],"G":[46,51,53,54,59],"O":[61,62,63,69,72]}},{"id":62,"data":{"B":[3,8,10,12,13],"I":[16,17,25,27,30],"N":[32,41,"FREE",44,45],"G":[46,47,56,57,59],"O":[61,62,71,74,75]}},{"id":63,"data":{"B":[3,6,8,10,13],"I":[18,20,23,29,30],"N":[31,32,"FREE",38,41],"G":[48,54,56,57,60],"O":[62,63,69,70,75]}},{"id":64,"data":{"B":[5,7,11,13,15],"I":[16,18,20,21,26],"N":[31,32,"FREE",40,45],"G":[48,50,53,58,60],"O":[66,67,70,71,73]}},{"id":65,"data":{"B":[2,7,8,11,15],"I":[19,21,22,27,29],"N":[31,39,"FREE",42,44],"G":[46,47,54,57,59],"O":[62,64,68,70,74]}},{"id":66,"data":{"B":[1,2,5,7,8],"I":[16,18,21,22,29],"N":[31,33,"FREE",39,41],"G":[53,54,55,59,60],"O":[64,65,69,70,71]}},{"id":67,"data":{"B":[3,5,6,9,12],"I":[17,19,23,26,29],"N":[31,32,"FREE",34,44],"G":[47,48,53,54,56],"O":[61,63,65,69,71]}},{"id":68,"data":{"B":[1,6,9,12,15],"I":[17,21,23,26,27],"N":[31,32,"FREE",34,45],"G":[46,48,49,54,58],"O":[62,63,65,71,72]}},{"id":69,"data":{"B":[5,10,11,12,13],"I":[16,17,22,25,27],"N":[32,35,"FREE",39,44],"G":[46,47,51,55,60],"O":[61,63,65,71,75]}},{"id":70,"data":{"B":[1,6,10,12,13],"I":[20,22,23,24,25],"N":[31,32,"FREE",36,44],"G":[47,50,53,55,60],"O":[62,64,67,69,72]}},{"id":71,"data":{"B":[2,5,8,11,15],"I":[17,19,24,26,30],"N":[31,35,"FREE",38,41],"G":[47,52,54,58,60],"O":[61,64,65,68,73]}},{"id":72,"data":{"B":[3,4,10,12,15],"I":[17,19,22,25,26],"N":[34,36,"FREE",40,43],"G":[48,53,55,56,58],"O":[62,64,67,69,75]}},{"id":73,"data":{"B":[4,6,7,9,11],"I":[17,21,22,28,30],"N":[31,33,"FREE",35,42],"G":[46,47,51,57,58],"O":[61,62,64,67,73]}},{"id":74,"data":{"B":[1,2,5,10,12],"I":[16,21,24,25,30],"N":[31,32,"FREE",39,41],"G":[46,50,51,57,60],"O":[62,64,66,72,74]}},{"id":75,"data":{"B":[1,3,6,13,14],"I":[18,19,23,25,26],"N":[31,34,"FREE",38,40],"G":[46,50,54,57,59],"O":[63,65,66,69,72]}},{"id":76,"data":{"B":[4,7,9,11,15],"I":[16,22,23,24,25],"N":[32,35,"FREE",39,41],"G":[46,47,50,55,56],"O":[62,64,68,72,74]}},{"id":77,"data":{"B":[1,2,5,7,12],"I":[16,21,23,24,30],"N":[33,35,"FREE",37,45],"G":[48,52,55,58,59],"O":[61,65,66,67,75]}},{"id":78,"data":{"B":[2,3,6,10,15],"I":[16,18,22,24,30],"N":[31,32,"FREE",35,42],"G":[46,51,56,57,59],"O":[62,64,67,70,73]}},{"id":79,"data":{"B":[1,6,8,10,13],"I":[19,22,23,26,27],"N":[31,34,"FREE",38,40],"G":[49,51,54,55,59],"O":[63,65,66,67,72]}},{"id":80,"data":{"B":[1,3,6,10,12],"I":[16,18,20,24,25],"N":[31,32,"FREE",35,44],"G":[46,48,51,56,59],"O":[62,65,66,72,73]}},{"id":81,"data":{"B":[1,4,7,10,13],"I":[16,21,24,26,30],"N":[32,33,"FREE",36,41],"G":[46,48,52,54,59],"O":[63,65,66,72,75]}},{"id":82,"data":{"B":[2,5,8,11,14],"I":[17,19,23,26,30],"N":[31,32,"FREE",36,37],"G":[46,51,52,54,58],"O":[64,68,71,73,74]}},{"id":83,"data":{"B":[3,6,9,12,15],"I":[18,20,25,26,27],"N":[32,34,"FREE",41,45],"G":[48,50,51,53,54],"O":[62,63,65,67,75]}},{"id":84,"data":{"B":[4,7,10,13,1],"I":[19,21,27,28,30],"N":[31,33,"FREE",42,45],"G":[48,49,50,56,57],"O":[67,68,71,73,74]}},{"id":85,"data":{"B":[5,8,11,14,2],"I":[20,22,28,29,16],"N":[31,40,"FREE",42,43],"G":[47,49,50,51,57],"O":[64,65,66,70,74]}},{"id":86,"data":{"B":[6,9,12,15,3],"I":[21,23,29,30,17],"N":[31,37,"FREE",39,40],"G":[49,54,55,57,59],"O":[63,67,69,70,74]}},{"id":87,"data":{"B":[7,10,13,1,4],"I":[22,24,30,16,18],"N":[35,39,"FREE",43,45],"G":[47,52,56,58,59],"O":[62,63,64,67,71]}},{"id":88,"data":{"B":[8,11,14,2,5],"I":[23,25,16,17,19],"N":[31,37,"FREE",41,45],"G":[46,52,54,55,56],"O":[63,68,71,72,73]}},{"id":89,"data":{"B":[9,12,15,3,6],"I":[24,26,17,18,20],"N":[31,33,"FREE",43,45],"G":[46,54,55,56,59],"O":[62,63,65,69,70]}},{"id":90,"data":{"B":[10,13,1,4,7],"I":[25,27,18,19,21],"N":[35,38,"FREE",41,42],"G":[48,51,53,56,58],"O":[68,69,70,73,75]}},{"id":91,"data":{"B":[11,14,2,5,8],"I":[26,28,19,20,22],"N":[35,38,"FREE",41,45],"G":[46,51,52,54,57],"O":[66,67,69,72,75]}},{"id":92,"data":{"B":[12,15,3,6,9],"I":[27,29,20,21,23],"N":[33,41,"FREE",44,45],"G":[46,51,53,54,55],"O":[63,67,70,73,74]}},{"id":93,"data":{"B":[13,1,4,7,10],"I":[28,30,21,22,24],"N":[32,37,"FREE",42,44],"G":[50,52,55,56,58],"O":[61,66,67,69,75]}},{"id":94,"data":{"B":[14,2,5,8,11],"I":[29,16,22,23,25],"N":[31,33,"FREE",42,43],"G":[46,47,50,58,59],"O":[67,62,69,70,73]}},{"id":95,"data":{"B":[15,3,6,9,12],"I":[30,17,23,24,26],"N":[34,36,"FREE",41,44],"G":[46,50,51,54,57],"O":[61,72,73,74,75]}},{"id":96,"data":{"B":[1,4,7,10,13],"I":[16,18,24,25,27],"N":[31,32,"FREE",44,45],"G":[47,48,50,51,53],"O":[62,66,67,68,75]}},{"id":97,"data":{"B":[2,5,8,11,14],"I":[17,19,25,26,28],"N":[31,32,"FREE",35,44],"G":[46,48,51,56,59],"O":[62,65,66,72,73]}},{"id":98,"data":{"B":[3,6,9,12,15],"I":[18,20,26,27,29],"N":[31,34,"FREE",43,44],"G":[47,49,52,54,58],"O":[62,63,66,67,74]}},{"id":99,"data":{"B":[4,7,10,13,1],"I":[19,21,27,28,30],"N":[36,37,"FREE",42,43],"G":[46,51,53,54,59],"O":[61,62,63,69,72]}},{"id":100,"data":{"B":[5,8,11,14,2],"I":[20,22,28,29,16],"N":[32,41,"FREE",44,45],"G":[46,47,56,57,59],"O":[61,62,71,74,75]}}];

// Helper to get card data by ID from the embedded list
function getCardById(id) {
    const found = staticCards.find(c => c.id === id);
    if (found) return found.data;
    return staticCards[0].data; // Fallback
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

function showCardPreview(num) {
    if (userBalance < currentRoom) {
        alert("በቂ ባላንስ የልዎትም፤ እባክዎን ዲፖዚት ያድርጉ።");
        return;
    }
    currentSelectedCard = num;
    currentCardData = getCardById(num);
    
    previewCardNumber.innerText = `Card #${num}`;
    modalCardContent.innerHTML = '';
    modalCardContent.appendChild(createCardPreview(currentCardData));
    previewOverlay.classList.add('active');
}

// Remove the loadCards function call from bottom and replace with simple init
function initApp() {
    createBingoNumbers();
    createStakeList();
    createAvailableCards();
}

// Global variables
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
    const playerIdEl = document.getElementById('profile-player-id'); // We'll need to add this to HTML
    
    usernameEls.forEach(el => { if(el) el.innerText = user.name || user.username; });
    if(balanceEl) balanceEl.innerText = userBalance;
    if(walletBalanceEl) walletBalanceEl.innerText = userBalance.toFixed(2);
    if(profilePhoneEl) profilePhoneEl.innerText = user.phone_number || user.username;
    if(playerIdEl && user.player_id) playerIdEl.innerText = `ID: ${user.player_id}`;

    // Show Admin Panel if user is admin
    const adminMenuItem = document.getElementById('admin-menu-item');
    if (adminMenuItem) {
        // የፊት ለፊት ገጽታ ላይም በስልክ ቁጥሩ ብቻ እንዲታይ ማድረግ
        if (user.is_admin && (user.phone_number === '0980682889' || user.username === '0980682889')) {
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
createStakeList();
createAvailableCards();

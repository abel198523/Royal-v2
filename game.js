// 1. መሰረታዊ መረጃዎች
const STAKES = [5, 10, 20, 50, 100];
let currentUser = null;
let socket = null;

// 2. ሩሞችን በስክሪኑ ላይ የመሳል ስራ
function renderStakeRooms() {
    const listContainer = document.getElementById('stake-rooms-list');
    if (!listContainer) {
        console.error("ስህተት: 'stake-rooms-list' የሚለው ቦታ በ HTML ላይ አልተገኘም!");
        return;
    }

    listContainer.innerHTML = ''; // የቆየውን አጽዳ

    STAKES.forEach(amount => {
        const row = document.createElement('div');
        row.className = 'stake-card';
        row.style.background = "#2a2a2a";
        row.style.margin = "10px";
        row.style.padding = "15px";
        row.style.borderRadius = "10px";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.borderLeft = "5px solid #f59e0b";
        row.style.cursor = "pointer";
        
        row.onclick = () => selectStake(amount);
        
        row.innerHTML = `
            <div class="stake-info">
                <div style="font-weight: bold; color: white; font-size: 1.2rem;">${amount} ETB</div>
                <div style="color: #aaa; font-size: 0.9rem;" id="stake-count-${amount}">0 Players</div>
            </div>
            <div class="stake-action">
                <button style="background: #f59e0b; color: black; border: none; padding: 8px 15px; border-radius: 5px; font-weight: bold;">ቀላቀል</button>
            </div>
        `;
        listContainer.appendChild(row);
    });
}

// 3. ሩም ሲመረጥ የሚሆን ነገር
function selectStake(amount) {
    console.log("የተመረጠው ሩም: " + amount + " ETB");
    document.getElementById('stake-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    document.getElementById('bet-amount').innerText = amount;
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'JOIN_ROOM',
            room: amount,
            token: localStorage.getItem('token')
        }));
    }
}

// 4. ገጹ ሲከፈት በቅድሚያ የሚሰሩ ስራዎች
document.addEventListener('DOMContentLoaded', () => {
    renderStakeRooms();

    const loginBtn = document.getElementById('do-login');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const username = document.getElementById('login-telegram').value;
            const password = document.getElementById('login-pass').value;

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    currentUser = data;
                    document.getElementById('auth-screen').style.display = 'none';
                    document.getElementById('main-content').style.display = 'block';
                    document.getElementById('stake-username').innerText = data.username;
                    renderStakeRooms();
                    initWebSocket();
                } else {
                    alert(data.error || "Login failed");
                }
            } catch (err) {
                console.error(err);
                alert("Connection error");
            }
        });
    }
});

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
        console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'STATS_UPDATE') {
            Object.keys(data.rooms).forEach(room => {
                const countEl = document.getElementById(`stake-count-${room}`);
                if (countEl) {
                    countEl.innerText = `${data.rooms[room].playerCount} Players`;
                }
            });
        }
    };
}

function showAuth(type) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
}

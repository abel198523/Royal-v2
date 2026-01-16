require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const SECRET_KEY = "bingo_secret_123";
app.use(express.json());
app.use(express.static(__dirname));

const STAKES = [5, 10, 20, 30, 40, 50, 100, 200, 500];
let rooms = {};

STAKES.forEach(amount => {
    rooms[amount] = {
        stake: amount,
        balls: [],
        drawnBalls: [],
        gameInterval: null,
        gameCountdown: 30,
        countdownInterval: null,
        players: new Set()
    };
});

// --- AUTH API ---
let pendingOTP = {}; // Store temporary signup data

app.post('/api/signup-request', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "ስልክ ቁጥር ያስገቡ" });
    try {
        const existing = await db.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: "ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል" });
        }

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        pendingOTP[phone] = { otp, timestamp: Date.now() };
        
        console.log(`\n--- OTP VERIFICATION ---\nPhone: ${phone}\nCode: ${otp}\n------------------------\n`);
        
        res.json({ message: "OTP sent" });
    } catch (err) {
        console.error('Signup Request Error:', err);
        res.status(500).json({ error: "የሰርቨር ስህተት አጋጥሟል: " + err.message });
    }
});

app.post('/api/signup-verify', async (req, res) => {
    const { phone, password, name, otp } = req.body;
    try {
        const record = pendingOTP[phone];
        if (!record || record.otp !== otp) {
            return res.status(400).json({ error: "የተሳሳተ የኦቲፒ ኮድ" });
        }

        // Clean up OTP
        delete pendingOTP[phone];

        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (phone_number, password_hash, username, name, balance) VALUES ($1, $2, $3, $4, 100) RETURNING *',
            [phone, hash, phone, name]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, SECRET_KEY);
        res.json({ token, username: user.username, balance: user.balance, name: user.name, player_id: user.player_id, is_admin: user.is_admin });
    } catch (err) {
        res.status(500).json({ error: "ምዝገባው አልተሳካም" });
    }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
        if (result.rows.length === 0) return res.status(404).json({ error: "ተጠቃሚው አልተገኘም" });
        const isMatch = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!isMatch) return res.status(401).json({ error: "ስህተት" });
        
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, SECRET_KEY);
        res.json({ 
            token, 
            username: user.username, 
            balance: user.balance,
            name: user.name,
            player_id: user.player_id,
            is_admin: user.is_admin
        });
    } catch (err) { res.status(500).send(err); }
});

// Middleware to check if user is admin
const adminOnly = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "ያልተፈቀደ ሙከራ" });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // ጥብቅ ቁጥጥር፡ በስልክ ቁጥሩ ብቻ አድሚን መሆኑን ማረጋገጥ
        // 0980682889 በቋሚነት አድሚን ነው
        if (decoded.username === '0980682889' || (decoded.is_admin && decoded.username === '0980682889')) {
            req.user = decoded;
            next();
        } else {
            res.status(403).json({ error: "ይህ ገጽ ለአድሚን ብቻ የተፈቀደ ነው" });
        }
    } catch (err) {
        res.status(401).json({ error: "ትክክለኛ ያልሆነ ቶከን" });
    }
};

// Admin Route (Hidden)
app.get('/api/admin/user/:phone', adminOnly, async (req, res) => {
    const { phone } = req.params;
    try {
        const result = await db.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
        if (result.rows.length === 0) return res.status(404).json({ error: "ተጠቃሚው አልተገኘም" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "የሰርቨር ስህተት" });
    }
});

app.get('/api/admin/deposits', adminOnly, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT dr.*, u.phone_number, u.name 
            FROM deposit_requests dr 
            JOIN users u ON dr.user_id = u.id 
            WHERE dr.status = 'pending' 
            ORDER BY dr.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "መረጃውን ማምጣት አልተቻለም" });
    }
});

app.post('/api/admin/approve-deposit', adminOnly, async (req, res) => {
    const { depositId } = req.body;
    try {
        await db.query('BEGIN');
        const deposit = await db.query('SELECT * FROM deposit_requests WHERE id = $1', [depositId]);
        if (deposit.rows.length === 0) throw new Error("ጥያቄው አልተገኘም");
        
        const { user_id, amount } = deposit.rows[0];
        
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, user_id]);
        await db.query('UPDATE deposit_requests SET status = $1 WHERE id = $2', ['approved', depositId]);
        
        await db.query('COMMIT');
        res.json({ message: "ዲፖዚቱ በትክክል ተፈቅዷል" });
    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/reject-deposit', adminOnly, async (req, res) => {
    const { depositId } = req.body;
    try {
        const result = await db.query('UPDATE deposit_requests SET status = $1 WHERE id = $2 RETURNING *', ['rejected', depositId]);
        if (result.rows.length === 0) return res.status(404).json({ error: "ጥያቄው አልተገኘም" });
        res.json({ message: "ጥያቄው ውድቅ ተደርጓል" });
    } catch (err) {
        res.status(500).json({ error: "ውድቅ ማድረግ አልተቻለም" });
    }
});

app.post('/api/deposit-request', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Login required" });
    
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const { amount, method, code } = req.body;
        
        await db.query(
            'INSERT INTO deposit_requests (user_id, amount, method, transaction_code) VALUES ($1, $2, $3, $4)',
            [decoded.id, amount, method, code]
        );
        
        res.json({ message: "የዲፖዚት ጥያቄዎ ለአድሚን ተልኳል። እባክዎን ጥቂት ደቂቃዎችን ይጠብቁ።" });
    } catch (err) {
        res.status(500).json({ error: "ጥያቄውን መላክ አልተቻለም" });
    }
});

app.post('/api/admin/update-balance', adminOnly, async (req, res) => {
    const { phone, balance } = req.body;
    try {
        const result = await db.query(
            'UPDATE users SET balance = $1 WHERE phone_number = $2 RETURNING *',
            [balance, phone]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "ተጠቃሚው አልተገኘም" });
        res.json({ message: "ሂሳብ በትክክል ተስተካክሏል", user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "ማስተካከሉ አልተሳካም" });
    }
});

function startRoomCountdown(amount) {
    const room = rooms[amount];
    if (!room) return;
    
    room.gameCountdown = 30;
    if (room.countdownInterval) clearInterval(room.countdownInterval);
    
    room.countdownInterval = setInterval(() => {
        room.gameCountdown--;
        
        // Broadcast ONLY to clients in this specific room
        broadcastToRoom(amount, { 
            type: 'COUNTDOWN', 
            value: room.gameCountdown, 
            room: amount 
        });

        // Update global stats for all clients
        updateGlobalStats();

        if (room.gameCountdown <= 0) {
            clearInterval(room.countdownInterval);
            room.countdownInterval = null;
            
            // If there are players with cards, start the game
            const playersWithCards = Array.from(room.players).filter(p => p.cardNumber);
            if (playersWithCards.length > 0) {
                startRoomGame(amount);
            } else {
                // No players with cards, just restart countdown immediately
                startRoomCountdown(amount);
            }
        }
    }, 1000);
}

function startRoomGame(amount) {
    const room = rooms[amount];
    if (!room) return;
    
    room.balls = Array.from({length: 75}, (_, i) => i + 1);
    room.drawnBalls = [];
    
    broadcastToRoom(amount, { 
        type: 'GAME_START', 
        message: `${amount} ETB ጨዋታ ተጀምሯል!`, 
        room: amount 
    });

    updateGlobalStats();

    if (room.gameInterval) clearInterval(room.gameInterval);
    room.gameInterval = setInterval(() => {
        if (room.balls.length > 0) {
            const randomIndex = Math.floor(Math.random() * room.balls.length);
            const ball = room.balls.splice(randomIndex, 1)[0];
            room.drawnBalls.push(ball);
            
            // Log for debugging
            console.log(`Room ${amount}: Ball drawn ${ball}. History: ${room.drawnBalls.join(',')}`);

            broadcastToRoom(amount, { 
                type: 'NEW_BALL', 
                ball, 
                history: room.drawnBalls, 
                room: amount 
            });
        } else { 
            clearInterval(room.gameInterval);
            room.gameInterval = null;
            
            // Reset player card data after game ends
            room.players.forEach(p => {
                p.cardNumber = null;
                p.cardData = null;
            });
            
            updateGlobalStats();
            // Wait 5s then restart the continuous countdown
            setTimeout(() => startRoomCountdown(amount), 5000);
        }
    }, 3000);
}

function broadcastToRoom(amount, data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.room == amount) {
            client.send(JSON.stringify(data));
        }
    });
}

function broadcastAll(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function updateGlobalStats() {
    const stats = {};
    const timers = {};
    const takenCards = {};
    STAKES.forEach(amount => {
        if (rooms[amount]) {
            stats[amount] = rooms[amount].players.size;
            timers[amount] = rooms[amount].gameInterval ? 'PLAYING' : rooms[amount].gameCountdown;
            
            // Collect taken card numbers for this room
            const roomTaken = [];
            rooms[amount].players.forEach(p => {
                if (p.cardNumber) roomTaken.push(p.cardNumber);
            });
            takenCards[amount] = roomTaken;
        }
    });
    broadcastAll({ type: 'ROOM_STATS', stats, timers, takenCards });
}

function checkWin(cardData, drawnBalls) {
    if (!cardData) return null;
    const drawnSet = new Set(drawnBalls);
    drawnSet.add('FREE');

    const letters = ['B', 'I', 'N', 'G', 'O'];
    const grid = letters.map(l => cardData[l]);

    // Check Rows
    for (let r = 0; r < 5; r++) {
        let win = true;
        let pattern = [];
        for (let c = 0; c < 5; c++) {
            pattern.push(grid[c][r]);
            if (!drawnSet.has(grid[c][r])) { win = false; break; }
        }
        if (win) return { type: 'ROW', pattern };
    }

    // Check Columns
    for (let c = 0; c < 5; c++) {
        let win = true;
        let pattern = [];
        for (let r = 0; r < 5; r++) {
            pattern.push(grid[c][r]);
            if (!drawnSet.has(grid[c][r])) { win = false; break; }
        }
        if (win) return { type: 'COLUMN', pattern };
    }

    // Check Diagonals
    let diag1 = true;
    let diag1Pattern = [];
    let diag2 = true;
    let diag2Pattern = [];
    for (let i = 0; i < 5; i++) {
        diag1Pattern.push(grid[i][i]);
        if (!drawnSet.has(grid[i][i])) diag1 = false;
        
        diag2Pattern.push(grid[i][4 - i]);
        if (!drawnSet.has(grid[i][4 - i])) diag2 = false;
    }
    if (diag1) return { type: 'DIAGONAL', pattern: diag1Pattern };
    if (diag2) return { type: 'DIAGONAL', pattern: diag2Pattern };

    // Check Corners
    if (drawnSet.has(grid[0][0]) && drawnSet.has(grid[4][0]) && 
        drawnSet.has(grid[0][4]) && drawnSet.has(grid[4][4])) {
        return { type: 'CORNERS', pattern: [grid[0][0], grid[4][0], grid[0][4], grid[4][4]] };
    }

    return null;
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'BINGO_CLAIM') {
            const room = rooms[data.room];
            if (!room || !room.gameInterval) return;

            // Find the player who claimed in THIS room
            let playerWs = null;
            room.players.forEach(p => {
                // Check room-specific card data
                const roomData = p.roomData ? p.roomData[data.room] : null;
                const cardNumber = roomData ? roomData.cardNumber : p.cardNumber;
                if (cardNumber === data.cardNumber) playerWs = p;
            });

            if (playerWs) {
                const roomData = playerWs.roomData ? playerWs.roomData[data.room] : null;
                const cardData = roomData ? roomData.cardData : playerWs.cardData;

                if (cardData) {
                    const winInfo = checkWin(cardData, room.drawnBalls);
                    if (winInfo) {
                        // Winner found! Stop the game and broadcast
                        clearInterval(room.gameInterval);
                        room.gameInterval = null;

                        broadcastToRoom(data.room, {
                            type: 'GAME_OVER',
                            winner: playerWs.name || playerWs.username || 'ተጫዋች',
                            message: `🎉 ቢንጎ! ${playerWs.name || playerWs.username} አሸንፏል!`,
                            winCard: cardData,
                            winPattern: winInfo.pattern,
                            room: data.room
                        });

                        // Reset for next game in THIS room
                        room.players.forEach(p => {
                            if (p.roomData) delete p.roomData[data.room];
                            p.cardNumber = null;
                            p.cardData = null;
                        });
                        
                        updateGlobalStats();
                        setTimeout(() => startRoomCountdown(data.room), 5000);
                    } else {
                        ws.send(JSON.stringify({ type: 'ERROR', message: 'ቢንጎ ገና አልሞላም!' }));
                    }
                }
            }
        }
        if (data.type === 'JOIN_ROOM') {
            // Remove from old room if any
            if (ws.room && rooms[ws.room]) {
                rooms[ws.room].players.delete(ws);
            }
            
            ws.room = data.room;
            const room = rooms[ws.room];
            if (room) {
                room.players.add(ws);
                // Also get taken cards for this specific room
                const roomTaken = [];
                room.players.forEach(p => {
                    if (p.cardNumber) roomTaken.push(p.cardNumber);
                });
                
                ws.send(JSON.stringify({ 
                    type: 'INIT', 
                    history: room.drawnBalls,
                    countdown: room.gameCountdown,
                    room: ws.room,
                    takenCards: roomTaken,
                    isGameRunning: room.gameInterval !== null
                }));
                updateGlobalStats();
            }
        }
        
        if (data.type === 'BUY_CARD') {
            if (!ws.room) return;
            // Store card data per room on the connection object
            if (!ws.roomData) ws.roomData = {};
            ws.roomData[data.room] = {
                cardNumber: data.cardNumber,
                cardData: data.cardData
            };
            
            // For backward compatibility or single-room focus
            ws.cardNumber = data.cardNumber;
            ws.cardData = data.cardData;
            
            console.log(`Room ${ws.room}: Card ${data.cardNumber} bought`);
            updateGlobalStats();
        }
    });

    ws.on('close', () => {
        if (ws.room && rooms[ws.room]) {
            rooms[ws.room].players.delete(ws);
            updateGlobalStats();
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    STAKES.forEach(amount => {
        startRoomCountdown(amount);
    });
});
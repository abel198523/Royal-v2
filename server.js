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
    startRoomCountdown(amount);
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
            'INSERT INTO users (phone_number, password_hash, username, name, balance) VALUES ($1, $2, $3, $4, 0) RETURNING *',
            [phone, hash, phone, name]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);
        res.json({ token, username: user.username, balance: user.balance, name: user.name });
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
        
        const token = jwt.sign({ id: result.rows[0].id, username: result.rows[0].username }, SECRET_KEY);
        res.json({ 
            token, 
            username: result.rows[0].username, 
            balance: result.rows[0].balance,
            name: result.rows[0].name 
        });
    } catch (err) { res.status(500).send(err); }
});

// Admin Route (Hidden)
app.post('/api/admin/update-balance', async (req, res) => {
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
    room.gameCountdown = 30;
    if (room.countdownInterval) clearInterval(room.countdownInterval);
    
    room.countdownInterval = setInterval(() => {
        room.gameCountdown--;
        broadcastToRoom(amount, { type: 'COUNTDOWN', value: room.gameCountdown, room: amount });
        updateGlobalStats();
        
        if (room.gameCountdown <= 0) {
            clearInterval(room.countdownInterval);
            startRoomGame(amount);
        }
    }, 1000);
}

function startRoomGame(amount) {
    const room = rooms[amount];
    room.balls = Array.from({length: 75}, (_, i) => i + 1);
    room.drawnBalls = [];
    broadcastToRoom(amount, { type: 'GAME_START', message: `${amount} ETB ጨዋታ ተጀምሯል!`, room: amount });

    if (room.gameInterval) clearInterval(room.gameInterval);
    room.gameInterval = setInterval(() => {
        if (room.balls.length > 0) {
            const randomIndex = Math.floor(Math.random() * room.balls.length);
            const ball = room.balls.splice(randomIndex, 1)[0];
            room.drawnBalls.push(ball);
            broadcastToRoom(amount, { type: 'NEW_BALL', ball, history: room.drawnBalls, room: amount });
        } else { 
            clearInterval(room.gameInterval);
            setTimeout(() => startRoomCountdown(amount), 5000);
        }
    }, 5000);
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
    STAKES.forEach(amount => {
        stats[amount] = rooms[amount].players.size;
        timers[amount] = rooms[amount].gameCountdown;
    });
    broadcastAll({ type: 'ROOM_STATS', stats, timers });
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'JOIN_ROOM') {
            // Remove from old room if any
            if (ws.room && rooms[ws.room]) {
                rooms[ws.room].players.delete(ws);
            }
            
            ws.room = data.room;
            const room = rooms[ws.room];
            if (room) {
                room.players.add(ws);
                ws.send(JSON.stringify({ 
                    type: 'INIT', 
                    history: room.drawnBalls,
                    countdown: room.gameCountdown,
                    room: ws.room
                }));
                updateGlobalStats();
            }
        }
        
        if (data.type === 'BUY_CARD') {
            console.log(`Room ${ws.room}: Card ${data.cardNumber} bought`);
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
});
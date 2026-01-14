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

let balls = [];
let drawnBalls = [];
let gameInterval;
let players = {}; // ተሳታፊዎችን ለመያዝ

// --- AUTH API ---
app.post('/api/signup', async (req, res) => {
    const { phone, password, name } = req.body;
    try {
        // Check if phone already exists
        const existing = await db.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: "ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል" });
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (phone_number, password_hash, username, name, balance) VALUES ($1, $2, $3, $4, 0) RETURNING *',
            [phone, hash, phone, name]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);
        res.json({ token, username: user.username, balance: user.balance, name: user.name });
    } catch (err) {
        console.error('Signup error:', err);
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

// --- BINGO LOGIC ---
function startNewGame() {
    balls = Array.from({length: 75}, (_, i) => i + 1);
    drawnBalls = [];
    players = {}; 
    broadcast({ type: 'GAME_START', message: "አዲስ ጨዋታ ተጀምሯል!" });

    gameInterval = setInterval(() => {
        if (balls.length > 0) {
            const randomIndex = Math.floor(Math.random() * balls.length);
            const ball = balls.splice(randomIndex, 1)[0];
            drawnBalls.push(ball);
            broadcast({ type: 'NEW_BALL', ball, history: drawnBalls });
        } else { clearInterval(gameInterval); }
    }, 5000);
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
    });
}

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'INIT', history: drawnBalls }));
    
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        if (data.type === 'BUY_CARD') {
            // እዚህ ጋር የገንዘብ ቅነሳ እና የካርድ ምዝገባ ሎጂክ ይገባል
            console.log(`${data.cardNumber} ተገዝቷል`);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    startNewGame();
});
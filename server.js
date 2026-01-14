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

function startRoomCountdown(amount) {
    const room = rooms[amount];
    room.gameCountdown = 30;
    if (room.countdownInterval) clearInterval(room.countdownInterval);
    
    room.countdownInterval = setInterval(() => {
        room.gameCountdown--;
        broadcastToRoom(amount, { type: 'COUNTDOWN', value: room.gameCountdown, room: amount });
        
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
    STAKES.forEach(amount => {
        stats[amount] = rooms[amount].players.size;
    });
    broadcastAll({ type: 'ROOM_STATS', stats });
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
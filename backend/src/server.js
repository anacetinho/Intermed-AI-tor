require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sessionRoutes = require('./routes/sessions');
const SocketHandler = require('./sockets/socketHandler');
const emailService = require('./services/emailService');

// Initialize database
require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', sessionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Socket.io handler
const socketHandler = new SocketHandler(io);
socketHandler.initialize();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`LLM Provider: ${process.env.LLM_PROVIDER}`);
  console.log(`LLM Model: ${process.env.LLM_MODEL}`);
});

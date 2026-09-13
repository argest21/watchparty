const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? genCode() : code;
}

io.on('connection', (socket) => {

  socket.on('create-room', ({ username }) => {
    const code = genCode();
    rooms[code] = {
      host: socket.id,
      members: [{ id: socket.id, username, isHost: true }],
      video: null,
      playing: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;
    socket.emit('room-created', { code, members: rooms[code].members });
  });

  socket.on('join-room', ({ code, username }) => {
    code = code.toUpperCase();
    if (!rooms[code]) { socket.emit('error-msg', 'Oda bulunamadı'); return; }
    rooms[code].members.push({ id: socket.id, username, isHost: false });
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;
    socket.emit('room-joined', {
      code,
      members: rooms[code].members,
      video: rooms[code].video,
      playing: rooms[code].playing,
      currentTime: rooms[code].currentTime
    });
    socket.to(code).emit('member-joined', { username, members: rooms[code].members });
  });

  socket.on('load-video', ({ url }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].video = url;
    rooms[code].playing = true;
    rooms[code].currentTime = 0;
    rooms[code].lastUpdate = Date.now();
    io.to(code).emit('video-loaded', { url });
  });

  socket.on('video-play', ({ currentTime }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].playing = true;
    rooms[code].currentTime = currentTime;
    rooms[code].lastUpdate = Date.now();
    socket.to(code).emit('video-play', { currentTime });
  });

  socket.on('video-pause', ({ currentTime }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].playing = false;
    rooms[code].currentTime = currentTime;
    rooms[code].lastUpdate = Date.now();
    socket.to(code).emit('video-pause', { currentTime });
  });

  socket.on('video-seek', ({ currentTime }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].currentTime = currentTime;
    rooms[code].lastUpdate = Date.now();
    socket.to(code).emit('video-seek', { currentTime });
  });

  socket.on('kick-member', ({ targetId }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    if (targetId === socket.id) return;
    const target = rooms[code].members.find(m => m.id === targetId);
    if (!target) return;
    rooms[code].members = rooms[code].members.filter(m => m.id !== targetId);
    io.to(targetId).emit('kicked');
    io.to(code).emit('member-left', {
      username: target.username,
      members: rooms[code].members
    });
    io.to(code).emit('chat-msg', {
      username: '🔴 Sistem',
      msg: target.username + ' odadan atıldı'
    });
  });

  socket.on('chat-msg', ({ msg }) => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    io.to(code).emit('chat-msg', { username: socket.username, msg });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].members = rooms[code].members.filter(m => m.id !== socket.id);
    if (rooms[code].members.length === 0) { delete rooms[code]; return; }
    if (rooms[code].host === socket.id) {
      const newHost = rooms[code].members[0];
      rooms[code].host = newHost.id;
      newHost.isHost = true;
      io.to(code).emit('host-changed', { newHost: newHost.username });
    }
    io.to(code).emit('member-left', { username: socket.username, members: rooms[code].members });
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('WatchParty — port: ' + PORT));

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {

  socket.on('create-room', ({ username }) => {
    const code = genCode();
    rooms[code] = {
      host: socket.id,
      members: [{ id: socket.id, username }],
      video: null
    };
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;
    socket.emit('room-created', { code, members: rooms[code].members });
  });

  socket.on('join-room', ({ code, username }) => {
    code = code.toUpperCase();
    if (!rooms[code]) {
      socket.emit('error-msg', 'Oda bulunamadı');
      return;
    }
    rooms[code].members.push({ id: socket.id, username });
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;
    socket.emit('room-joined', {
      code,
      members: rooms[code].members,
      video: rooms[code].video
    });
    socket.to(code).emit('member-joined', { username, members: rooms[code].members });
  });

  socket.on('load-video', ({ url }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].video = url;
    io.to(code).emit('video-loaded', { url });
  });

  socket.on('chat-msg', ({ msg }) => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    io.to(code).emit('chat-msg', { username: socket.username, msg });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    rooms[code].members = rooms[code].members.filter(m => m.id !== socket.id);
    if (rooms[code].members.length === 0) {
      delete rooms[code];
    } else {
      if (rooms[code].host === socket.id) {
        rooms[code].host = rooms[code].members[0].id;
        io.to(code).emit('host-changed', { newHost: rooms[code].members[0].username });
      }
      io.to(code).emit('member-left', { username: socket.username, members: rooms[code].members });
    }
  });
});

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? genCode() : code;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('WatchParty çalışıyor: port ' + PORT));

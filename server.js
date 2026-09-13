const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.get('/games', (req, res) => res.sendFile(path.join(__dirname, 'public', 'games.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = {};
const bans = {};
const onlineUsers = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? genCode() : code;
}

function getAllRooms() {
  return Object.entries(rooms).map(([code, r]) => ({
    code, name: r.name,
    host: r.members.find(m => m.isHost)?.username || '?',
    memberCount: r.members.length,
    maxMembers: r.maxMembers,
    hasVideo: !!r.video,
    isPrivate: r.isPrivate,
    locked: r.locked
  }));
}

function broadcastLobbies() { io.emit('lobbies', getAllRooms()); }
function broadcastOnline() {
  io.emit('online-users', Object.entries(onlineUsers).map(([id, u]) => ({ id, username: u.username })));
}

function isModOrHost(room, socketId) {
  const m = room.members.find(m => m.id === socketId);
  return m && (m.isHost || m.isMod);
}

const WORDS = ['araba','kitap','elma','deniz','güneş','kalem','masa','sandalye','bilgisayar','telefon','müzik','film','spor','yemek','arkadaş','okul','ev','bahçe','çiçek','kedi','köpek','kuş','balık','ağaç','gökyüzü'];

io.on('connection', (socket) => {

  socket.on('register-user', ({ userId, username }) => {
    onlineUsers[userId] = { username, socketId: socket.id };
    socket.userId = userId;
    socket.username = username;
    broadcastOnline();
  });

  socket.on('get-online-users', () => {
    socket.emit('online-users', Object.entries(onlineUsers).map(([id, u]) => ({ id, username: u.username })));
  });

  socket.on('invite-friend', ({ friendId, roomCode, roomName }) => {
    const friend = onlineUsers[friendId];
    if (!friend) { socket.emit('error-msg', 'Arkadaşın şu an çevrimiçi değil'); return; }
    io.to(friend.socketId).emit('room-invite', {
      from: socket.username,
      fromId: socket.userId,
      roomCode,
      roomName
    });
  });

  socket.on('get-lobbies', () => { socket.emit('lobbies', getAllRooms()); });

  socket.on('create-room', ({ username, isPrivate, password, name, maxMembers, avatarColor, usernameColor }) => {
    const code = genCode();
    rooms[code] = {
      host: socket.id,
      members: [{ id: socket.id, username, isHost: true, isMod: false, muted: false, avatarColor: avatarColor || '#8b7cf8', usernameColor: usernameColor || '#8b7cf8' }],
      video: null, playing: false, currentTime: 0, lastUpdate: Date.now(),
      isPrivate: !!isPrivate, password: isPrivate ? (password || '') : '',
      name: name || (username + "'in odası"),
      maxMembers: maxMembers || 10,
      messages: [], queue: [], game: null,
      pinnedMsg: null, locked: false
    };
    bans[code] = {};
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;
    socket.emit('room-created', { code, members: rooms[code].members, name: rooms[code].name, pinnedMsg: null, locked: false });
    broadcastLobbies();
  });

  socket.on('join-room', ({ code, username, password, avatarColor, usernameColor }) => {
    code = code.toUpperCase();
    const room = rooms[code];
    if (!room) { socket.emit('error-msg', 'Oda bulunamadı'); return; }
    if (room.locked) { socket.emit('error-msg', '🔒 Oda kilitli'); return; }
    if (room.members.length >= room.maxMembers) { socket.emit('error-msg', 'Oda dolu!'); return; }
    if (room.isPrivate && password !== room.password) { socket.emit('error-msg', !password ? 'Şifre gerekli' : 'Yanlış şifre!'); return; }
    if (bans[code]?.[username] > Date.now()) {
      const left = Math.ceil((bans[code][username] - Date.now()) / 60000);
      socket.emit('error-msg', `${left} dakika banlısınız!`); return;
    }
    room.members.push({ id: socket.id, username, isHost: false, isMod: false, muted: false, avatarColor: avatarColor || '#8b7cf8', usernameColor: usernameColor || '#8b7cf8' });
    socket.join(code);
    socket.roomCode = code;
    socket.username = username;
    socket.emit('room-joined', { code, name: room.name, members: room.members, video: room.video, playing: room.playing, currentTime: room.currentTime, messages: room.messages, queue: room.queue, pinnedMsg: room.pinnedMsg, locked: room.locked });
    socket.to(code).emit('member-joined', { username, members: room.members });
    broadcastLobbies();
  });

  socket.on('load-video', ({ url }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].video = url; rooms[code].playing = true; rooms[code].currentTime = 0; rooms[code].lastUpdate = Date.now();
    io.to(code).emit('video-loaded', { url }); broadcastLobbies();
  });
  socket.on('video-play', ({ currentTime }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].playing = true; rooms[code].currentTime = currentTime; rooms[code].lastUpdate = Date.now();
    socket.to(code).emit('video-play', { currentTime });
  });
  socket.on('video-pause', ({ currentTime }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].playing = false; rooms[code].currentTime = currentTime; rooms[code].lastUpdate = Date.now();
    socket.to(code).emit('video-pause', { currentTime });
  });
  socket.on('video-seek', ({ currentTime }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].currentTime = currentTime; rooms[code].lastUpdate = Date.now();
    socket.to(code).emit('video-seek', { currentTime });
  });
  socket.on('queue-add', ({ url }) => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    rooms[code].queue.push({ url, addedBy: socket.username });
    io.to(code).emit('queue-updated', { queue: rooms[code].queue });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '📋 Sistem', msg: socket.username + ' kuyruğa video ekledi', sys: true });
  });
  socket.on('queue-next', () => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    if (!rooms[code].queue.length) return;
    const next = rooms[code].queue.shift();
    rooms[code].video = next.url; rooms[code].playing = true; rooms[code].currentTime = 0;
    io.to(code).emit('video-loaded', { url: next.url });
    io.to(code).emit('queue-updated', { queue: rooms[code].queue });
  });
  socket.on('queue-remove', ({ index }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].queue.splice(index, 1);
    io.to(code).emit('queue-updated', { queue: rooms[code].queue });
  });
  socket.on('kick-member', ({ targetId }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    const target = rooms[code].members.find(m => m.id === targetId);
    if (!target || target.isHost) return;
    rooms[code].members = rooms[code].members.filter(m => m.id !== targetId);
    io.to(targetId).emit('kicked');
    io.to(code).emit('member-left', { username: target.username, members: rooms[code].members });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '🔴 Sistem', msg: target.username + ' atıldı', sys: true });
    broadcastLobbies();
  });
  socket.on('ban-member', ({ targetId, duration }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    const target = rooms[code].members.find(m => m.id === targetId);
    if (!target || target.isHost) return;
    if (!bans[code]) bans[code] = {};
    bans[code][target.username] = Date.now() + duration * 60 * 1000;
    rooms[code].members = rooms[code].members.filter(m => m.id !== targetId);
    io.to(targetId).emit('banned', { duration });
    io.to(code).emit('member-left', { username: target.username, members: rooms[code].members });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '🚫 Sistem', msg: `${target.username} ${duration}dk banlandı`, sys: true });
    broadcastLobbies();
  });
  socket.on('mute-member', ({ targetId }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    const target = rooms[code].members.find(m => m.id === targetId);
    if (!target) return;
    target.muted = !target.muted;
    io.to(targetId).emit('muted', { muted: target.muted });
    io.to(code).emit('member-updated', { members: rooms[code].members });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '🔇 Sistem', msg: target.username + (target.muted ? ' susturuldu' : ' sesi açıldı'), sys: true });
  });
  socket.on('set-mod', ({ targetId }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    const target = rooms[code].members.find(m => m.id === targetId);
    if (!target) return;
    target.isMod = !target.isMod;
    io.to(targetId).emit('mod-status', { isMod: target.isMod });
    io.to(code).emit('member-updated', { members: rooms[code].members });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '🛡️ Sistem', msg: target.username + (target.isMod ? ' mod oldu' : ' modluktan alındı'), sys: true });
  });
  socket.on('transfer-host', ({ targetId }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    const target = rooms[code].members.find(m => m.id === targetId);
    if (!target) return;
    const old = rooms[code].members.find(m => m.id === socket.id);
    if (old) old.isHost = false;
    target.isHost = true; rooms[code].host = targetId;
    io.to(targetId).emit('you-are-host');
    io.to(code).emit('host-changed', { newHost: target.username, members: rooms[code].members });
    broadcastLobbies();
  });
  socket.on('update-room-name', ({ name }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].name = name.trim().slice(0, 30) || rooms[code].name;
    io.to(code).emit('room-name-updated', { name: rooms[code].name });
    broadcastLobbies();
  });
  socket.on('update-room-password', ({ password }) => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].password = password; rooms[code].isPrivate = !!password;
    broadcastLobbies();
  });
  socket.on('toggle-lock', () => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].locked = !rooms[code].locked;
    io.to(code).emit('room-locked', { locked: rooms[code].locked });
    broadcastLobbies();
  });
  socket.on('pin-msg', ({ msgId, text, username }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].pinnedMsg = msgId ? { id: msgId, text, username } : null;
    io.to(code).emit('msg-pinned', { pinnedMsg: rooms[code].pinnedMsg });
  });
  socket.on('delete-msg', ({ msgId }) => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    rooms[code].messages = rooms[code].messages.filter(m => m.id !== msgId);
    io.to(code).emit('msg-deleted', { msgId });
  });
  socket.on('react-msg', ({ msgId, emoji }) => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    io.to(code).emit('msg-reaction', { msgId, emoji, username: socket.username });
  });
  socket.on('typing', () => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    socket.to(code).emit('user-typing', { username: socket.username });
  });
  socket.on('chat-msg', ({ msg }) => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    const member = rooms[code].members.find(m => m.id === socket.id);
    if (member?.muted) { socket.emit('error-msg', 'Susturuldunuz!'); return; }
    const message = { id: Date.now() + Math.random(), username: socket.username, msg, reactions: {} };
    rooms[code].messages.push(message);
    if (rooms[code].messages.length > 100) rooms[code].messages.shift();
    io.to(code).emit('chat-msg', message);
  });
  socket.on('game-start', () => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    rooms[code].game = { word, hints: Math.floor(word.length / 2), guesses: [], active: true };
    io.to(code).emit('game-started', { masked: '_ '.repeat(word.length).trim(), length: word.length, hints: rooms[code].game.hints });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '🎮 Oyun', msg: `Kelime tahmin başladı! ${word.length} harfli`, sys: true });
  });
  socket.on('game-guess', ({ guess }) => {
    const code = socket.roomCode;
    if (!rooms[code]?.game?.active) return;
    const game = rooms[code].game;
    guess = guess.toLowerCase().trim();
    if (game.guesses.includes(guess)) { socket.emit('error-msg', 'Zaten denediniz!'); return; }
    game.guesses.push(guess);
    if (guess === game.word) {
      game.active = false;
      io.to(code).emit('game-won', { winner: socket.username, word: game.word });
      io.to(code).emit('chat-msg', { id: Date.now(), username: '🎮 Oyun', msg: `🎉 ${socket.username} kazandı! Kelime: ${game.word}`, sys: true });
    } else {
      io.to(code).emit('chat-msg', { id: Date.now(), username: '🎮 Oyun', msg: `${socket.username} "${guess}" denedi — yanlış!`, sys: true });
    }
  });
  socket.on('game-hint', () => {
    const code = socket.roomCode;
    if (!rooms[code]?.game?.active) return;
    const game = rooms[code].game;
    if (game.hints <= 0) { socket.emit('error-msg', 'İpucu kalmadı!'); return; }
    game.hints--;
    const word = game.word;
    const idx = [...Array(word.length).keys()].filter(i => !game.guesses.includes(word[i]));
    if (idx.length > 0) {
      const i = idx[Math.floor(Math.random() * idx.length)];
      game.guesses.push(word[i]);
      const masked = word.split('').map(c => game.guesses.includes(c) ? c : '_').join(' ');
      io.to(code).emit('game-update', { masked, hints: game.hints });
      io.to(code).emit('chat-msg', { id: Date.now(), username: '💡 İpucu', msg: `${i + 1}. harf: "${word[i].toUpperCase()}"`, sys: true });
    }
  });
  socket.on('game-stop', () => {
    const code = socket.roomCode;
    if (!rooms[code] || !isModOrHost(rooms[code], socket.id)) return;
    const word = rooms[code].game?.word;
    rooms[code].game = null;
    io.to(code).emit('game-ended', { word });
    io.to(code).emit('chat-msg', { id: Date.now(), username: '🎮 Oyun', msg: `Oyun bitti. Kelime: ${word}`, sys: true });
  });

  socket.on('disconnect', () => {
    if (socket.userId) { delete onlineUsers[socket.userId]; broadcastOnline(); }
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].members = rooms[code].members.filter(m => m.id !== socket.id);
    if (rooms[code].members.length === 0) { delete rooms[code]; delete bans[code]; broadcastLobbies(); return; }
    if (rooms[code].host === socket.id) {
      const n = rooms[code].members[0];
      rooms[code].host = n.id; n.isHost = true;
      io.to(n.id).emit('you-are-host');
      io.to(code).emit('host-changed', { newHost: n.username, members: rooms[code].members });
    }
    io.to(code).emit('member-left', { username: socket.username, members: rooms[code].members });
    broadcastLobbies();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('WatchParty — port: ' + PORT));

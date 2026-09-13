const socket = io();

let state = {
  username: '',
  roomCode: '',
  isHost: false
};

let mp4Syncing = false;

// ——— ANA EKRAN ———

function createRoom() {
  const u = document.getElementById('home-username').value.trim();
  if (!u) { showErr('err-username', true); return; }
  showErr('err-username', false);
  state.username = u;
  socket.emit('create-room', { username: u });
}

function joinRoom() {
  const u = document.getElementById('home-username').value.trim();
  const c = document.getElementById('home-code').value.trim().toUpperCase();
  if (!u) { showErr('err-username', true); return; }
  showErr('err-username', false);
  if (c.length !== 6) { showErr('err-code', true); return; }
  showErr('err-code', false);
  state.username = u;
  socket.emit('join-room', { code: c, username: u });
}

document.getElementById('home-code').addEventListener('input', function () {
  this.value = this.value.toUpperCase();
});

// ——— SOCKET OLAYLARI ———

socket.on('room-created', ({ code, members }) => {
  state.roomCode = code;
  state.isHost = true;
  enterRoom(members);
});

socket.on('room-joined', ({ code, members, video, playing, currentTime }) => {
  state.roomCode = code;
  state.isHost = false;
  enterRoom(members);
  if (video) {
    renderVideo(video);
    const mp4 = document.getElementById('mp4-player');
    if (mp4.style.display !== 'none') {
      mp4.currentTime = currentTime || 0;
      if (playing) mp4.play();
    }
  }
});

socket.on('error-msg', (msg) => {
  const el = document.getElementById('err-server');
  el.textContent = msg;
  el.classList.add('show');
});

socket.on('member-joined', ({ username, members }) => {
  renderMembers(members);
  addMsg(null, username + ' odaya katıldı 👋', true);
});

socket.on('member-left', ({ username, members }) => {
  renderMembers(members);
  addMsg(null, username + ' odadan ayrıldı', true);
});

socket.on('host-changed', ({ newHost }) => {
  addMsg(null, newHost + ' yeni oda sahibi oldu 👑', true);
});

socket.on('video-loaded', ({ url }) => {
  renderVideo(url);
  if (!state.isHost) {
    document.getElementById('sync-text').textContent = 'Senkronize ✓';
    addMsg(null, 'Video başlatıldı 🎬', true);
  }
});

socket.on('video-play', ({ currentTime }) => {
  const mp4 = document.getElementById('mp4-player');
  if (mp4.style.display !== 'none') {
    mp4Syncing = true;
    mp4.currentTime = currentTime;
    mp4.play().finally(() => { mp4Syncing = false; });
  }
});

socket.on('video-pause', ({ currentTime }) => {
  const mp4 = document.getElementById('mp4-player');
  if (mp4.style.display

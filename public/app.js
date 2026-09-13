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
  if (mp4.style.display !== 'none') {
    mp4Syncing = true;
    mp4.currentTime = currentTime;
    mp4.pause();
    mp4Syncing = false;
  }
});

socket.on('video-seek', ({ currentTime }) => {
  const mp4 = document.getElementById('mp4-player');
  if (mp4.style.display !== 'none') {
    mp4Syncing = true;
    mp4.currentTime = currentTime;
    mp4Syncing = false;
  }
});

socket.on('kicked', () => {
  showToast('❌ Oda sahibi tarafından atıldın!');
  setTimeout(() => location.reload(), 2000);
});

socket.on('chat-msg', ({ username, msg }) => {
  addMsg(username, msg);
});

// ——— ODA ———

function enterRoom(members) {
  const home = document.getElementById('screen-home');
  const room = document.getElementById('screen-room');
  home.classList.remove('active');
  home.style.display = 'none';
  room.style.display = 'flex';
  room.classList.add('active');

  document.getElementById('badge-username').textContent = '👤 ' + state.username;
  document.getElementById('badge-code').textContent = state.roomCode;
  document.getElementById('badge-host').style.display = state.isHost ? 'inline-flex' : 'none';
  document.getElementById('host-controls').style.display = state.isHost ? 'flex' : 'none';
  document.getElementById('sync-bar').style.display = state.isHost ? 'none' : 'flex';

  if (state.isHost) {
    document.getElementById('placeholder-text').textContent = 'Video seç ve başlat';
    document.getElementById('placeholder-sub').textContent = 'Aşağıya YouTube veya MP4 linki yapıştır';
  }

  renderMembers(members);
  addMsg(null, 'Odaya katıldın 🎉 Kod: ' + state.roomCode, true);
}

function renderMembers(members) {
  document.getElementById('member-count').textContent = members.length;
  const el = document.getElementById('members-list');
  el.innerHTML = '';
  members.forEach(m => {
    const div = document.createElement('div');
    div.className = 'member-item';
    const initials = m.username.slice(0, 2).toUpperCase();
    const isMe = m.username === state.username;
    div.innerHTML = `
      <div class="avatar ${m.isHost ? 'host' : ''}">${initials}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${esc(m.username)}${isMe ? ' <span style="color:var(--muted);font-size:11px">(sen)</span>' : ''}</div>
        ${m.isHost ? '<div class="member-tag">👑 Oda Sahibi</div>' : ''}
      </div>
      ${state.isHost && !isMe && !m.isHost ? `<button class="kick-btn" onclick="kickMember('${m.id}', '${esc(m.username)}')">At</button>` : ''}
    `;
    el.appendChild(div);
  });
}

// ——— KİCK ———

function kickMember(targetId, username) {
  if (!confirm(username + ' kişisini odadan atmak istiyor musun?')) return;
  socket.emit('kick-member', { targetId });
}

// ——— VİDEO ———

function loadVideo() {
  const url = document.getElementById('video-url').value.trim();
  if (!url) { showErr('err-video', true); return; }
  const ytId = getYouTubeId(url);
  const isMp4 = /\.(mp4|webm|ogg)(\?|$)/i.test(url);
  if (!ytId && !isMp4) {
    document.getElementById('err-video').textContent = 'Geçerli bir YouTube veya MP4 linki gir';
    showErr('err-video', true);
    return;
  }
  showErr('err-video', false);
  socket.emit('load-video', { url });
}

function renderVideo(url) {
  document.getElementById('video-placeholder').style.display = 'none';
  const yt = document.getElementById('yt-frame');
  const mp4 = document.getElementById('mp4-player');
  const ytId = getYouTubeId(url);

  if (ytId) {
    yt.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&enablejsapi=1`;
    yt.style.display = 'block';
    mp4.style.display = 'none';
  } else {
    mp4.src = url;
    mp4.style.display = 'block';
    yt.style.display = 'none';
    attachMp4Events(mp4);
  }
}

function attachMp4Events(mp4) {
  if (mp4._eventsAttached) return;
  mp4._eventsAttached = true;
  mp4.addEventListener('play', () => {
    if (!state.isHost || mp4Syncing) return;
    socket.emit('video-play', { currentTime: mp4.currentTime });
  });
  mp4.addEventListener('pause', () => {
    if (!state.isHost || mp4Syncing) return;
    socket.emit('video-pause', { currentTime: mp4.currentTime });
  });
  mp4.addEventListener('seeked', () => {
    if (!state.isHost || mp4Syncing) return;
    socket.emit('video-seek', { currentTime: mp4.currentTime });
  });
}

function getYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ——— SOHBET ———

function sendChat() {
  const inp = document.getElementById('chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  socket.emit('chat-msg', { msg });
  inp.value = '';
}

function addMsg(who, msg, sys = false) {
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const now = new Date();
  const t = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  if (sys) {
    div.innerHTML = `<span class="chat-sys">${esc(msg)}</span>`;
  } else {
    div.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-who">${esc(who)}</span>
        <span class="chat-time">${t}</span>
      </div>
      <div class="chat-text">${esc(msg)}</div>
    `;
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ——— YARDIMCILAR ———

function copyCode() {
  if (navigator.clipboard) navigator.clipboard.writeText(state.roomCode).catch(() => {});
  showToast('✓ Kod kopyalandı: ' + state.roomCode);
}

function leaveRoom() {
  location.reload();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2500);
}

function showErr(id, show) {
  const el = document.getElementById(id);
  if (show) el.classList.add('show');
  else el.classList.remove('show');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

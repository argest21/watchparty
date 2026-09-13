const socket = io();

let state = { username: '', roomCode: '', isHost: false };
let mp4Syncing = false;
let pendingJoin = null;
let privateMode = false;

function togglePrivate() {
  privateMode = !privateMode;
  document.getElementById('toggle-private').classList.toggle('on', privateMode);
  document.getElementById('password-field').style.display = privateMode ? 'flex' : 'none';
}

// ——— LOBİLER ———
socket.on('lobbies', (lobbies) => {
  const list = document.getElementById('lobbies-list');
  const count = document.getElementById('lobby-count');
  if (!list) return;
  count.textContent = lobbies.length + ' aktif';
  if (lobbies.length === 0) {
    list.innerHTML = '<div class="lobbies-empty">Henüz lobi yok 👀</div>';
    return;
  }
  list.innerHTML = '';
  lobbies.forEach(l => {
    const div = document.createElement('div');
    div.className = 'lobby-item';
    div.innerHTML = `
      <div class="lobby-avatar ${l.isPrivate ? 'locked' : ''}">${l.isPrivate ? '🔒' : l.host.slice(0,2).toUpperCase()}</div>
      <div class="lobby-info">
        <div class="lobby-host">
          ${esc(l.host)}'in odası
          ${l.isPrivate ? '<span class="lobby-lock">🔒 Gizli</span>' : ''}
        </div>
        <div class="lobby-meta">
          👥 ${l.memberCount} kişi
          ${l.hasVideo ? '<span class="lobby-live"><span class="lobby-live-dot"></span>Canlı</span>' : ''}
        </div>
      </div>
      <button class="btn-enter ${l.isPrivate ? 'locked' : ''}" onclick="joinLobby('${l.code}', ${l.isPrivate})">
        ${l.isPrivate ? '🔑 Gir' : 'Katıl'}
      </button>
    `;
    list.appendChild(div);
  });
});

function refreshLobbies() {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '⏳';
  btn.style.opacity = '.5';
  socket.emit('get-lobbies');
  setTimeout(() => {
    btn.textContent = '🔄 Yenile';
    btn.style.opacity = '1';
  }, 800);
}

function joinLobby(code, isPrivate) {
  const u = document.getElementById('home-username').value.trim();
  if (!u) { showErr('err-username', true); document.getElementById('home-username').focus(); return; }
  showErr('err-username', false);
  state.username = u;
  pendingJoin = { code, username: u };
  if (isPrivate) {
    openModal(code);
  } else {
    socket.emit('join-room', { code, username: u, password: '' });
  }
}

function createRoom() {
  const u = document.getElementById('home-username').value.trim();
  if (!u) { showErr('err-username', true); return; }
  showErr('err-username', false);
  state.username = u;
  const pass = privateMode ? (document.getElementById('room-password').value || '') : '';
  socket.emit('create-room', { username: u, isPrivate: privateMode, password: pass });
}

function joinByCode() {
  const u = document.getElementById('home-username').value.trim();
  const c = document.getElementById('home-code').value.trim().toUpperCase();
  if (!u) { showErr('err-username', true); return; }
  showErr('err-username', false);
  if (c.length !== 6) { showErr('err-code', true); return; }
  showErr('err-code', false);
  state.username = u;
  pendingJoin = { code: c, username: u };
  socket.emit('join-room', { code: c, username: u, password: '' });
}

function openModal(code) {
  document.getElementById('modal-sub').textContent = code + ' kodlu odaya girmek için şifre gir';
  document.getElementById('modal-password').value = '';
  showErr('err-modal', false);
  document.getElementById('password-modal').classList.add('show');
  setTimeout(() => document.getElementById('modal-password').focus(), 100);
}

function closeModal() {
  document.getElementById('password-modal').classList.remove('show');
  pendingJoin = null;
}

function modalJoin() {
  if (!pendingJoin) return;
  const pass = document.getElementById('modal-password').value;
  if (!pass) {
    document.getElementById('err-modal').textContent = 'Şifre boş olamaz';
    showErr('err-modal', true);
    return;
  }
  socket.emit('join-room', { code: pendingJoin.code, username: pendingJoin.username, password: pass });
}

socket.on('room-created', ({ code, members }) => {
  state.roomCode = code; state.isHost = true; enterRoom(members);
});

socket.on('room-joined', ({ code, members, video, playing, currentTime }) => {
  state.roomCode = code; state.isHost = false;
  closeModal();
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
  if (msg === 'Şifre gerekli') { openModal(pendingJoin ? pendingJoin.code : ''); return; }
  if (msg === 'Yanlış şifre!') {
    if (!document.getElementById('password-modal').classList.contains('show')) {
      openModal(pendingJoin ? pendingJoin.code : '');
    }
    document.getElementById('err-modal').textContent = '❌ Yanlış şifre!';
    showErr('err-modal', true);
    return;
  }
  const el = document.getElementById('err-server');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
});

socket.on('member-joined', ({ username, members }) => { renderMembers(members); addMsg(null, username + ' odaya katıldı 👋', true); });
socket.on('member-left', ({ username, members }) => { renderMembers(members); addMsg(null, username + ' odadan ayrıldı', true); });
socket.on('host-changed', ({ newHost }) => { addMsg(null, newHost + ' yeni oda sahibi oldu 👑', true); });

socket.on('video-loaded', ({ url }) => {
  renderVideo(url);
  if (!state.isHost) { document.getElementById('sync-text').textContent = 'Senkronize ✓'; addMsg(null, 'Video başlatıldı 🎬', true); }
});

socket.on('video-play', ({ currentTime }) => {
  const mp4 = document.getElementById('mp4-player');
  if (mp4.style.display !== 'none') { mp4Syncing = true; mp4.currentTime = currentTime; mp4.play().finally(() => { mp4Syncing = false; }); }
});

socket.on('video-pause', ({ currentTime }) => {
  const mp4 = document.getElementById('mp4-player');
  if (mp4.style.display !== 'none') { mp4Syncing = true; mp4.currentTime = currentTime; mp4.pause(); mp4Syncing = false; }
});

socket.on('video-seek', ({ currentTime }) => {
  const mp4 = document.getElementById('mp4-player');
  if (mp4.style.display !== 'none') { mp4Syncing = true; mp4.currentTime = currentTime; mp4Syncing = false; }
});

socket.on('kicked', () => { showToast('❌ Oda sahibi tarafından atıldın!'); setTimeout(() => location.reload(), 2000); });
socket.on('chat-msg', ({ username, msg }) => { addMsg(username, msg); });

function enterRoom(members) {
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-home').style.display = 'none';
  document.getElementById('screen-room').style.display = 'flex';
  document.getElementById('screen-room').classList.add('active');
  document.getElementById('badge-username').textContent = '👤 ' + state.username;
  document.getElementById('badge-code').textContent = state.roomCode;
  document.getElementById('badge-host').style.display = state.isHost ? 'inline-flex' : 'none';
  document.getElementById('host-controls').style.display = state.isHost ? 'flex' : 'none';
  document.getElementById('sync-bar').style.display = state.isHost ? 'none' : 'flex';
  if (state.isHost) {
    document.getElementById('placeholder-text').textContent = 'Video seç ve başlat';
    document.getElementById('placeholder-sub').textContent = 'YouTube, Kick, Twitch veya MP4 linki yapıştır';
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
    const isMe = m.username === state.username;
    div.innerHTML = `
      <div class="avatar ${m.isHost ? 'host' : ''}">${m.username.slice(0,2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${esc(m.username)}${isMe ? ' <span style="color:var(--muted);font-size:11px">(sen)</span>' : ''}</div>
        ${m.isHost ? '<div class="member-tag">👑 Oda Sahibi</div>' : ''}
      </div>
      ${state.isHost && !isMe && !m.isHost ? `<button class="kick-btn" onclick="kickMember('${m.id}','${esc(m.username)}')">At</button>` : ''}
    `;
    el.appendChild(div);
  });
}

function kickMember(targetId, username) {
  if (!confirm(username + ' kişisini odadan atmak istiyor musun?')) return;
  socket.emit('kick-member', { targetId });
}

function getYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function getKickChannel(url) { const m = url.match(/kick\.com\/([A-Za-z0-9_]+)/); return m ? m[1] : null; }
function getTwitchChannel(url) { const m = url.match(/twitch\.tv\/([A-Za-z0-9_]+)/); return m ? m[1] : null; }
function detectType(url) {
  if (getYouTubeId(url)) return 'youtube';
  if (getKickChannel(url)) return 'kick';
  if (getTwitchChannel(url)) return 'twitch';
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return 'mp4';
  return null;
}

function loadVideo() {
  const url = document.getElementById('video-url').value.trim();
  if (!url || !detectType(url)) {
    document.getElementById('err-video').textContent = 'YouTube, Kick, Twitch veya MP4 linki gir';
    showErr('err-video', true); return;
  }
  showErr('err-video', false);
  socket.emit('load-video', { url });
}

function renderVideo(url) {
  document.getElementById('video-placeholder').style.display = 'none';
  const yt = document.getElementById('yt-frame');
  const mp4El = document.getElementById('mp4-player');
  yt.style.display = 'none'; yt.src = '';
  mp4El.style.display = 'none'; mp4El.src = '';
  const type = detectType(url);
  if (type === 'youtube') {
    yt.src = `https://www.youtube-nocookie.com/embed/${getYouTubeId(url)}?autoplay=1&enablejsapi=1`;
    yt.style.display = 'block';
  } else if (type === 'kick') {
    yt.src = `https://player.kick.com/${getKickChannel(url)}`;
    yt.style.display = 'block';
    addMsg(null, '🟢 Kick yayını: ' + getKickChannel(url), true);
  } else if (type === 'twitch') {
    yt.src = `https://player.twitch.tv/?channel=${getTwitchChannel(url)}&parent=${window.location.hostname}&autoplay=true`;
    yt.style.display = 'block';
    addMsg(null, '🟣 Twitch yayını: ' + getTwitchChannel(url), true);
  } else if (type === 'mp4') {
    mp4El.src = url; mp4El.style.display = 'block'; attachMp4Events(mp4El);
  }
}

function attachMp4Events(mp4) {
  if (mp4._eventsAttached) return;
  mp4._eventsAttached = true;
  mp4.addEventListener('play', () => { if (!state.isHost || mp4Syncing) return; socket.emit('video-play', { currentTime: mp4.currentTime }); });
  mp4.addEventListener('pause', () => { if (!state.isHost || mp4Syncing) return; socket.emit('video-pause', { currentTime: mp4.currentTime }); });
  mp4.addEventListener('seeked', () => { if (!state.isHost || mp4Syncing) return; socket.emit('video-seek', { currentTime: mp4.currentTime }); });
}

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
  const t = new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0');
  if (sys) {
    div.innerHTML = `<span class="chat-sys">${esc(msg)}</span>`;
  } else {
    div.innerHTML = `<div class="chat-msg-header"><span class="chat-who">${esc(who)}</span><span class="chat-time">${t}</span></div><div class="chat-text">${esc(msg)}</div>`;
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function copyCode() {
  if (navigator.clipboard) navigator.clipboard.writeText(state.roomCode).catch(() => {});
  showToast('✓ Kod kopyalandı: ' + state.roomCode);
}
function leaveRoom() { location.reload(); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2500);
}
function showErr(id, show) {
  const el = document.getElementById(id);
  if (show) el.classList.add('show'); else el.classList.remove('show');
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

socket.emit('get-lobbies');
setInterval(() => socket.emit('get-lobbies'), 5000);

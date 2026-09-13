const socket = io();

// ——— TEMALAR ———
const THEMES = [
  { name: 'Mor', accent: '#8b7cf8', dark: '#6c5ce7', bg: '#08080f' },
  { name: 'Kırmızı', accent: '#f87171', dark: '#dc2626', bg: '#0f0808' },
  { name: 'Mavi', accent: '#60a5fa', dark: '#2563eb', bg: '#08080f' },
  { name: 'Yeşil', accent: '#4ade80', dark: '#16a34a', bg: '#08100a' },
  { name: 'Turuncu', accent: '#fb923c', dark: '#ea580c', bg: '#100908' },
  { name: 'Pembe', accent: '#f472b6', dark: '#db2777', bg: '#100810' },
  { name: 'Sarı', accent: '#fbbf24', dark: '#d97706', bg: '#100f08' },
  { name: 'Turkuaz', accent: '#2dd4bf', dark: '#0d9488', bg: '#08100f' },
];

const BG_PRESETS = [
  { label: 'Varsayılan', value: '#08080f' },
  { label: 'Koyu Mor', value: 'linear-gradient(135deg,#1a0a2e,#08080f)' },
  { label: 'Gece', value: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' },
  { label: 'Okyanus', value: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)' },
  { label: 'Orman', value: 'linear-gradient(135deg,#0a2e0a,#08100a)' },
  { label: 'Şarap', value: 'linear-gradient(135deg,#2e0a0a,#100808)' },
];

const COLORS = ['#8b7cf8','#f5c842','#ff5f57','#4ade80','#60a5fa','#f97316','#ec4899','#14b8a6'];
const EMOJIS = ['👍','❤️','😂','😮','😢','🔥'];

let state = { username:'',roomCode:'',isHost:false,isMod:false,isMuted:false,avatarColor:COLORS[0],usernameColor:COLORS[0] };
let mp4Syncing = false, pendingJoin = null, privateMode = false, typingTimer = null, settingsOpen = false, roomLocked = false;

// ——— TEMA BAŞLAT ———
function initThemes() {
  const row = document.getElementById('theme-row');
  if (!row) return;
  THEMES.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'theme-btn' + (i === 0 ? ' active' : '');
    btn.textContent = t.name;
    btn.style.background = `rgba(${hexToRgb(t.accent)},0.15)`;
    btn.style.borderColor = `rgba(${hexToRgb(t.accent)},0.4)`;
    btn.style.color = t.accent;
    btn.onclick = () => {
      applyTheme(t);
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    row.appendChild(btn);
  });
}

function applyTheme(t) {
  document.documentElement.style.setProperty('--accent', t.accent);
  document.documentElement.style.setProperty('--accent-dark', t.dark);
  document.documentElement.style.setProperty('--bg', t.bg);
  document.body.style.background = t.bg;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

// ——— ARKA PLAN ———
function initBgPresets() {
  const el = document.getElementById('bg-presets');
  if (!el) return;
  BG_PRESETS.forEach((p, i) => {
    const dot = document.createElement('div');
    dot.className = 'bg-preset' + (i === 0 ? ' selected' : '');
    dot.style.background = p.value;
    dot.title = p.label;
    dot.onclick = () => {
      document.querySelectorAll('.bg-preset').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      applyBg(p.value);
    };
    el.appendChild(dot);
  });
}

function applyBg(value) {
  document.body.style.background = value;
  document.getElementById('bg-custom').value = value;
}

function applyCustomBg() {
  const val = document.getElementById('bg-custom').value.trim();
  if (!val) return;
  applyBg(val);
}

// ——— RENK SEÇİCİ ———
function initColors() {
  ['avatar','username'].forEach(type => {
    const el = document.getElementById(type + '-colors');
    if (!el) return;
    COLORS.forEach((c, i) => {
      const dot = document.createElement('div');
      dot.className = 'color-dot' + (i === 0 ? ' selected' : '');
      dot.style.background = c;
      dot.onclick = () => {
        el.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        if (type === 'avatar') state.avatarColor = c;
        else state.usernameColor = c;
      };
      el.appendChild(dot);
    });
  });
}

initThemes();
initColors();

function togglePrivate() {
  privateMode = !privateMode;
  document.getElementById('toggle-private').classList.toggle('on', privateMode);
}

// ——— ODA AYARLARI ———
function toggleSettings() {
  if (!state.isHost) return;
  settingsOpen = !settingsOpen;
  document.getElementById('room-settings-panel').classList.toggle('show', settingsOpen);
  initBgPresets();
}

function updateRoomName() {
  const name = document.getElementById('new-room-name').value.trim();
  if (!name) return;
  socket.emit('update-room-name', { name });
  document.getElementById('new-room-name').value = '';
}

function updateRoomPassword() {
  const password = document.getElementById('new-room-password').value;
  socket.emit('update-room-password', { password });
  document.getElementById('new-room-password').value = '';
  showToast(password ? '🔑 Şifre güncellendi' : '🔓 Şifre kaldırıldı');
}

function toggleLock() {
  socket.emit('toggle-lock');
}

// ——— LOBİLER ———
socket.on('lobbies', (lobbies) => {
  const list = document.getElementById('lobbies-list');
  const count = document.getElementById('lobby-count');
  if (!list) return;
  count.textContent = lobbies.length + ' aktif';
  if (lobbies.length === 0) { list.innerHTML = '<div class="lobbies-empty">Henüz lobi yok 👀</div>'; return; }
  list.innerHTML = '';
  lobbies.forEach(l => {
    const isFull = l.memberCount >= l.maxMembers;
    const div = document.createElement('div');
    div.className = 'lobby-item';
    div.innerHTML = `
      <div class="lobby-avatar" style="background:rgba(139,124,248,0.15);color:var(--accent)">${l.isPrivate ? '🔒' : l.locked ? '🔐' : l.host.slice(0,2).toUpperCase()}</div>
      <div class="lobby-info">
        <div class="lobby-name">${esc(l.name)}</div>
        <div class="lobby-meta">
          👥 ${l.memberCount}/${l.maxMembers}
          ${l.isPrivate ? '<span class="lobby-lock">🔒 Gizli</span>' : ''}
          ${l.locked ? '<span class="lobby-locked">🔐 Kilitli</span>' : ''}
          ${isFull ? '<span class="lobby-full">🚫 Dolu</span>' : ''}
          ${l.hasVideo ? '<span class="lobby-live"><span class="lobby-live-dot"></span>Canlı</span>' : ''}
        </div>
      </div>
      <button class="btn-enter ${l.isPrivate ? 'locked-lobby' : ''}" ${(isFull || l.locked) ? 'disabled' : ''} onclick="joinLobby('${l.code}',${l.isPrivate})">
        ${l.locked ? '🔐' : isFull ? 'Dolu' : l.isPrivate ? '🔑 Gir' : 'Katıl'}
      </button>`;
    list.appendChild(div);
  });
});

function refreshLobbies() {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '⏳'; btn.style.opacity = '.5';
  socket.emit('get-lobbies');
  setTimeout(() => { btn.textContent = '🔄 Yenile'; btn.style.opacity = '1'; }, 800);
}

function joinLobby(code, isPrivate) {
  const u = document.getElementById('join-username').value.trim() || document.getElementById('home-username').value.trim();
  if (!u) { showErr('err-username', true); return; }
  showErr('err-username', false);
  state.username = u;
  pendingJoin = { code, username: u };
  if (isPrivate) openModal(code);
  else socket.emit('join-room', { code, username: u, password: '', avatarColor: state.avatarColor, usernameColor: state.usernameColor });
}

function createRoom() {
  const u = document.getElementById('home-username').value.trim();
  if (!u) { showErr('err-username', true); return; }
  showErr('err-username', false);
  state.username = u;
  const name = document.getElementById('room-name').value.trim() || (u + "'in odası");
  const maxMembers = parseInt(document.getElementById('room-max').value) || 10;
  const pass = privateMode ? (document.getElementById('room-password').value || '') : '';
  socket.emit('create-room', { username: u, isPrivate: privateMode, password: pass, name, maxMembers, avatarColor: state.avatarColor, usernameColor: state.usernameColor });
}

function joinByCode() {
  const u = document.getElementById('join-username').value.trim() || document.getElementById('home-username').value.trim();
  const c = document.getElementById('home-code').value.trim().toUpperCase();
  if (!u) { showErr('err-username', true); return; }
  if (c.length !== 6) { showErr('err-code', true); return; }
  showErr('err-code', false);
  state.username = u;
  pendingJoin = { code: c, username: u };
  socket.emit('join-room', { code: c, username: u, password: '', avatarColor: state.avatarColor, usernameColor: state.usernameColor });
}

function openModal(code) {
  document.getElementById('modal-sub').textContent = code + ' kodlu odaya girmek için şifre gir';
  document.getElementById('modal-password').value = '';
  showErr('err-modal', false);
  document.getElementById('password-modal').classList.add('show');
  setTimeout(() => document.getElementById('modal-password').focus(), 100);
}
function closeModal() { document.getElementById('password-modal').classList.remove('show'); pendingJoin = null; }
function modalJoin() {
  if (!pendingJoin) return;
  const pass = document.getElementById('modal-password').value;
  if (!pass) { document.getElementById('err-modal').textContent = 'Şifre boş olamaz'; showErr('err-modal', true); return; }
  socket.emit('join-room', { code: pendingJoin.code, username: pendingJoin.username, password: pass, avatarColor: state.avatarColor, usernameColor: state.usernameColor });
}

// ——— SOCKET OLAYLARI ———
socket.on('room-created', ({ code, members, name, pinnedMsg, locked }) => {
  state.roomCode = code; state.isHost = true;
  roomLocked = locked || false;
  enterRoom(members, name);
  if (pinnedMsg) showPinned(pinnedMsg);
});

socket.on('room-joined', ({ code, members, video, playing, currentTime, messages, queue, name, pinnedMsg, locked }) => {
  state.roomCode = code; state.isHost = false;
  roomLocked = locked || false;
  closeModal(); enterRoom(members, name);
  if (pinnedMsg) showPinned(pinnedMsg);
  if (messages) messages.forEach(m => addMsg(m.username, m.msg, false, m.id, m.reactions || {}));
  if (queue) renderQueue(queue);
  if (video) {
    renderVideo(video);
    const mp4 = document.getElementById('mp4-player');
    if (mp4.style.display !== 'none') { mp4.currentTime = currentTime || 0; if (playing) mp4.play(); }
  }
});

socket.on('error-msg', (msg) => {
  if (msg === 'Şifre gerekli') { openModal(pendingJoin?.code || ''); return; }
  if (msg === 'Yanlış şifre!') {
    if (!document.getElementById('password-modal').classList.contains('show')) openModal(pendingJoin?.code || '');
    document.getElementById('err-modal').textContent = '❌ Yanlış şifre!'; showErr('err-modal', true); return;
  }
  const el = document.getElementById('err-server');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
});

socket.on('member-joined', ({ username, members }) => { renderMembers(members); addMsg(null, username + ' odaya katıldı 👋', true); });
socket.on('member-left', ({ username, members }) => { renderMembers(members); addMsg(null, username + ' odadan ayrıldı', true); });
socket.on('member-updated', ({ members }) => { renderMembers(members); });

socket.on('host-changed', ({ newHost, members }) => {
  if (members) renderMembers(members);
  addMsg(null, newHost + ' yeni oda sahibi oldu 👑', true);
});

socket.on('you-are-host', () => {
  state.isHost = true; state.isMod = false;
  document.getElementById('badge-host').style.display = 'inline-flex';
  document.getElementById('badge-mod').style.display = 'none';
  document.getElementById('host-controls').style.display = 'flex';
  document.getElementById('sync-bar').style.display = 'none';
  document.getElementById('host-room-actions').style.display = 'flex';
  document.getElementById('btn-queue-next').style.display = 'inline-flex';
  const wrap = document.getElementById('btn-game-start-wrap');
  wrap.innerHTML = '<button class="btn-game-start" onclick="startGame()">🎮 Oyun</button>';
  showToast('👑 Artık oda sahibisin!');
});

socket.on('mod-status', ({ isMod }) => {
  state.isMod = isMod;
  document.getElementById('badge-mod').style.display = isMod ? 'inline-flex' : 'none';
  showToast(isMod ? '🛡️ Moderatör oldunuz!' : 'Moderatörlükten alındınız');
});

socket.on('muted', ({ muted }) => {
  state.isMuted = muted;
  document.getElementById('badge-muted').style.display = muted ? 'inline-flex' : 'none';
  document.getElementById('muted-bar').classList.toggle('show', muted);
  document.getElementById('chat-input').disabled = muted;
  showToast(muted ? '🔇 Susturuldunuz' : '🔊 Sesiniz açıldı');
});

socket.on('banned', ({ duration }) => {
  showToast(`🚫 ${duration} dakika banlandınız!`);
  setTimeout(() => location.reload(), 2000);
});

socket.on('kicked', () => { showToast('❌ Oda sahibi tarafından atıldın!'); setTimeout(() => location.reload(), 2000); });

socket.on('room-name-updated', ({ name }) => {
  document.getElementById('room-name-badge').textContent = name;
  showToast('✏️ Oda adı güncellendi: ' + name);
});

socket.on('room-locked', ({ locked }) => {
  roomLocked = locked;
  const btn = document.getElementById('btn-lock');
  if (btn) { btn.textContent = locked ? '🔐 Kilidi Aç' : '🔓 Kilitle'; btn.classList.toggle('active', locked); }
  showToast(locked ? '🔐 Oda kilitlendi' : '🔓 Oda kilidi açıldı');
});

socket.on('msg-pinned', ({ pinnedMsg }) => {
  if (pinnedMsg) showPinned(pinnedMsg);
  else hidePinned();
});

socket.on('video-loaded', ({ url }) => {
  renderVideo(url); updateVideoTitle(url);
  if (!state.isHost && !state.isMod) { document.getElementById('sync-text').textContent = 'Senkronize ✓'; addMsg(null, 'Video başlatıldı 🎬', true); }
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
socket.on('queue-updated', ({ queue }) => { renderQueue(queue); });
socket.on('chat-msg', ({ id, username, msg, sys, reactions }) => {
  if (sys) addMsg(null, msg, true);
  else addMsg(username, msg, false, id, reactions || {});
});
socket.on('msg-deleted', ({ msgId }) => {
  document.querySelector(`[data-msg-id="${msgId}"]`)?.remove();
});
socket.on('msg-reaction', ({ msgId, emoji, username }) => {
  const msgEl = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!msgEl) return;
  let reactionsEl = msgEl.querySelector('.msg-reactions');
  if (!reactionsEl) { reactionsEl = document.createElement('div'); reactionsEl.className = 'msg-reactions'; msgEl.appendChild(reactionsEl); }
  let badge = reactionsEl.querySelector(`[data-emoji="${emoji}"]`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'reaction-badge'; badge.setAttribute('data-emoji', emoji);
    badge.innerHTML = `${emoji} <span class="react-count">1</span>`; badge.title = username;
    reactionsEl.appendChild(badge);
  } else {
    badge.querySelector('.react-count').textContent = parseInt(badge.querySelector('.react-count').textContent) + 1;
    badge.title += ', ' + username;
  }
});
socket.on('user-typing', ({ username }) => {
  const el = document.getElementById('typing-indicator');
  el.textContent = username + ' yazıyor...';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ''; }, 2500);
});
socket.on('game-started', ({ masked, length, hints }) => {
  document.getElementById('game-section').classList.add('show');
  document.getElementById('game-word').textContent = masked;
  document.getElementById('game-info').textContent = `${length} harfli · ${hints} ipucu`;
  document.getElementById('btn-hint').textContent = `💡 (${hints})`;
  if (state.isHost) document.getElementById('btn-game-stop').style.display = 'inline-flex';
});
socket.on('game-update', ({ masked, hints }) => {
  document.getElementById('game-word').textContent = masked;
  document.getElementById('btn-hint').textContent = `💡 (${hints})`;
});
socket.on('game-won', ({ winner, word }) => {
  document.getElementById('game-word').textContent = word.toUpperCase();
  document.getElementById('game-info').textContent = `🎉 ${winner} kazandı!`;
  setTimeout(() => document.getElementById('game-section').classList.remove('show'), 4000);
});
socket.on('game-ended', () => { document.getElementById('game-section').classList.remove('show'); });

// ——— ODA ———
function enterRoom(members, name) {
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-home').style.display = 'none';
  document.getElementById('screen-room').style.display = 'flex';
  document.getElementById('screen-room').classList.add('active');
  document.getElementById('badge-username').textContent = '👤 ' + state.username;
  document.getElementById('badge-username').style.color = state.usernameColor;
  document.getElementById('badge-code').textContent = state.roomCode;
  document.getElementById('room-name-badge').textContent = name || '';
  document.getElementById('badge-host').style.display = state.isHost ? 'inline-flex' : 'none';
  document.getElementById('host-controls').style.display = state.isHost ? 'flex' : 'none';
  document.getElementById('sync-bar').style.display = state.isHost ? 'none' : 'flex';
  document.getElementById('host-room-actions').style.display = state.isHost ? 'flex' : 'none';
  if (state.isHost) {
    document.getElementById('placeholder-text').textContent = 'Video seç ve başlat';
    document.getElementById('placeholder-sub').textContent = 'YouTube, Kick, Twitch veya MP4 linki yapıştır';
    document.getElementById('btn-queue-next').style.display = 'inline-flex';
    document.getElementById('btn-game-start-wrap').innerHTML = '<button class="btn-game-start" onclick="startGame()">🎮 Oyun</button>';
    updateLockBtn();
  }
  renderMembers(members);
  addMsg(null, 'Odaya katıldın 🎉 Kod: ' + state.roomCode, true);
}

function updateLockBtn() {
  const btn = document.getElementById('btn-lock');
  if (btn) { btn.textContent = roomLocked ? '🔐 Kilidi Aç' : '🔓 Kilitle'; btn.classList.toggle('active', roomLocked); }
}

// ——— SABİTLENMİŞ MESAJ ———
function showPinned(pinnedMsg) {
  document.getElementById('pinned-msg').classList.add('show');
  document.getElementById('pinned-text').textContent = pinnedMsg.text;
  document.getElementById('pinned-who').textContent = pinnedMsg.username + ' tarafından sabitlendi';
  const unpin = document.getElementById('btn-unpin');
  unpin.style.display = (state.isHost || state.isMod) ? 'block' : 'none';
}

function hidePinned() {
  document.getElementById('pinned-msg').classList.remove('show');
}

function unpinMsg() {
  socket.emit('pin-msg', { msgId: null, text: null, username: null });
}

function pinMsg(msgId, text, username) {
  socket.emit('pin-msg', { msgId, text, username });
}

// ——— ÜYELER ———
function renderMembers(members) {
  document.getElementById('member-count').textContent = members.length;
  const el = document.getElementById('members-list');
  el.innerHTML = '';
  members.forEach(m => {
    const div = document.createElement('div');
    div.className = 'member-item';
    const isMe = m.username === state.username;
    const canManage = (state.isHost || state.isMod) && !isMe && !m.isHost;
    div.innerHTML = `
      <div class="avatar" style="background:${m.avatarColor || '#8b7cf8'}">${m.username.slice(0,2).toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name" style="color:${m.usernameColor || 'var(--text)'}">${esc(m.username)}${isMe ? ' <span style="color:var(--muted);font-size:10px">(sen)</span>' : ''}</div>
        <div class="member-tags">
          ${m.isHost ? '<span class="mtag host">👑</span>' : ''}
          ${m.isMod ? '<span class="mtag mod">🛡️</span>' : ''}
          ${m.muted ? '<span class="mtag muted">🔇</span>' : ''}
        </div>
      </div>
      ${canManage ? `
        <div class="member-actions">
          <button class="action-btn mute" onclick="muteMember('${m.id}')">${m.muted ? '🔊' : '🔇'}</button>
          ${state.isHost ? `
            <button class="action-btn mod" onclick="setMod('${m.id}')">${m.isMod ? '🛡-' : '🛡+'}</button>
            <button class="action-btn transfer" onclick="transferHost('${m.id}','${esc(m.username)}')">👑</button>
          ` : ''}
          <div class="ban-menu">
            <button class="action-btn ban" onclick="toggleBanMenu('${m.id}')">🚫</button>
            <div class="ban-dropdown" id="ban-${m.id}">
              <div class="ban-option" onclick="banMember('${m.id}',30)">30 dakika</div>
              <div class="ban-option" onclick="banMember('${m.id}',60)">1 saat</div>
              <div class="ban-option" onclick="banMember('${m.id}',1440)">1 gün</div>
            </div>
          </div>
          <button class="action-btn kick" onclick="kickMember('${m.id}','${esc(m.username)}')">At</button>
        </div>` : ''}
    `;
    el.appendChild(div);
  });
}

function toggleBanMenu(id) {
  document.querySelectorAll('.ban-dropdown').forEach(d => { if (d.id !== 'ban-' + id) d.classList.remove('show'); });
  document.getElementById('ban-' + id)?.classList.toggle('show');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ban-menu')) document.querySelectorAll('.ban-dropdown').forEach(d => d.classList.remove('show'));
});

function kickMember(id, u) { if (!confirm(u + ' kişisini atmak istiyor musun?')) return; socket.emit('kick-member', { targetId: id }); }
function banMember(id, d) { if (!confirm(d + ' dakika banlamak istiyor musun?')) return; socket.emit('ban-member', { targetId: id, duration: d }); }
function muteMember(id) { socket.emit('mute-member', { targetId: id }); }
function setMod(id) { socket.emit('set-mod', { targetId: id }); }
function transferHost(id, u) { if (!confirm(u + ' kişisine sahipliği devret?')) return; socket.emit('transfer-host', { targetId: id }); state.isHost = false; document.getElementById('badge-host').style.display = 'none'; document.getElementById('host-controls').style.display = 'none'; document.getElementById('sync-bar').style.display = 'flex'; document.getElementById('host-room-actions').style.display = 'none'; }

// ——— KUYRUK ———
function addToQueue() {
  const url = document.getElementById('queue-url').value.trim();
  if (!url || !detectType(url)) { showToast('Geçerli bir video linki gir!'); return; }
  socket.emit('queue-add', { url });
  document.getElementById('queue-url').value = '';
}
function playNext() { socket.emit('queue-next'); }
function renderQueue(queue) {
  document.getElementById('queue-count').textContent = queue.length;
  const list = document.getElementById('queue-list');
  list.innerHTML = '';
  queue.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.innerHTML = `
      <span style="color:var(--accent);font-size:11px;font-weight:700">${i+1}</span>
      <span class="queue-item-url">${esc(item.url)}</span>
      <span style="font-size:10px;color:var(--muted)">${esc(item.addedBy)}</span>
      ${(state.isHost || state.isMod) ? `<button class="btn-queue-remove" onclick="removeFromQueue(${i})">✕</button>` : ''}
    `;
    list.appendChild(div);
  });
}
function removeFromQueue(i) { socket.emit('queue-remove', { index: i }); }

// ——— VİDEO ———
function getYouTubeId(url) { const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
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
  if (!url || !detectType(url)) { document.getElementById('err-video').textContent = 'Geçerli link gir'; showErr('err-video', true); return; }
  showErr('err-video', false);
  socket.emit('load-video', { url });
}

function renderVideo(url) {
  document.getElementById('video-placeholder').style.display = 'none';
  const btn = document.getElementById('fullscreen-btn');
  btn.style.display = 'flex';
  const yt = document.getElementById('yt-frame');
  const mp4El = document.getElementById('mp4-player');
  yt.style.display = 'none'; yt.src = '';
  mp4El.style.display = 'none'; mp4El.src = '';
  const type = detectType(url);
  if (type === 'youtube') { yt.src = `https://www.youtube-nocookie.com/embed/${getYouTubeId(url)}?autoplay=1&enablejsapi=1`; yt.style.display = 'block'; }
  else if (type === 'kick') { yt.src = `https://player.kick.com/${getKickChannel(url)}`; yt.style.display = 'block'; }
  else if (type === 'twitch') { yt.src = `https://player.twitch.tv/?channel=${getTwitchChannel(url)}&parent=${window.location.hostname}&autoplay=true`; yt.style.display = 'block'; }
  else if (type === 'mp4') { mp4El.src = url; mp4El.style.display = 'block'; attachMp4Events(mp4El); }
}

function updateVideoTitle(url) {
  const bar = document.getElementById('video-title-bar');
  const type = detectType(url);
  const titles = { youtube: '▶ YouTube', kick: '🟢 Kick: ' + getKickChannel(url), twitch: '🟣 Twitch: ' + getTwitchChannel(url), mp4: '🎬 ' + url.split('/').pop().split('?')[0] };
  bar.textContent = titles[type] || '';
  bar.classList.toggle('show', !!titles[type]);
}

function toggleFullscreen() {
  const wrapper = document.querySelector('.video-wrapper');
  if (!document.fullscreenElement) { wrapper.requestFullscreen?.(); document.getElementById('fullscreen-btn').textContent = '✕'; }
  else { document.exitFullscreen?.(); document.getElementById('fullscreen-btn').textContent = '⛶'; }
}

function attachMp4Events(mp4) {
  if (mp4._eventsAttached) return;
  mp4._eventsAttached = true;
  mp4.addEventListener('play', () => { if ((!state.isHost && !state.isMod) || mp4Syncing) return; socket.emit('video-play', { currentTime: mp4.currentTime }); });
  mp4.addEventListener('pause', () => { if ((!state.isHost && !state.isMod) || mp4Syncing) return; socket.emit('video-pause', { currentTime: mp4.currentTime }); });
  mp4.addEventListener('seeked', () => { if ((!state.isHost && !state.isMod) || mp4Syncing) return; socket.emit('video-seek', { currentTime: mp4.currentTime }); });
}

// ——— OYUN ———
function startGame() { socket.emit('game-start'); }
function stopGame() { socket.emit('game-stop'); }
function guessWord() { const inp = document.getElementById('game-input'); const g = inp.value.trim(); if (!g) return; socket.emit('game-guess', { guess: g }); inp.value = ''; }
function getHint() { socket.emit('game-hint'); }

// ——— SOHBET ———
function onTyping() { clearTimeout(typingTimer); socket.emit('typing'); typingTimer = setTimeout(() => {}, 2000); }

function sendChat() {
  if (state.isMuted) { showToast('🔇 Susturuldunuz!'); return; }
  const inp = document.getElementById('chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  socket.emit('chat-msg', { msg });
  inp.value = '';
}

function addMsg(who, msg, sys = false, msgId = null, reactions = {}) {
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  if (msgId) div.setAttribute('data-msg-id', msgId);
  const t = new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0');
  const canManage = (state.isHost || state.isMod) && msgId;

  if (sys) {
    div.innerHTML = `<span class="chat-sys">${esc(msg)}</span>`;
  } else {
    const reactionsHtml = Object.entries(reactions).map(([emoji, users]) =>
      `<span class="reaction-badge" data-emoji="${emoji}" title="${Array.isArray(users) ? users.join(', ') : ''}">${emoji} <span class="react-count">${Array.isArray(users) ? users.length : 1}</span></span>`
    ).join('');
    div.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-who" style="color:var(--accent)">${esc(who)}</span>
        <span class="chat-time">${t}</span>
      </div>
      <div class="chat-text">${esc(msg)}</div>
      <div class="msg-reactions">${reactionsHtml}</div>
      <div class="msg-actions">
        <div style="position:relative">
          <button class="msg-react-btn" onclick="toggleEmojiPicker('${msgId}',this)">😊</button>
          <div class="emoji-picker" id="emoji-${msgId}">
            ${EMOJIS.map(e => `<span class="emoji-opt" onclick="reactMsg('${msgId}','${e}')">${e}</span>`).join('')}
          </div>
        </div>
        ${canManage ? `<button class="msg-pin-btn" onclick="pinMsg('${msgId}','${esc(msg)}','${esc(who)}')">📌</button>` : ''}
        ${canManage ? `<button class="delete-msg-btn" onclick="deleteMsg('${msgId}')">✕</button>` : ''}
      </div>
    `;
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function toggleEmojiPicker(msgId, btn) {
  document.querySelectorAll('.emoji-picker').forEach(p => { if (p.id !== 'emoji-' + msgId) p.classList.remove('show'); });
  document.getElementById('emoji-' + msgId)?.classList.toggle('show');
}
document.addEventListener('click', (e) => { if (!e.target.closest('.msg-react-btn') && !e.target.closest('.emoji-picker')) document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('show')); });

function reactMsg(msgId, emoji) { socket.emit('react-msg', { msgId, emoji }); document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('show')); }
function deleteMsg(msgId) { socket.emit('delete-msg', { msgId }); }

// ——— YARDIMCILAR ———
function copyCode() { if (navigator.clipboard) navigator.clipboard.writeText(state.roomCode).catch(() => {}); showToast('✓ Kod kopyalandı: ' + state.roomCode); }
function leaveRoom() { location.reload(); }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2500); }
function showErr(id, show) { const el = document.getElementById(id); if (show) el.classList.add('show'); else el.classList.remove('show'); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

socket.emit('get-lobbies');
setInterval(() => socket.emit('get-lobbies'), 5000);

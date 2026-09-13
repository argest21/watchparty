const socket = io();

const COLORS = ['#8b7cf8','#f5c842','#ff5f57','#4ade80','#60a5fa','#f97316','#ec4899','#14b8a6'];
let state = { username: '', roomCode: '', isHost: false, isMod: false, isMuted: false, avatarColor: COLORS[0], usernameColor: COLORS[0] };
let mp4Syncing = false;
let pendingJoin = null;
let privateMode = false;
let typingTimer = null;
let gameHints = 0;
let openEmojiMsgId = null;

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
initColors();

function togglePrivate() {
  privateMode = !privateMode;
  document.getElementById('toggle-private').classList.toggle('on', privateMode);
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
      <div class="lobby-avatar" style="background:rgba(139,124,248,0.15);color:var(--purple)">${l.isPrivate ? '🔒' : l.host.slice(0,2).toUpperCase()}</div>
      <div class="lobby-info">
        <div class="lobby-name">${esc(l.name)}</div>
        <div class="lobby-meta">
          👥 ${l.memberCount}/${l.maxMembers}
          ${l.isPrivate ? '<span class="lobby-lock">🔒 Gizli</span>' : ''}
          ${isFull ? '<span class="lobby-full">🚫 Dolu</span>' : ''}
          ${l.hasVideo ? '<span class="lobby-live"><span class="lobby-live-dot"></span>Canlı</span>' : ''}
        </div>
      </div>
      <button class="btn-enter ${l.isPrivate ? 'locked' : ''}" ${isFull ? 'disabled' : ''} onclick="joinLobby('${l.code}',${l.isPrivate})">
        ${isFull ? 'Dolu' : l.isPrivate ? '🔑 Gir' : 'Katıl'}
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
  const u = getJoinUsername();
  if (!u) return;
  pendingJoin = { code, username: u };
  if (isPrivate) openModal(code);
  else socket.emit('join-room', { code, username: u, password: '', avatarColor: state.avatarColor, usernameColor: state.usernameColor });
}

function getJoinUsername() {
  const u = (document.getElementById('join-username')?.value || document.getElementById('home-username')?.value || '').trim();
  if (!u) { showErr('err-username', true); return null; }
  showErr('err-username', false);
  state.username = u;
  return u;
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
  document.getElementById('password-modal').cl

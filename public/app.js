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
socket.on('room-created', ({ code, members, name }) => {
  state.roomCode = code; state.isHost = true; enterRoom(members, name);
});

socket.on('room-joined', ({ code, members, video, playing, currentTime, messages, queue, name }) => {
  state.roomCode = code; state.isHost = false;
  closeModal(); enterRoom(members, name);
  if (messages) messages.forEach(m => addMsg(m.username, m.msg, false, m.id, m.reactions || {}));
  if (queue) renderQueue(queue);
  if (video) {
    renderVideo(video);
    const mp4 = document.getElementById('mp4-player');
    if (mp4.style.display !== 'none') { mp4.currentTime = currentTime || 0; if (playing) mp4.play(); }
  }
});

socket.on('error-msg', (msg) => {
  if (msg === 'Şifre gerekli') { openModal(pendingJoin ? pendingJoin.code : ''); return; }
  if (msg === 'Yanlış şifre!') {
    if (!document.getElementById('password-modal').classList.contains('show')) openModal(pendingJoin ? pendingJoin.code : '');
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
  document.getElementById('btn-queue-next').style.display = 'inline-flex';
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

socket.on('video-loaded', ({ url }) => {
  renderVideo(url);
  if (!state.isHost && !state.isMod) { document.getElementById('sync-text').textContent = 'Senkronize ✓'; addMsg(null, 'Video başlatıldı 🎬', true); }
  updateVideoTitle(url);
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
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) el.remove();
});

socket.on('msg-reaction', ({ msgId, emoji, username }) => {
  const msgEl = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (!msgEl) return;
  let reactionsEl = msgEl.querySelector('.msg-reactions');
  if (!reactionsEl) { reactionsEl = document.createElement('div'); reactionsEl.className = 'msg-reactions'; msgEl.appendChild(reactionsEl); }
  let badge = reactionsEl.querySelector(`[data-emoji="${emoji}"]`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'reaction-badge';
    badge.setAttribute('data-emoji', emoji);
    badge.innerHTML = `${emoji} <span class="react-count">1</span>`;
    badge.title = username;
    reactionsEl.appendChild(badge);
  } else {
    const cnt = badge.querySelector('.react-count');
    cnt.textContent = parseInt(cnt.textContent) + 1;
    badge.title += ', ' + username;
  }
});

socket.on('user-typing', ({ username }) => {
  const el = document.getElementById('typing-indicator');
  el.textContent = username + ' yazıyor...';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ''; }, 2500);
});

// Oyun
socket.on('game-started', ({ masked, length, hints }) => {
  gameHints = hints;
  document.getElementById('game-section').classList.add('show');
  document.getElementById('game-word').textContent = masked;
  document.getElementById('game-info').textContent = `${length} harfli kelime · ${hints} ipucu hakkı`;
  document.getElementById('btn-hint').textContent = `💡 İpucu (${hints})`;
  if (state.isHost) document.getElementById('btn-game-stop').style.display = 'inline-flex';
});
socket.on('game-update', ({ masked, hints }) => {
  document.getElementById('game-word').textContent = masked;
  document.getElementById('btn-hint').textContent = `💡 İpucu (${hints})`;
  document.getElementById('game-info').textContent = document.getElementById('game-info').textContent.replace(/\d+ ipucu/, hints + ' ipucu');
});
socket.on('game-won', ({ winner, word }) => {
  document.getElementById('game-word').textContent = word.toUpperCase();
  document.getElementById('game-info').textContent = `🎉 ${winner} kazandı!`;
  setTimeout(() => { document.getElementById('game-section').classList.remove('show'); }, 4000);
});
socket.on('game-ended', () => {
  document.getElementById('game-section').classList.remove('show');
});

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
  if (state.isHost) {
    document.getElementById('placeholder-text').textContent = 'Video seç ve başlat';
    document.getElementById('placeholder-sub').textContent = 'YouTube, Kick, Twitch veya MP4 linki yapıştır';
    document.getElementById('btn-queue-next').style.display = 'inline-flex';
    const wrap = document.getElementById('btn-game-start-wrap');
    wrap.innerHTML = '<button class="btn-game-start" onclick="startGame()">🎮 Oyun Başlat</button>';
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
    const canManage = (state.isHost || state.isMod) && !isMe && !m.isHost;
    div.innerHTML = `
      <div class="avatar" style="background:${m.avatarColor || '#8b7cf8'}">${m.username.slice(0,2).toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name" style="color:${m.usernameColor || '#f0f0f5'}">${esc(m.username)}${isMe ? ' <span style="color:var(--muted);font-size:10px">(sen)</span>' : ''}</div>
        <div class="member-tags">
          ${m.isHost ? '<span class="mtag host">👑 Sahip</span>' : ''}
          ${m.isMod ? '<span class="mtag mod">🛡️ Mod</span>' : ''}
          ${m.muted ? '<span class="mtag muted">🔇</span>' : ''}
        </div>
      </div>
      ${canManage ? `
        <div class="member-actions">
          <button class="action-btn mute" onclick="muteMember('${m.id}')">${m.muted ? '🔊' : '🔇'}</button>
          ${state.isHost ? `
            <button class="action-btn mod" onclick="setMod('${m.id}')">${m.isMod ? '🛡️-' : '🛡️+'}</button>
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
document.addEventListener('click', (e) => { if (!e.target.closest('.ban-menu')) document.querySelectorAll('.ban-dropdown').forEach(d => d.classList.remove('show')); });

function kickMember(targetId, username) { if (!confirm(username + ' kişisini atmak istiyor musun?')) return; socket.emit('kick-member', { targetId }); }
function banMember(targetId, duration) { if (!confirm(duration + ' dakika banlamak istiyor musun?')) return; socket.emit('ban-member', { targetId, duration }); }
function muteMember(targetId) { socket.emit('mute-member', { targetId }); }
function setMod(targetId) { socket.emit('set-mod', { targetId }); }
function transferHost(targetId, username) { if (!confirm(username + ' kişisine oda sahipliğini devretmek istiyor musun?')) return; socket.emit('transfer-host', { targetId }); state.isHost = false; document.getElementById('badge-host').style.display = 'none'; document.getElementById('host-controls').style.display = 'none'; document.getElementById('sync-bar').style.display = 'flex'; }

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
      <span style="color:var(--purple);font-size:11px;font-weight:700">${i+1}</span>
      <span class="queue-item-url">${esc(item.url)}</span>
      <span style="font-size:10px;color:var(--muted)">${esc(item.addedBy)}</span>
      ${state.isHost || state.isMod ? `<button class="btn-queue-remove" onclick="removeFromQueue(${i})">✕</button>` : ''}
    `;
    list.appendChild(div);
  });
}

function removeFromQueue(index) { socket.emit('queue-remove', { index }); }

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
  document.getElementById('fullscreen-btn').style.display = 'flex';
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
  let title = '';
  if (type === 'youtube') title = '▶ YouTube videosu';
  else if (type === 'kick') title = '🟢 Kick: ' + getKickChannel(url);
  else if (type === 'twitch') title = '🟣 Twitch: ' + getTwitchChannel(url);
  else if (type === 'mp4') title = '🎬 ' + url.split('/').pop().split('?')[0];
  bar.textContent = title;
  bar.classList.toggle('show', !!title);
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
function guessWord() {
  const inp = document.getElementById('game-input');
  const guess = inp.value.trim();
  if (!guess) return;
  socket.emit('game-guess', { guess });
  inp.value = '';
}
function getHint() { socket.emit('game-hint'); }

// ——— SOHBET ———
function onTyping() {
  clearTimeout(typingTimer);
  socket.emit('typing');
  typingTimer = setTimeout(() => {}, 2000);
}

function sendChat() {
  if (state.isMuted) { showToast('🔇 Susturuldunuz!'); return; }
  const inp = document.getElementById('chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  socket.emit('chat-msg', { msg });
  inp.value = '';
}

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥'];

function addMsg(who, msg, sys = false, msgId = null, reactions = {}) {
  const box = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  if (msgId) div.setAttribute('data-msg-id', msgId);
  const t = new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0');

  if (sys) {
    div.innerHTML = `<span class="chat-sys">${esc(msg)}</span>`;
  } else {
    const canDelete = (state.isHost || state.isMod) && msgId;
    const reactionsHtml = Object.entries(reactions).map(([emoji, users]) =>
      `<span class="reaction-badge" data-emoji="${emoji}" title="${users.join(', ')}">${emoji} <span class="react-count">${users.length}</span></span>`
    ).join('');

    div.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-who" style="color:var(--purple)">${esc(who)}</span>
        <span class="chat-time">${t}</span>
      </div>
      <div class="chat-text">${esc(msg)}</div>
      ${reactionsHtml ? `<div class="msg-reactions">${reactionsHtml}</div>` : '<div class="msg-reactions"></div>'}
      <div class="msg-actions">
        <div style="position:relative">
          <button class="msg-react-btn" onclick="toggleEmojiPicker('${msgId}',this)">😊</button>
          <div class="emoji-picker" id="emoji-${msgId}">
            ${EMOJIS.map(e => `<span class="emoji-opt" onclick="reactMsg('${msgId}','${e}')">${e}</span>`).join('')}
          </div>
        </div>
        ${canDelete ? `<button class="delete-msg-btn" onclick="deleteMsg('${msgId}')">✕</button>` : ''}
      </div>
    `;
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function toggleEmojiPicker(msgId, btn) {
  const picker = document.getElementById('emoji-' + msgId);
  if (!picker) return;
  document.querySelectorAll('.emoji-picker').forEach(p => { if (p.id !== 'emoji-' + msgId) p.classList.remove('show'); });
  picker.classList.toggle('show');
}
document.addEventListener('click', (e) => { if (!e.target.closest('.msg-react-btn') && !e.target.closest('.emoji-picker')) document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('show')); });

function reactMsg(msgId, emoji) {
  socket.emit('react-msg', { msgId, emoji });
  document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('show'));
}

function deleteMsg(msgId) { socket.emit('delete-msg', { msgId }); }

// ——— YARDIMCILAR ———
function copyCode() { if (navigator.clipboard) navigator.clipboard.writeText(state.roomCode).catch(() => {}); showToast('✓ Kod kopyalandı: ' + state.roomCode); }
function leaveRoom() { location.reload(); }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2500); }
function showErr(id, show) { const el = document.getElementById(id); if (show) el.classList.add('show'); else el.classList.remove('show'); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

socket.emit('get-lobbies');
setInterval(() => socket.emit('get-lobbies'), 5000);

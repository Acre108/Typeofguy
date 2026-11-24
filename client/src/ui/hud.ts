// The in-game HUD: room card, pebble counter, dock, chat (log + speech bubbles),
// view controls, the decorate drawer and the item toolbar.

import { FURNITURE, MATERIALS_LIST } from '../../../shared/catalogue';
import { CHAT_MAX } from '../../../shared/protocol';
import type { Access, ChatMessage } from '../../../shared/types';
import { app } from '../app';
import { isMuted, setMuted, sfx } from '../audio';
import { net } from '../net';
import { swatch, thumbInto } from '../render/thumbs';
import { state } from '../state';
import { openAvatarEditor } from './avatarEditor';
import { btn, confirmBox, h, icon, modal, toast } from './dom';
import { openCatalogue, openPlay, togglePanel } from './panels';

let overlay: HTMLElement;
const bubbles = new Map<string, HTMLElement>(); // userId → stack element
const tags = new Map<string, HTMLElement>();

export function buildHud(root: HTMLElement, onLogout: () => void) {
  overlay = h('div', { class: 'overlay' });

  // ---------------------------------------------------------------- top left: room card
  const roomName = h('div', { class: 'room-name' });
  const roomOwner = h('div', { class: 'room-owner' });
  const access = h('span', { class: 'chip' });
  const settingsBtn = btn(icon('gear', 18), () => openRoomSettings(), 'icon-btn ghost small', { 'aria-label': 'Room settings', title: 'Room settings' });
  const roomCard = h('div', { class: 'card room-card' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-dot' }), 'Pebble Court'),
    h('div', { class: 'row tight' }, roomName, settingsBtn),
    h('div', { class: 'row tight' }, roomOwner, access));

  const refreshRoom = () => {
    const r = state.room;
    if (!r) return;
    roomName.textContent = r.name;
    roomOwner.textContent = r.ownerId === state.you ? 'Your apartment' : `${r.ownerName}'s apartment`;
    access.textContent = { open: 'Open', friends: 'Friends only', locked: 'Locked' }[r.access];
    access.className = `chip access-${r.access}`;
    settingsBtn.style.display = state.isOwner ? '' : 'none';
    editBtn.style.display = state.isOwner ? '' : 'none';
  };

  // ---------------------------------------------------------------- top right: pebbles + account
  const pebbles = h('span', { class: 'pebble-count' }, '0');
  const soundBtn = btn(icon(isMuted() ? 'mute' : 'sound', 20), () => {
    setMuted(!isMuted());
    soundBtn.replaceChildren(icon(isMuted() ? 'mute' : 'sound', 20));
  }, 'icon-btn', { 'aria-label': 'Sound on or off', title: 'Sound' });
  const top = h('div', { class: 'top-right' },
    h('button', { class: 'card pebbles', title: 'Your pebbles — earn more in Play', onclick: () => { sfx.click(); openPlay(); } }, icon('pebble', 20), pebbles),
    btn(icon('shirt', 20), () => openAvatarEditor(), 'icon-btn', { 'aria-label': 'Change your look', title: 'Your look' }),
    btn([icon('users', 20), h('span', { class: 'badge', id: 'friend-badge' })], () => togglePanel('friends'), 'icon-btn', { 'aria-label': 'Friends', title: 'Friends' }),
    soundBtn,
    btn(icon('logout', 20), () => confirmBox('Sign out of Pebble Court?', 'Sign out', onLogout), 'icon-btn', { 'aria-label': 'Sign out', title: 'Sign out' }),
  );
  let lastTokens = -1;
  state.on('profile', (p) => {
    if (lastTokens >= 0 && p.tokens !== lastTokens) {
      pebbles.parentElement!.classList.remove('bump');
      void pebbles.offsetWidth;
      pebbles.parentElement!.classList.add('bump');
    }
    lastTokens = p.tokens;
    pebbles.textContent = p.tokens.toLocaleString();
    if (state.mode === 'edit') renderDrawer();
  });

  // ---------------------------------------------------------------- dock
  const editBtn = btn([icon('brush'), h('span', null, 'Decorate')], () => state.setMode(state.mode === 'edit' ? 'walk' : 'edit'), 'dock-btn accent');
  const dock = h('nav', { class: 'dock', 'aria-label': 'Main' },
    btn([icon('home'), h('span', null, 'Home')], () => { if (state.room?.id !== state.profile?.apartmentId) app.goHome(); else app.world.resetPan(); }, 'dock-btn'),
    btn([icon('door'), h('span', null, 'Visit')], () => togglePanel('directory'), 'dock-btn'),
    btn([icon('pin'), h('span', null, 'Guestbook')], () => togglePanel('guestbook'), 'dock-btn'),
    editBtn,
    btn([icon('bag'), h('span', null, 'Catalogue')], () => openCatalogue(), 'dock-btn'),
    btn([icon('star'), h('span', null, 'Play')], () => openPlay(), 'dock-btn'),
  );

  // ---------------------------------------------------------------- chat
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-label': 'Chat' });
  const logWrap = h('div', { class: 'card chat-panel' }, log);
  const input = h('input', { class: 'chat-input', maxLength: CHAT_MAX, placeholder: 'Say something nice…', 'aria-label': 'Chat message', enterKeyHint: 'send' }) as HTMLInputElement;
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await net.request('chat', { text }); } catch (e) { toast((e as Error).message, 'warn'); input.value = text; }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
    if (e.key === 'Escape') input.blur();
    e.stopPropagation();
  });
  const emote = (kind: 'wave' | 'dance' | 'stand') => net.request('emote', { kind }).catch((e) => toast(e.message, 'warn'));
  const chatbar = h('div', { class: 'chatbar card' },
    btn(icon('chat', 20), () => logWrap.classList.toggle('open'), 'icon-btn ghost', { 'aria-label': 'Show chat log', title: 'Chat log' }),
    input,
    btn(icon('send', 20), send, 'icon-btn primary', { 'aria-label': 'Send' }),
    h('span', { class: 'divider' }),
    btn(icon('wave', 20), () => emote('wave'), 'icon-btn ghost', { 'aria-label': 'Wave', title: 'Wave' }),
    btn(icon('music', 20), () => emote('dance'), 'icon-btn ghost', { 'aria-label': 'Dance', title: 'Dance' }),
    btn(icon('seat', 20), () => sitNearest(), 'icon-btn ghost', { 'aria-label': 'Sit', title: 'Sit on the nearest seat' }),
  );

  const addLine = (m: ChatMessage) => {
    if (!m.system && state.hidden(m.userId)) return;
    const line = h('div', { class: `chat-line ${m.system ? 'system' : ''}` },
      m.system ? null : h('button', { class: 'chat-name', onclick: () => openPlayerCard(m.userId, m.name) }, m.name),
      h('span', { class: 'chat-text' }, m.text),
      m.system || m.userId === state.you ? null : h('button', {
        class: 'chat-report', title: 'Report this message', 'aria-label': 'Report this message',
        onclick: () => openReport(m.userId, m.name, m),
      }, icon('flag', 14)));
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
    log.append(line);
    while (log.children.length > 150) log.firstChild!.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
  };
  state.on('chat', (m) => {
    addLine(m);
    if (!m.system && !state.hidden(m.userId)) { showBubble(m); if (m.userId !== state.you) sfx.blip(); }
  });

  // ---------------------------------------------------------------- view controls
  const view = h('div', { class: 'view-controls card' },
    btn(icon('rotL', 20), () => app.world.rotateView(-1), 'icon-btn ghost', { 'aria-label': 'Rotate view left', title: 'Rotate (Q)' }),
    btn(icon('rotR', 20), () => app.world.rotateView(1), 'icon-btn ghost', { 'aria-label': 'Rotate view right', title: 'Rotate (E)' }),
    btn(icon('plus', 20), () => app.world.zoomBy(1.2), 'icon-btn ghost', { 'aria-label': 'Zoom in' }),
    btn(icon('minus', 20), () => app.world.zoomBy(1 / 1.2), 'icon-btn ghost', { 'aria-label': 'Zoom out' }),
  );

  // ---------------------------------------------------------------- decorate drawer + toolbar
  const drawer = h('aside', { class: 'card drawer', 'aria-label': 'Decorate' });
  let drawerTab: 'items' | 'floor' | 'wall' = 'items';
  const toolbar = h('div', { class: 'item-toolbar card' });
  const placingHint = h('div', { class: 'placing-hint card' });

  function renderDrawer() {
    if (state.mode !== 'edit') { drawer.classList.remove('open'); return; }
    drawer.classList.add('open');
    const p = state.profile!;
    const tabs = h('div', { class: 'tabs' },
      ...(['items', 'floor', 'wall'] as const).map((t) => h('button', {
        class: `tab ${drawerTab === t ? 'on' : ''}`, onclick: () => { sfx.click(); drawerTab = t; renderDrawer(); },
      }, { items: 'Furniture', floor: 'Floor', wall: 'Walls' }[t])));
    let body: HTMLElement;
    if (drawerTab === 'items') {
      const owned = Object.entries(p.inventory).filter(([, n]) => n > 0);
      body = owned.length
        ? h('div', { class: 'grid inv-grid' }, ...owned.map(([id, n]) => {
          const img = h('img', { class: 'thumb', draggable: false }) as HTMLImageElement;
          thumbInto(img, id);
          const active = app.ctrl.placing?.def === id && !app.ctrl.placing.moving;
          return h('button', { class: `tile ${active ? 'on' : ''}`, title: FURNITURE[id]?.name, onclick: () => { app.ctrl.startPlacing(id); renderDrawer(); } },
            img, h('span', { class: 'tile-name' }, FURNITURE[id]?.name ?? id), h('span', { class: 'count' }, `×${n}`));
        }))
        : h('div', { class: 'empty' }, h('p', null, 'Everything you own is out on display.'), btn('Browse the catalogue', () => openCatalogue(), 'primary'));
    } else {
      const surface = drawerTab;
      const current = state.room?.layout[surface];
      body = h('div', { class: 'grid mat-grid' }, ...MATERIALS_LIST.filter((m) => m.surface === surface).map((m) => {
        const owns = p.materials.includes(m.id);
        return h('button', {
          class: `tile mat ${current === m.id ? 'on' : ''} ${owns ? '' : 'locked'}`, title: m.name,
          onclick: () => owns ? app.ctrl.applyMaterial(surface, m.id).then(renderDrawer) : openCatalogue('materials'),
        }, h('img', { class: 'swatch', src: swatch(m.id), alt: '' }), h('span', { class: 'tile-name' }, m.name),
        owns ? null : h('span', { class: 'count' }, m.price === null ? 'Earn' : `${m.price}`));
      }));
    }
    drawer.replaceChildren(
      h('div', { class: 'drawer-head' }, h('h2', null, 'Decorate'),
        btn([icon('undo', 18), 'Undo'], () => app.ctrl.undo(), 'small ghost', { disabled: !app.ctrl.canUndo, title: 'Undo (Ctrl+Z)' }),
        btn([icon('check', 18), 'Done'], () => state.setMode('walk'), 'small primary')),
      tabs, h('div', { class: 'drawer-body' }, body),
      h('div', { class: 'hint' }, 'Click an item to place it. Click placed items to move, turn or store them. Small things can stand on tables.'),
    );
  }

  function renderToolbar() {
    const c = app.ctrl;
    if (state.mode === 'edit' && c.placing) {
      const def = FURNITURE[c.placing.def];
      placingHint.replaceChildren(...[
        h('span', null, h('b', null, def?.name ?? ''), def?.kind === 'wall' ? ' — point at a wall' : ' — click a green spot'),
        def?.kind === 'floor' ? btn([icon('turn', 18), 'Turn'], () => c.rotate(), 'small', { title: 'Rotate (R)' }) : null,
        btn('Cancel', () => c.cancelPlacing(), 'small ghost', { title: 'Esc' })].filter((x): x is HTMLElement => !!x));
      placingHint.classList.add('show');
    } else placingHint.classList.remove('show');

    if (state.mode === 'edit' && c.selected && !c.placing) {
      const l = state.room!.layout;
      const it = c.selected.wall ? l.wallItems.find((w) => w.uid === c.selected!.uid) : l.items.find((i) => i.uid === c.selected!.uid);
      const def = it && FURNITURE[it.def];
      toolbar.replaceChildren(...[
        h('span', { class: 'toolbar-name' }, def?.name ?? ''),
        btn([icon('move', 18), 'Move'], () => c.startMoving(), 'small'),
        c.selected.wall ? null : btn([icon('turn', 18), 'Turn'], () => c.rotate(), 'small', { title: 'R' }),
        btn([icon('box', 18), 'Store'], () => c.pickupSelected(), 'small warn', { title: 'Delete' })].filter((x): x is HTMLElement => !!x));
      toolbar.classList.add('show');
    } else toolbar.classList.remove('show');
  }

  app.ctrl.onChange = () => { renderToolbar(); if (state.mode === 'edit') renderDrawer(); };

  state.on('mode', (m) => {
    document.body.classList.toggle('editing', m === 'edit');
    editBtn.classList.toggle('on', m === 'edit');
    renderDrawer();
    renderToolbar();
  });

  // ---------------------------------------------------------------- room changes
  state.on('room', () => {
    refreshRoom();
    for (const el of bubbles.values()) el.remove();
    bubbles.clear();
    for (const el of tags.values()) el.remove();
    tags.clear();
    for (const o of state.occupants.values()) addTag(o.userId, o.name);
    log.replaceChildren();
    addLine({ id: 'sys', userId: '', name: '', text: state.isOwner ? 'Welcome home.' : `You knocked and came into ${state.room!.name}.`, ts: Date.now(), system: true });
  });
  state.on('meta', refreshRoom);
  state.on('join', (o) => {
    addTag(o.userId, o.name);
    addLine({ id: 'j', userId: '', name: '', text: `${o.name} came in.`, ts: Date.now(), system: true });
    if (o.userId !== state.you) sfx.pop();
  });
  state.on('leave', (id) => {
    const name = tags.get(id)?.textContent;
    tags.get(id)?.remove(); tags.delete(id);
    bubbles.get(id)?.remove(); bubbles.delete(id);
    if (name) addLine({ id: 'l', userId: '', name: '', text: `${name} left.`, ts: Date.now(), system: true });
  });
  state.on('muted', () => { for (const [id, el] of tags) el.classList.toggle('muted', state.hidden(id)); });

  // ---------------------------------------------------------------- per-frame overlay positioning
  app.world.onFrame.push(() => {
    for (const [id, el] of tags) {
      const p = app.world.avatarScreen(id);
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      const stack = bubbles.get(id);
      if (stack) stack.style.transform = `translate(${p.x}px, ${p.y - 22}px) translate(-50%, -100%)`;
    }
    if (toolbar.classList.contains('show') && app.ctrl.selected) {
      const p = app.world.itemScreen(app.ctrl.selected.uid);
      if (p) toolbar.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -110%)`;
    }
  });

  // ---------------------------------------------------------------- keyboard
  window.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement)?.closest('input, textarea, select');
    if (typing || document.querySelector('.modal-back')) return;
    if (e.key === 'Enter') { input.focus(); e.preventDefault(); return; }
    if (e.key === 'q' || e.key === 'Q') app.world.rotateView(-1);
    if (e.key === 'e' || e.key === 'E') app.world.rotateView(1);
    if (e.key === '+' || e.key === '=') app.world.zoomBy(1.2);
    if (e.key === '-' || e.key === '_') app.world.zoomBy(1 / 1.2);
    if (state.mode !== 'edit') return;
    if (e.key === 'r' || e.key === 'R') app.ctrl.rotate();
    if (e.key === 'Escape') { if (!app.ctrl.cancelPlacing()) { if (app.ctrl.selected) app.ctrl.select(null); else state.setMode('walk'); } }
    if ((e.key === 'Delete' || e.key === 'Backspace') && app.ctrl.selected) app.ctrl.pickupSelected();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); app.ctrl.undo(); }
  });

  app.ctrl.onAvatarClick = (id) => {
    const o = state.occupants.get(id);
    if (o) openPlayerCard(id, o.name);
  };

  root.append(overlay, h('div', { class: 'top-left' }, roomCard), top, view, drawer, toolbar, placingHint,
    h('div', { class: 'bottom' }, logWrap, chatbar, dock));
  refreshRoom();
}

// ---------------------------------------------------------------- bubbles + tags
function addTag(id: string, name: string) {
  if (tags.has(id)) return;
  const el = h('div', { class: `name-tag ${id === state.you ? 'me' : ''} ${state.hidden(id) ? 'muted' : ''}` }, name);
  overlay.append(el);
  tags.set(id, el);
}

function showBubble(m: ChatMessage) {
  let stack = bubbles.get(m.userId);
  if (!stack) {
    stack = h('div', { class: 'bubble-stack' });
    overlay.append(stack);
    bubbles.set(m.userId, stack);
  }
  const b = h('div', { class: 'bubble' }, h('b', null, m.name), ' ', m.text);
  stack.append(b);
  while (stack.children.length > 3) stack.firstChild!.remove();
  setTimeout(() => b.classList.add('fade'), 7000);
  setTimeout(() => b.remove(), 7600);
}

function sitNearest() {
  const me = app.world.avatarTile(state.you);
  const layout = state.room?.layout;
  if (!me || !layout) return;
  let best: [number, number] | null = null, bestD = Infinity;
  for (const it of layout.items) {
    const def = FURNITURE[it.def];
    if (!def?.seat || it.parent) continue;
    const [w, d] = it.rot % 2 ? [def.size[1], def.size[0]] : def.size;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      const dist = Math.hypot(it.x + i - me[0], it.z + j - me[1]);
      if (dist < bestD) { bestD = dist; best = [it.x + i, it.z + j]; }
    }
  }
  if (!best) return toast('No seats here yet', 'info');
  net.request('move', { x: best[0], z: best[1], sit: true }).catch((e) => toast(e.message, 'warn'));
}

// ---------------------------------------------------------------- player card / report / settings
export function openPlayerCard(userId: string, name: string) {
  const me = userId === state.you;
  const body = h('div', { class: 'stack player-card' });
  const m = modal(name, body);
  if (me) {
    body.append(h('p', null, "That's you! Looking good."), btn([icon('shirt', 18), 'Change your look'], () => { m.close(); openAvatarEditor(); }, 'primary'));
    return;
  }
  const muted = state.muted.has(userId);
  const blocked = state.blocked.has(userId);
  body.append(
    h('div', { class: 'row wrap' },
      btn([icon('heart', 18), 'Add friend'], async () => {
        try { const r = await net.request('friends.request', { username: name }); toast(r.message, 'good'); } catch (e) { toast((e as Error).message, 'warn'); }
      }, 'primary'),
      btn([icon(muted ? 'sound' : 'mute', 18), muted ? 'Unmute' : 'Mute'], () => {
        state.toggleMute(userId);
        toast(state.muted.has(userId) ? `${name} is muted — you won't see their chat` : `${name} is unmuted`);
        m.close();
      }),
    ),
    h('div', { class: 'row wrap' },
      btn([icon('flag', 18), 'Report'], () => { m.close(); openReport(userId, name); }, 'ghost'),
      blocked
        ? btn('Unblock', async () => { const r = await net.request('safety.unblock', { userId }); state.blocked = new Set(r.blocked); state.emit('muted', state.muted); m.close(); toast(`${name} is unblocked`); }, 'ghost')
        : btn('Block', () => confirmBox(`Block ${name}? You won't see each other's chat or notes, and they can't visit your apartment.`, 'Block', async () => {
          const r = await net.request('safety.block', { userId });
          state.blocked = new Set(r.blocked);
          state.emit('muted', state.muted);
          m.close();
          toast(`${name} is blocked`);
        }), 'ghost warn-text'),
      state.isOwner ? btn([icon('door', 18), 'Ask to leave'], () => confirmBox(`Ask ${name} to leave your apartment? They won't be able to come back for 10 minutes.`, 'Ask to leave', async () => {
        try { await net.request('safety.kick', { userId }); m.close(); } catch (e) { toast((e as Error).message, 'warn'); }
      }), 'ghost warn-text') : null,
    ),
  );
}

export function openReport(userId: string, name: string, message?: ChatMessage) {
  const reasons = ['Rude or hurtful', 'Spam', 'Inappropriate name or content', 'Something else'];
  let reason = reasons[0];
  const details = h('textarea', { maxLength: 300, rows: 3, placeholder: 'Anything else we should know? (optional)' }) as HTMLTextAreaElement;
  const body = h('div', { class: 'stack' },
    message ? h('blockquote', { class: 'quote' }, `“${message.text}”`) : null,
    h('div', { class: 'row wrap' }, ...reasons.map((r) => {
      const b = h('button', { class: `chip-btn ${r === reason ? 'on' : ''}`, onclick: () => { reason = r; body.querySelectorAll('.chip-btn').forEach((c) => c.classList.toggle('on', c.textContent === r)); } }, r);
      return b;
    })),
    details,
  );
  const m = modal(`Report ${name}`, body);
  body.append(h('div', { class: 'row end' }, btn('Cancel', () => m.close(), 'ghost'), btn('Send report', async () => {
    try {
      await net.request('safety.report', { userId, reason, messageId: message?.id, text: [message?.text, details.value].filter(Boolean).join(' | ') });
      m.close();
      toast('Thanks — your report has been sent. You can also mute or block them.', 'good');
    } catch (e) { toast((e as Error).message, 'warn'); }
  }, 'primary')));
}

function openRoomSettings() {
  const r = state.room;
  if (!r || !state.isOwner) return;
  const name = h('input', { value: r.name, maxLength: 32, 'aria-label': 'Room name' }) as HTMLInputElement;
  let access: Access = r.access;
  const opts: [Access, string, string][] = [
    ['open', 'Open', 'Anyone can drop by'],
    ['friends', 'Friends only', 'Only your friends can come in'],
    ['locked', 'Locked', 'Nobody but you'],
  ];
  const choices = h('div', { class: 'stack tight' }, ...opts.map(([a, label, sub]) => h('button', {
    class: `choice ${a === access ? 'on' : ''}`, dataset: { a },
    onclick: () => { access = a; choices.querySelectorAll('.choice').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.a === a)); },
  }, icon(a === 'locked' ? 'lock' : a === 'friends' ? 'users' : 'door', 20), h('span', null, h('b', null, label), h('small', null, sub)))));
  const body = h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, 'Name'), name), h('div', { class: 'field' }, h('span', null, 'Who can visit'), choices));
  const m = modal('Room settings', body);
  body.append(h('div', { class: 'row end' }, btn('Cancel', () => m.close(), 'ghost'), btn('Save', async () => {
    try { await net.request('room.settings', { name: name.value, access }); m.close(); toast('Saved', 'good'); } catch (e) { toast((e as Error).message, 'warn'); }
  }, 'primary')));
}


// Boot: sign in, connect, then wire network events → state → renderer and UI.

import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import type { ServerEvent } from '../../shared/protocol';
import { app } from './app';
import { Controller } from './controller';
import { net } from './net';
import { World } from './render/world';
import { state } from './state';
import { openAvatarEditor } from './ui/avatarEditor';
import { h, toast } from './ui/dom';
import { buildHud } from './ui/hud';
import { showLogin } from './ui/login';
import { showReward } from './ui/panels';

const root = document.getElementById('app')!;
const TOKEN_KEY = 'pc.token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

let started = false;

function handle(ev: ServerEvent) {
  switch (ev.t) {
    case 'welcome':
      state.blocked = new Set(ev.blocked);
      app.serverOffset = ev.serverTime - Date.now();
      state.setProfile(ev.profile);
      break;
    case 'profile': state.setProfile(ev.profile); break;
    case 'room.layout':
      if (state.room?.id === ev.roomId) { state.room.layout = ev.layout; state.emit('layout', ev.layout); }
      break;
    case 'room.meta':
      if (state.room?.id === ev.room.id) { state.room = { ...ev.room }; state.emit('meta', state.room); }
      break;
    case 'presence.join':
      state.occupants.set(ev.occupant.userId, ev.occupant);
      state.emit('join', ev.occupant);
      break;
    case 'presence.leave':
      state.occupants.delete(ev.userId);
      state.emit('leave', ev.userId);
      break;
    case 'avatar.move': {
      const o = state.occupants.get(ev.userId);
      if (o) { o.x = ev.path.at(-1)?.[0] ?? ev.from[0]; o.z = ev.path.at(-1)?.[1] ?? ev.from[1]; o.state = ev.sit ? 'sit' : 'stand'; }
      state.emit('move', { userId: ev.userId, from: ev.from, path: ev.path, startedAgo: 0, sit: ev.sit });
      break;
    }
    case 'avatar.emote': state.emit('emote', { userId: ev.userId, kind: ev.kind }); break;
    case 'avatar.look': {
      const o = state.occupants.get(ev.userId);
      if (o) o.avatar = ev.avatar;
      state.emit('look', { userId: ev.userId, avatar: ev.avatar });
      break;
    }
    case 'avatar.traits': {
      const o = state.occupants.get(ev.userId);
      if (o) o.traits = ev.traits;
      break;
    }
    case 'chat': state.addChat(ev.message); break;
    case 'guestbook.new': state.emit('guestbook', { kind: 'new', post: ev.post }); break;
    case 'guestbook.deleted': state.emit('guestbook', { kind: 'deleted', postId: ev.postId }); break;
    case 'friends.changed': state.emit('friends', null); break;
    case 'kicked':
      toast(`${ev.by} asked you to leave ${ev.roomName}. Heading home.`, 'warn');
      app.goHome();
      break;
    case 'notice': toast(ev.text, ev.tone ?? 'info'); break;
    case 'reward': showReward(ev.reward); break;
  }
}

function startGame() {
  root.replaceChildren();
  const stage = h('div', { id: 'stage' });
  const hud = h('div', { id: 'hud' });
  root.append(stage, hud);
  const world = new World(stage);
  const ctrl = new Controller(world, world.renderer.domElement);
  app.world = world;
  app.ctrl = ctrl;

  state.on('room', (room) => {
    world.clearAvatars();
    world.setRoom(state.shape!, room.layout);
    for (const o of state.occupants.values()) world.addAvatar(o, app.serverOffset);
  });
  state.on('layout', (l) => world.setLayout(l));
  state.on('join', (o) => world.addAvatar(o, app.serverOffset));
  state.on('leave', (id) => world.removeAvatar(id));
  state.on('move', (m) => world.moveAvatar(m.userId, m.from, m.path, m.startedAgo, m.sit));
  state.on('emote', (e) => world.emote(e.userId, e.kind));
  state.on('look', (l) => world.setLook(l.userId, l.avatar));

  buildHud(hud, logout);
}

async function connect(token: string) {
  try {
    await net.connect(token);
  } catch {
    setToken(null);
    showLogin(root, onToken, 'Your session has ended — please sign in again.');
    return;
  }
  setToken(token);
  // The welcome event arrives right after the socket opens.
  if (!state.profile) await new Promise<void>((resolve) => { const off = state.on('profile', () => { off(); resolve(); }); });
  if (!started) { started = true; startGame(); }
  await app.goTo(state.room?.id ?? state.profile!.apartmentId) || await app.goHome();
  if (state.profile?.isNew) openAvatarEditor(true);
}

function onToken(token: string) { connect(token); }

function logout() {
  const token = getToken();
  net.close();
  setToken(null);
  if (token) fetch('/api/logout', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
  location.reload();
}

net.on(handle);
net.onStatus = (s) => {
  if (s === 'reconnecting') toast('Connection lost — reconnecting…', 'warn');
  if (s === 'open' && started && state.room) app.goTo(state.room.id);
  if (s === 'replaced') {
    document.body.append(h('div', { class: 'modal-back' }, h('div', { class: 'modal' }, h('h2', null, 'Signed in elsewhere'),
      h('p', null, 'You opened Pebble Court in another tab or device.'), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Use it here'))));
  }
};

// Read-only handle for debugging and automated tests. The server validates
// everything, so exposing client state here grants nothing.
(window as any).pebble = { app, state };

const saved = getToken();
if (new URLSearchParams(location.search).has('showroom')) import('./showroom').then((m) => m.startShowroom(root));
else if (saved) connect(saved); else showLogin(root, onToken);

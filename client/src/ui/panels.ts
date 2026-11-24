// Side panels (directory, friends, guestbook) and the catalogue / play modals.

import { FURNITURE, FURNITURE_LIST, MATERIALS, MATERIALS_LIST, THEMES } from '../../../shared/catalogue';
import { GUESTBOOK_MAX } from '../../../shared/protocol';
import type { DirectoryEntry, GuestbookPost, QuizMeta, Reward, ThemeId } from '../../../shared/types';
import { app } from '../app';
import { sfx } from '../audio';
import { openMemory } from '../games/memory';
import { openQuiz } from '../games/quiz';
import { net } from '../net';
import { swatch, thumbInto } from '../render/thumbs';
import { state } from '../state';
import { btn, h, icon, modal, timeAgo, toast } from './dom';
import { openReport } from './hud';

type PanelName = 'directory' | 'friends' | 'guestbook';
let host: HTMLElement | null = null;
let current: PanelName | null = null;
let cleanup: (() => void) | null = null;

function ensureHost() {
  if (!host) {
    host = h('aside', { class: 'card side-panel', 'aria-live': 'polite' });
    document.getElementById('hud')!.append(host);
  }
  return host;
}

export function togglePanel(name: PanelName) {
  if (current === name) return closePanel();
  openPanel(name);
}

export function closePanel() {
  cleanup?.(); cleanup = null;
  current = null;
  host?.classList.remove('open');
}

function openPanel(name: PanelName) {
  cleanup?.(); cleanup = null;
  const el = ensureHost();
  current = name;
  el.classList.add('open');
  const titles = { directory: 'Visit someone', friends: 'Friends', guestbook: 'Guestbook' };
  const body = h('div', { class: 'panel-body' });
  el.replaceChildren(h('div', { class: 'panel-head' }, h('h2', null, titles[name]), btn(icon('close', 18), closePanel, 'icon-btn ghost', { 'aria-label': 'Close' })), body);
  if (name === 'directory') cleanup = renderDirectory(body);
  if (name === 'friends') cleanup = renderFriends(body);
  if (name === 'guestbook') cleanup = renderGuestbook(body);
}

// ---------------------------------------------------------------- directory
function renderDirectory(body: HTMLElement) {
  let entries: DirectoryEntry[] = [];
  let filter: 'all' | 'friends' | 'busy' = 'all';
  const search = h('input', { placeholder: 'Search by name…', 'aria-label': 'Search apartments' }) as HTMLInputElement;
  const list = h('div', { class: 'list' });
  const tabs = h('div', { class: 'tabs' });
  const draw = () => {
    tabs.replaceChildren(...(['all', 'busy', 'friends'] as const).map((f) => h('button', { class: `tab ${f === filter ? 'on' : ''}`, onclick: () => { filter = f; draw(); } }, { all: 'Everyone', busy: 'Busy now', friends: 'Friends' }[f])));
    const q = search.value.trim().toLowerCase();
    const shown = entries.filter((e) => (filter === 'all' || (filter === 'friends' ? e.isFriend : e.occupants > 0))
      && (!q || e.name.toLowerCase().includes(q) || e.ownerName.toLowerCase().includes(q)));
    list.replaceChildren(...(shown.length ? shown.map((e) => {
      const here = state.room?.id === e.roomId;
      const mine = e.ownerId === state.you;
      return h('div', { class: 'list-row' },
        h('div', { class: 'grow' },
          h('div', { class: 'row tight' }, h('b', null, e.name), e.isFriend ? h('span', { class: 'chip small friend' }, 'Friend') : null),
          h('small', { class: 'muted-text' }, mine ? 'Your place' : `${e.ownerName}${e.ownerOnline ? ' · home' : ''}`, ' · ',
            e.access === 'open' ? 'Open' : e.access === 'friends' ? 'Friends only' : 'Locked')),
        h('span', { class: `occ ${e.occupants ? 'busy' : ''}`, title: 'People inside' }, icon('users', 16), String(e.occupants)),
        here ? h('span', { class: 'chip small' }, 'Here') : btn('Visit', async () => { if (await app.goTo(e.roomId)) closePanel(); }, 'small primary', { disabled: e.access === 'locked' && !mine }));
    }) : [h('p', { class: 'empty' }, filter === 'friends' ? 'No friends’ apartments yet — add someone from their player card.' : 'Nobody matches that search.')]));
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => e.stopPropagation());
  const load = () => net.request('room.directory', {}).then((d) => { entries = d; draw(); }).catch((e) => toast(e.message, 'warn'));
  body.append(search, tabs, list, btn('Refresh', load, 'small ghost'));
  load();
  const t = setInterval(load, 15000);
  return () => clearInterval(t);
}

// ---------------------------------------------------------------- friends
function renderFriends(body: HTMLElement) {
  const nameInput = h('input', { placeholder: 'Add a friend by name', maxLength: 16, 'aria-label': 'Friend name' }) as HTMLInputElement;
  nameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); });
  const list = h('div', { class: 'stack' });
  const add = async () => {
    const n = nameInput.value.trim();
    if (!n) return;
    try { const r = await net.request('friends.request', { username: n }); toast(r.message, 'good'); nameInput.value = ''; load(); }
    catch (e) { toast((e as Error).message, 'warn'); }
  };
  const load = async () => {
    try {
      const d = await net.request('friends.list', {});
      const badge = document.getElementById('friend-badge');
      if (badge) badge.textContent = d.incoming.length ? String(d.incoming.length) : '';
      const sections: HTMLElement[] = [];
      if (d.incoming.length) sections.push(h('div', { class: 'section' }, h('h3', null, 'Requests'), ...d.incoming.map((r) => h('div', { class: 'list-row' },
        h('b', { class: 'grow' }, r.username),
        btn('Accept', async () => { await net.request('friends.respond', { userId: r.userId, accept: true }); sfx.chime(); load(); }, 'small primary'),
        btn('Decline', async () => { await net.request('friends.respond', { userId: r.userId, accept: false }); load(); }, 'small ghost')))));
      sections.push(h('div', { class: 'section' }, h('h3', null, `Friends (${d.friends.length})`),
        ...(d.friends.length ? d.friends.map((f) => h('div', { class: 'list-row' },
          h('span', { class: `dot ${f.online ? 'on' : ''}`, title: f.online ? 'Online' : 'Away' }),
          h('div', { class: 'grow' }, h('b', null, f.username), h('small', { class: 'muted-text' }, f.online ? (f.roomName ? ` · in ${f.roomName}` : ' · online') : ' · away')),
          f.roomId && f.roomId !== state.room?.id ? btn('Join', async () => { if (await app.goTo(f.roomId!)) closePanel(); }, 'small primary') : null,
          btn(icon('close', 14), async () => { await net.request('friends.remove', { userId: f.userId }); load(); }, 'icon-btn ghost small', { title: 'Remove friend', 'aria-label': `Remove ${f.username}` })))
          : [h('p', { class: 'muted-text' }, 'No friends yet. Say hello to someone and add them!')])));
      if (d.outgoing.length) sections.push(h('div', { class: 'section' }, h('h3', null, 'Waiting for a reply'), ...d.outgoing.map((r) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, r.username),
        btn('Cancel', async () => { await net.request('friends.remove', { userId: r.userId }); load(); }, 'small ghost')))));
      if (state.blocked.size) sections.push(h('div', { class: 'section' }, h('h3', null, 'Blocked'), h('p', { class: 'muted-text' }, `${state.blocked.size} player${state.blocked.size > 1 ? 's' : ''} blocked. Unblock from their player card.`)));
      list.replaceChildren(...sections);
    } catch (e) { toast((e as Error).message, 'warn'); }
  };
  body.append(h('div', { class: 'row tight' }, nameInput, btn('Add', add, 'small primary')), list);
  load();
  return state.on('friends', load);
}

// ---------------------------------------------------------------- guestbook
const NOTE_COLOURS = ['#fff3c4', '#ffd9cf', '#d8efd0', '#d6e8f7', '#e8dcf5', '#fbe0e8'];

function renderGuestbook(body: HTMLElement) {
  const room = state.room!;
  let colour = NOTE_COLOURS[Math.floor(Math.random() * NOTE_COLOURS.length)];
  const board = h('div', { class: 'pinboard' });
  const text = h('textarea', { maxLength: GUESTBOOK_MAX, rows: 3, placeholder: state.isOwner ? 'Pin a note for your visitors…' : `Leave ${room.ownerName} a note…`, 'aria-label': 'Note' }) as HTMLTextAreaElement;
  text.addEventListener('keydown', (e) => e.stopPropagation());
  const counter = h('small', { class: 'muted-text' }, `0/${GUESTBOOK_MAX}`);
  text.addEventListener('input', () => { counter.textContent = `${text.value.length}/${GUESTBOOK_MAX}`; });
  const swatches = h('div', { class: 'row tight' }, ...NOTE_COLOURS.map((c) => h('button', {
    class: `note-colour ${c === colour ? 'on' : ''}`, style: { background: c }, 'aria-label': 'Note colour',
    onclick: (e: MouseEvent) => { colour = c; swatches.querySelectorAll('.note-colour').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); },
  })));
  const post = async () => {
    if (text.value.trim().length < 2) return;
    try { await net.request('guestbook.post', { roomId: room.id, text: text.value, colour }); text.value = ''; counter.textContent = `0/${GUESTBOOK_MAX}`; sfx.place(); }
    catch (e) { toast((e as Error).message, 'warn'); }
  };
  let posts: GuestbookPost[] = [];
  const draw = () => {
    board.replaceChildren(...(posts.length ? posts.map((p, i) => {
      const canDelete = state.isOwner || p.authorId === state.you;
      return h('div', { class: 'note', style: { background: p.colour, '--tilt': `${((i * 37) % 7) - 3}deg` } as any },
        h('span', { class: 'note-pin' }),
        h('p', null, p.text),
        h('div', { class: 'note-foot' }, h('b', null, p.authorName), h('small', null, timeAgo(p.createdAt)),
          p.authorId !== state.you ? h('button', { class: 'note-act', title: 'Report', 'aria-label': 'Report note', onclick: () => openReport(p.authorId, p.authorName, { id: `gb${p.id}`, userId: p.authorId, name: p.authorName, text: p.text, ts: p.createdAt }) }, icon('flag', 14)) : null,
          canDelete ? h('button', { class: 'note-act', title: 'Remove note', 'aria-label': 'Remove note', onclick: async () => {
            try { await net.request('guestbook.delete', { postId: p.id }); } catch (e) { toast((e as Error).message, 'warn'); }
          } }, icon('trash', 14)) : null));
    }) : [h('p', { class: 'empty' }, state.isOwner ? 'No notes yet. When friends visit, their notes appear here.' : 'No notes yet — be the first to say hello!')]));
  };
  net.request('guestbook.list', { roomId: room.id }).then((p) => { posts = p; draw(); }).catch((e) => toast(e.message, 'warn'));
  body.append(
    h('div', { class: 'compose' }, text, h('div', { class: 'row' }, swatches, counter, btn([icon('pin', 16), 'Pin it'], post, 'small primary'))),
    board);
  const off1 = state.on('guestbook', (ev) => {
    if (ev.kind === 'new' && ev.post.roomId === room.id && !state.blocked.has(ev.post.authorId)) { posts.unshift(ev.post); draw(); }
    if (ev.kind === 'deleted') { posts = posts.filter((p) => p.id !== ev.postId); draw(); }
  });
  const off2 = state.on('room', () => closePanel());
  return () => { off1(); off2(); };
}

// ---------------------------------------------------------------- catalogue
export function openCatalogue(tab: ThemeId | 'materials' = 'cabin') {
  const body = h('div', { class: 'catalogue' });
  const m = modal('Catalogue', body, { wide: true });
  let active: ThemeId | 'materials' = tab;
  const draw = () => {
    const p = state.profile!;
    const tabs = h('div', { class: 'tabs big' },
      ...THEMES.map((t) => h('button', { class: `tab ${active === t.id ? 'on' : ''}`, style: { '--theme': t.colour } as any, onclick: () => { sfx.click(); active = t.id; draw(); } }, t.name)),
      h('button', { class: `tab ${active === 'materials' ? 'on' : ''}`, onclick: () => { sfx.click(); active = 'materials'; draw(); } }, 'Floors & walls'));
    let content: HTMLElement;
    if (active === 'materials') {
      content = h('div', { class: 'grid shop-grid' }, ...MATERIALS_LIST.map((mat) => {
        const owned = p.materials.includes(mat.id);
        return h('div', { class: `shop-card ${owned ? 'owned' : ''}` },
          h('img', { class: 'swatch big', src: swatch(mat.id), alt: '' }),
          h('b', null, mat.name), h('small', { class: 'muted-text' }, `${mat.surface === 'floor' ? 'Floor' : 'Wall'} · ${THEMES.find((t) => t.id === mat.theme)!.name}`),
          owned ? h('span', { class: 'chip small friend' }, 'Owned')
            : mat.price === null ? h('span', { class: 'chip small earn' }, mat.source?.label ?? 'Earned')
              : buyButton(mat.id, 'material', mat.price, draw));
      }));
    } else {
      const theme = THEMES.find((t) => t.id === active)!;
      const have = theme.items.filter((id) => p.collection.includes(id)).length;
      const bonus = FURNITURE[theme.bonus];
      const bonusImg = h('img', { class: 'thumb small' }) as HTMLImageElement;
      thumbInto(bonusImg, theme.bonus);
      const claimed = p.bonuses.includes(theme.id);
      content = h('div', { class: 'stack' },
        h('div', { class: 'set-progress', style: { '--theme': theme.colour } as any },
          bonusImg,
          h('div', { class: 'grow' },
            h('b', null, `${theme.name} set — ${have}/${theme.items.length} collected`),
            h('small', { class: 'muted-text' }, claimed ? `Complete! You unlocked the ${bonus.name}.` : `${theme.blurb} Collect them all to unlock the ${bonus.name}.`),
            h('div', { class: 'bar' }, h('span', { style: { width: `${(have / theme.items.length) * 100}%` } })))),
        h('div', { class: 'grid shop-grid' }, ...FURNITURE_LIST.filter((f) => f.theme === theme.id).map((f) => {
          const img = h('img', { class: 'thumb' }) as HTMLImageElement;
          thumbInto(img, f.id);
          const count = p.inventory[f.id] ?? 0;
          const everOwned = p.collection.includes(f.id);
          const action = f.price !== null ? buyButton(f.id, 'item', f.price, draw)
            : h('span', { class: `chip small earn ${everOwned ? 'got' : ''}` }, everOwned ? 'Collected' : f.source?.label ?? 'Earned');
          return h('div', { class: `shop-card ${everOwned ? 'collected' : ''}`, title: f.desc },
            img, h('b', null, f.name), h('small', { class: 'muted-text desc' }, f.desc),
            h('div', { class: 'row tight between' }, h('small', { class: 'muted-text' }, count ? `You have ${count}` : f.kind === 'wall' ? 'Wall item' : `${f.size[0]}×${f.size[1]}${f.small ? ' · fits on tables' : ''}`), action));
        })));
    }
    body.replaceChildren(tabs, content);
  };
  draw();
  const off = state.on('profile', draw);
  const origClose = m.close;
  m.close = () => { off(); origClose(); };
}

function buyButton(id: string, kind: 'item' | 'material', price: number, after: () => void) {
  const afford = (state.profile?.tokens ?? 0) >= price;
  return btn([icon('pebble', 16), String(price)], async () => {
    try {
      await net.request('shop.buy', { id, kind });
      sfx.coin();
      const name = kind === 'item' ? FURNITURE[id].name : MATERIALS[id].name;
      toast(`${name} is yours — find it in Decorate`, 'good');
      after();
    } catch (e) { toast((e as Error).message, 'warn'); }
  }, `small ${afford ? 'primary' : 'ghost'}`, { title: afford ? 'Buy' : 'Not enough pebbles yet — try a quiz or a game' });
}

// ---------------------------------------------------------------- play menu
export async function openPlay() {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted-text' }, 'Earn pebbles to spend in the catalogue. Perfect runs unlock items you can’t buy.'));
  const m = modal('Play', body, { wide: true });
  const grid = h('div', { class: 'grid play-grid' });
  body.append(grid);
  let quizzes: QuizMeta[] = [];
  try { quizzes = await net.request('quiz.list', {}); } catch (e) { toast((e as Error).message, 'warn'); }
  const p = state.profile!;
  const rewardThumb = (id?: string, mat?: string) => {
    if (id) { const img = h('img', { class: 'thumb small' }) as HTMLImageElement; thumbInto(img, id); return img; }
    if (mat) return h('img', { class: 'swatch small', src: swatch(mat), alt: '' });
    return null;
  };
  grid.append(
    h('div', { class: 'play-card game', style: { '--theme': '#6fa9c4' } as any },
      h('div', { class: 'play-kind' }, 'Minigame · 90 seconds'),
      h('h3', null, 'Tide Pool Pairs'),
      h('p', null, 'Turn over shells two at a time and match the pairs before the tide comes in. Clear it in 12 moves or fewer to win the Model Sailboat.'),
      h('div', { class: 'row between' }, h('div', { class: 'row tight' }, rewardThumb('sailboat'), h('small', null, p.collection.includes('sailboat') ? 'Sailboat collected' : 'Sailboat to win')),
        btn('Play', () => { m.close(); openMemory(); }, 'primary'))),
    ...quizzes.map((q) => {
      const theme = THEMES.find((t) => t.id === q.theme)!;
      const got = q.rewardItem ? p.collection.includes(q.rewardItem) : q.rewardMaterial ? p.materials.includes(q.rewardMaterial) : false;
      const prize = q.rewardItem ? FURNITURE[q.rewardItem]?.name : q.rewardMaterial ? MATERIALS[q.rewardMaterial]?.name : '';
      return h('div', { class: 'play-card', style: { '--theme': theme.colour } as any },
        h('div', { class: 'play-kind' }, `Quiz · ${q.questionCount} questions`),
        h('h3', null, q.title),
        h('p', null, q.blurb),
        h('div', { class: 'row between' }, h('div', { class: 'row tight' }, rewardThumb(q.rewardItem, q.rewardMaterial), h('small', null, got ? `${prize} collected` : `${prize} to win`)),
          btn('Start', () => { m.close(); openQuiz(q); }, 'primary')));
    }),
  );
}

// ---------------------------------------------------------------- rewards
export function showReward(r: Reward, onClose?: () => void) {
  const items = [...r.items, ...r.bonusItems];
  const body = h('div', { class: 'reward' },
    h('div', { class: 'confetti' }, ...Array.from({ length: 18 }, (_, i) => h('i', { style: { '--i': String(i) } as any }))),
    h('p', { class: 'reward-label' }, r.label),
    h('div', { class: 'reward-pebbles' }, icon('pebble', 34), `+${r.tokens}`),
    r.multiplier < 1 ? h('small', { class: 'muted-text' }, `Reduced to ${Math.round(r.multiplier * 100)}% for replaying quickly — try something different for full rewards.`) : null,
    ...items.map((id) => {
      const img = h('img', { class: 'thumb' }) as HTMLImageElement;
      thumbInto(img, id);
      const bonus = r.bonusItems.includes(id);
      return h('div', { class: 'reward-item' }, img, h('div', null, h('b', null, FURNITURE[id]?.name), h('small', null, bonus ? 'Set complete! Bonus item unlocked.' : 'New item — it’s in your Decorate drawer.')));
    }),
    ...r.materials.map((id) => h('div', { class: 'reward-item' }, h('img', { class: 'swatch big', src: swatch(id), alt: '' }), h('div', null, h('b', null, MATERIALS[id]?.name), h('small', null, 'New material unlocked.')))),
  );
  if (items.length || r.materials.length) sfx.chime(); else sfx.coin();
  const m = modal(r.tokens > 0 || items.length || r.materials.length ? 'Nicely done' : 'Thanks for playing', body, { onClose });
  body.append(h('div', { class: 'row end' },
    items.length || r.materials.length ? btn('Decorate now', () => { m.close(); if (state.room?.id !== state.profile?.apartmentId) app.goHome().then(() => state.setMode('edit')); else state.setMode('edit'); }, 'ghost') : null,
    btn('Lovely', () => m.close(), 'primary')));
}

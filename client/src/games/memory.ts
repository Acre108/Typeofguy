// Tide Pool Pairs: a 90-second memory game. The server deals the cards and
// reveals faces one flip at a time, so the layout can't be peeked from the client.

import { sfx } from '../audio';
import { net } from '../net';
import { btn, h, modal, toast } from '../ui/dom';
import { showReward } from '../ui/panels';

// Eight simple sea-themed icons drawn for this game.
const FACES: { colour: string; svg: string; name: string }[] = [
  { name: 'starfish', colour: '#ec9a86', svg: '<path d="M32 10l6 14 15 1-11.5 10 3.5 15L32 42l-13 8 3.5-15L11 25l15-1z" />' },
  { name: 'shell', colour: '#f2bcc4', svg: '<path d="M32 50 14 26a18 18 0 0 1 36 0z"/><path d="M32 50V22M32 50 22 24M32 50l10-26" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7"/>' },
  { name: 'fish', colour: '#86bccb', svg: '<ellipse cx="28" cy="32" rx="15" ry="10"/><path d="M42 32l12-9v18z"/><circle cx="22" cy="29" r="2.4" fill="#3a2f33"/>' },
  { name: 'pebble', colour: '#c8b5e6', svg: '<ellipse cx="32" cy="34" rx="18" ry="12"/><ellipse cx="26" cy="30" rx="6" ry="3" fill="#fff" opacity=".5"/>' },
  { name: 'drop', colour: '#a9d0ea', svg: '<path d="M32 12c8 12 14 19 14 26a14 14 0 0 1-28 0c0-7 6-14 14-26z"/>' },
  { name: 'sun', colour: '#f6d88a', svg: '<circle cx="32" cy="32" r="10"/><g stroke="#f6d88a" stroke-width="4" stroke-linecap="round"><path d="M32 12v5M32 47v5M12 32h5M47 32h5M18 18l3.5 3.5M42.5 42.5 46 46M18 46l3.5-3.5M42.5 21.5 46 18"/></g>' },
  { name: 'kelp', colour: '#a8c79e', svg: '<path d="M30 54c-6-8 6-12 0-20s6-12 0-20" fill="none" stroke="#a8c79e" stroke-width="6" stroke-linecap="round"/><ellipse cx="38" cy="24" rx="6" ry="3" transform="rotate(-30 38 24)"/><ellipse cx="24" cy="38" rx="6" ry="3" transform="rotate(30 24 38)"/>' },
  { name: 'crab-claw', colour: '#d98b67', svg: '<path d="M18 44c0-14 8-22 20-24l-4 9 10-2c0 12-10 19-26 17z"/><circle cx="34" cy="32" r="2" fill="#3a2f33"/>' },
];

function faceSvg(f: number) {
  const face = FACES[f];
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" fill="${face.colour}" aria-label="${face.name}">${face.svg}</svg>`;
}

export async function openMemory() {
  let session: Awaited<ReturnType<typeof net.request<'memory.start'>>>;
  try { session = await net.request('memory.start', {}); }
  catch (e) { toast((e as Error).message, 'warn'); return; }

  let finished = false;
  const body = h('div', { class: 'memory' });
  const m = modal('Tide Pool Pairs', body, {
    onClose: () => { if (!finished) { finished = true; net.request('memory.end', { sessionId: session.sessionId }).then((r) => showReward(r.reward)).catch(() => {}); } },
  });
  const timeBar = h('div', { class: 'bar timer' }, h('span'));
  const stats = h('div', { class: 'row between' }, h('span', { class: 'moves' }, 'Moves: 0'), h('span', { class: 'pairs' }, 'Pairs: 0/8'));
  const grid = h('div', { class: 'memory-grid', style: { gridTemplateColumns: `repeat(${session.cols}, 1fr)` } });
  const cards: HTMLButtonElement[] = [];
  let open: number[] = [];
  let busy = false;
  const start = performance.now();

  const finish = (reward?: import('../../../shared/types').Reward) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    setTimeout(() => { m.close(); if (reward) showReward(reward); }, 700);
  };

  for (let i = 0; i < session.cards; i++) {
    const card = h('button', { class: 'mcard', 'aria-label': `Card ${i + 1}` },
      h('span', { class: 'minner' }, h('span', { class: 'mback' }), h('span', { class: 'mface' }))) as HTMLButtonElement;
    card.addEventListener('click', async () => {
      if (busy || finished || card.classList.contains('up') || card.classList.contains('done')) return;
      busy = true;
      try {
        const res = await net.request('memory.flip', { sessionId: session.sessionId, index: i });
        sfx.flip();
        (card.querySelector('.mface') as HTMLElement).innerHTML = faceSvg(res.face);
        card.classList.add('up');
        (stats.querySelector('.moves') as HTMLElement).textContent = `Moves: ${res.moves}`;
        (stats.querySelector('.pairs') as HTMLElement).textContent = `Pairs: ${res.pairs}/8`;
        if (res.pair) {
          const other = cards[res.pair.other];
          if (res.pair.match) {
            sfx.right();
            setTimeout(() => { card.classList.add('done'); other.classList.add('done'); }, 250);
            open = [];
          } else {
            open = [i, res.pair.other];
            await new Promise((r) => setTimeout(r, 750));
            for (const k of open) cards[k].classList.remove('up');
            open = [];
          }
        }
        if (res.done) finish(res.reward);
      } catch (e) { toast((e as Error).message, 'warn'); }
      busy = false;
    });
    cards.push(card);
    grid.append(card);
  }

  const timer = setInterval(() => {
    const left = Math.max(0, session.timeLimit - (performance.now() - start) / 1000);
    (timeBar.firstChild as HTMLElement).style.width = `${(left / session.timeLimit) * 100}%`;
    timeBar.classList.toggle('low', left < 15);
    if (left <= 0 && !finished) {
      net.request('memory.end', { sessionId: session.sessionId }).then((r) => finish(r.reward)).catch(() => finish());
    }
  }, 200);

  body.append(h('p', { class: 'muted-text' }, 'Match all eight pairs before the tide comes in. Fewer moves, bigger reward.'), timeBar, stats, grid,
    h('div', { class: 'row end' }, btn('Finish early', () => m.close(), 'ghost small')));
}

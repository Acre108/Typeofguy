// Minimal DOM helpers: element builder, toasts, modals and panels.

import { sfx } from '../audio';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, any>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** A chunky button with tactile squash + click sound. */
export function btn(label: Child | Child[], onClick: (e: MouseEvent) => void, cls = '', props: Props = {}) {
  return h('button', {
    class: `btn ${cls}`, type: 'button', ...props,
    onclick: (e: MouseEvent) => { sfx.click(); onClick(e); },
  }, ...(Array.isArray(label) ? label : [label]));
}

export function icon(name: keyof typeof ICONS, size = 22) {
  const span = h('span', { class: 'icon', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

// Simple line icons drawn for this project.
export const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v8.5h11V10"/><path d="M10.5 18.5v-4h3v4"/>',
  door: '<rect x="6" y="3.5" width="12" height="17" rx="2"/><circle cx="14.5" cy="12" r="1"/>',
  book: '<path d="M5 4.5h9a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h9"/>',
  brush: '<path d="M14 4.5 19.5 10l-7 7-5.5-5.5z"/><path d="M7 11.5 4.5 19.5 12.5 17"/>',
  bag: '<path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  smile: '<circle cx="12" cy="12" r="8"/><path d="M8.5 13.5a4 4 0 0 0 7 0"/><path d="M9.5 9.5h.01M14.5 9.5h.01"/>',
  users: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="8" r="2.5"/><path d="M15 13.6a4.8 4.8 0 0 1 6 4.9"/>',
  shirt: '<path d="M8 4.5 4 7l2 3.5 2-1v10h8v-10l2 1L20 7l-4-2.5a4 4 0 0 1-8 0z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6"/>',
  rotL: '<path d="M8 7H4.5V3.5"/><path d="M4.8 7A8 8 0 1 1 4 12"/>',
  rotR: '<path d="M16 7h3.5V3.5"/><path d="M19.2 7A8 8 0 1 0 20 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  turn: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  move: '<path d="M12 3.5v17M3.5 12h17"/><path d="m9 6 3-2.5L15 6M9 18l3 2.5 3-2.5M6 9l-2.5 3L6 15M18 9l2.5 3L18 15"/>',
  box: '<path d="M4 8.5 12 4.5l8 4v8l-8 4-8-4z"/><path d="M4 8.5l8 4 8-4M12 12.5v8"/>',
  flag: '<path d="M6 21V4.5"/><path d="M6 5h10l-2 3.5 2 3.5H6"/>',
  send: '<path d="M4.5 12 19.5 5l-4 14-3.5-5.5z"/><path d="M12 13.5 19.5 5"/>',
  chat: '<path d="M5 6.5h14v9H10l-4 3.5v-3.5H5z"/>',
  sound: '<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M5 9.5h3l4-3.5v12l-4-3.5H5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  pebble: '<ellipse cx="12" cy="13" rx="8" ry="6"/><path d="M8 11.5c1.5-1.5 4-2 6-1"/>',
  wave: '<path d="M7.5 12V6.5a1.5 1.5 0 0 1 3 0V11M10.5 10V5a1.5 1.5 0 0 1 3 0v5M13.5 10V6a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2l-2.3-3.4a1.5 1.5 0 0 1 2.4-1.8l1.4 1.7"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  seat: '<path d="M6 11V6.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V11"/><path d="M4.5 11h15v4h-15zM6.5 15v4.5M17.5 15v4.5"/>',
  logout: '<path d="M14 4.5H6.5v15H14"/><path d="M11 12h9M17 8.5l3.5 3.5-3.5 3.5"/>',
  heart: '<path d="M12 19.5s-7-4.2-7-9.5a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.3-7 9.5-7 9.5z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  pin: '<path d="M12 21v-6"/><path d="M8 4.5h8l-1 5 3 3H6l3-3z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
} as const;

// ---------------------------------------------------------------- toasts
let toastHost: HTMLElement | null = null;
export function toast(text: string, tone: 'info' | 'good' | 'warn' = 'info') {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const el = h('div', { class: `toast ${tone}` }, text);
  toastHost.append(el);
  if (tone === 'warn') sfx.nope();
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// ---------------------------------------------------------------- modals
export function modal(title: string, body: HTMLElement, opts: { wide?: boolean; onClose?: () => void; closable?: boolean } = {}) {
  const close = () => {
    back.classList.add('out');
    setTimeout(() => back.remove(), 180);
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && opts.closable !== false) close(); };
  const card = h('div', { class: `modal ${opts.wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title), opts.closable === false ? null : btn(icon('close', 18), close, 'icon-btn ghost', { 'aria-label': 'Close' })),
    body);
  const back = h('div', { class: 'modal-back', onclick: (e: MouseEvent) => { if (e.target === back && opts.closable !== false) close(); } }, card);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  return { close, el: card };
}

export function confirmBox(text: string, yes: string, onYes: () => void) {
  const body = h('div', { class: 'stack' }, h('p', null, text));
  const m = modal('Are you sure?', body);
  body.append(h('div', { class: 'row end' }, btn('Cancel', () => m.close(), 'ghost'), btn(yes, () => { m.close(); onYes(); }, 'warn')));
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

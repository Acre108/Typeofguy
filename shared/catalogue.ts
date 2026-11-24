// The furniture and material catalogue. Every model is built from a short list
// of rounded primitives, so there are no external assets: see README "Adding furniture".

import type { FurnitureDef, MaterialDef, Part, ThemeDef, ThemeId } from './types';

export const PAL = {
  honey: '#dca46a', oak: '#c68a55', walnut: '#9b6a45', pine: '#e8c48f', drift: '#d3c6b0', bark: '#8a6248',
  cream: '#f7ecd9', linen: '#efe2cc', white: '#fbf7f1', butter: '#f6d88a', peach: '#f5b896', coral: '#ec9a86',
  blush: '#f2bcc4', rose: '#e59aa6', sage: '#a8c79e', mint: '#b4e0cd', leaf: '#86b56f', fern: '#6e9f5f',
  moss: '#9db67c', sky: '#a9d0ea', powder: '#c8dbf3', sea: '#86bccb', navy: '#6884a3', lilac: '#c8b5e6',
  plum: '#a58fc0', terracotta: '#d98b67', clay: '#c47a5a', sand: '#ecd5aa', stone: '#ddd5c9',
  charcoal: '#625a5e', iron: '#756d6f', brass: '#d8b36a', glow: '#ffe2a8', tomato: '#dd7766', lemon: '#f4dc6b',
  daylight: '#d6ecf7',
} as const;

// ---------------------------------------------------------------- part helpers
type O = Partial<Part>;
const B = (size: Part['size'], at: Part['at'], c: string, o: O = {}): Part => ({ s: 'box', size, at, c, r: 0.06, ...o });
const C = (size: Part['size'], at: Part['at'], c: string, o: O = {}): Part => ({ s: 'cyl', size, at, c, r: 0.03, ...o });
const S = (size: Part['size'], at: Part['at'], c: string, o: O = {}): Part => ({ s: 'sphere', size, at, c, ...o });
const K = (size: Part['size'], at: Part['at'], c: string, o: O = {}): Part => ({ s: 'cone', size, at, c, ...o });
const T = (size: Part['size'], at: Part['at'], c: string, o: O = {}): Part => ({ s: 'torus', size, at, c, ...o });

const rad = (d: number) => (d * Math.PI) / 180;

/** Leaves fanning out from a point: ellipsoids tilted up and yawed round. */
function fronds(n: number, y: number, reach: number, size: Part['size'], c: string, tilt = -32, yaw0 = 0): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const yaw = yaw0 + (360 / n) * i;
    out.push(S(size, [Math.sin(rad(yaw)) * reach, y, Math.cos(rad(yaw)) * reach], c, { rot: [tilt, yaw, 0], t: 'leaf' }));
  }
  return out;
}

/** A row of books from x0 to x1 on a shelf at height y. Deterministic. */
function books(y: number, x0: number, x1: number, z: number, seed: number): Part[] {
  const colours = [PAL.coral, PAL.sage, PAL.butter, PAL.powder, PAL.lilac, PAL.terracotta, PAL.mint, PAL.rose];
  const out: Part[] = [];
  let x = x0;
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  while (x < x1 - 0.1) {
    const w = 0.08 + rnd() * 0.06;
    const h = 0.32 + rnd() * 0.12;
    if (rnd() < 0.12) { x += 0.12; continue; }
    out.push(B([w, h, 0.5], [x + w / 2, y, z], colours[Math.floor(rnd() * colours.length)], { r: 0.015 }));
    x += w + 0.01;
  }
  return out;
}

// ---------------------------------------------------------------- furniture
const quiz = (id: string, label: string) => ({ type: 'quiz' as const, id, label });
const game = (id: string, label: string) => ({ type: 'minigame' as const, id, label });
const setBonus = (id: ThemeId, label: string) => ({ type: 'set' as const, id, label });

const F: FurnitureDef[] = [
  // ============================== Cosy Cabin
  {
    id: 'log-stool', name: 'Log Stool', theme: 'cabin', kind: 'floor', size: [1, 1], height: 0.46, seat: 0.46, price: 40,
    desc: 'A sawn round of pine. Sturdy, honest, slightly sappy.',
    parts: [C([0.62, 0.42, 0.62], [0, 0, 0], PAL.oak, { t: 'wood', r: 0.06 }), C([0.56, 0.04, 0.56], [0, 0.42, 0], PAL.pine, { t: 'wood' })],
  },
  {
    id: 'plaid-armchair', name: 'Plaid Armchair', theme: 'cabin', kind: 'floor', size: [1, 1], height: 0.97, seat: 0.5, price: 120,
    desc: 'Deep, square and upholstered in a red-and-cream check.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => C([0.1, 0.08, 0.1], [sx * 0.34, 0, sz * 0.32], PAL.walnut))),
      B([0.9, 0.4, 0.84], [0, 0.06, 0.02], PAL.tomato, { t: 'plaid', c2: PAL.cream, r: 0.12 }),
      B([0.6, 0.14, 0.62], [0, 0.42, 0.08], PAL.cream, { t: 'fabric', r: 0.07 }),
      B([0.9, 0.55, 0.24], [0, 0.42, -0.3], PAL.tomato, { t: 'plaid', c2: PAL.cream, r: 0.11 }),
      B([0.19, 0.3, 0.8], [-0.355, 0.44, 0.03], PAL.tomato, { t: 'plaid', c2: PAL.cream, r: 0.09 }),
      B([0.19, 0.3, 0.8], [0.355, 0.44, 0.03], PAL.tomato, { t: 'plaid', c2: PAL.cream, r: 0.09 }),
    ],
  },
  {
    id: 'quilted-bed', name: 'Quilted Bed', theme: 'cabin', kind: 'floor', size: [2, 3], height: 1.15, seat: 0.6, price: 220,
    desc: 'A honey-pine bed with a patchwork quilt and two plump pillows.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => C([0.14, 0.1, 0.14], [sx * 0.84, 0, sz * 1.34], PAL.walnut))),
      B([1.9, 0.32, 2.88], [0, 0.08, 0], PAL.honey, { t: 'wood', r: 0.1 }),
      B([1.76, 0.2, 2.72], [0, 0.38, 0.06], PAL.white, { t: 'fabric', r: 0.1 }),
      B([1.84, 0.1, 1.85], [0, 0.52, 0.5], PAL.sky, { t: 'plaid', c2: PAL.white, r: 0.05 }),
      B([0.72, 0.18, 0.46], [-0.44, 0.56, -1.02], PAL.cream, { t: 'fabric', r: 0.09 }),
      B([0.72, 0.18, 0.46], [0.44, 0.56, -1.02], PAL.cream, { t: 'fabric', r: 0.09 }),
      B([1.95, 1.0, 0.18], [0, 0.08, -1.4], PAL.honey, { t: 'wood', r: 0.09 }),
      B([2.04, 0.1, 0.26], [0, 1.05, -1.4], PAL.walnut, { t: 'wood', r: 0.05 }),
    ],
  },
  {
    id: 'stump-table', name: 'Stump Side Table', theme: 'cabin', kind: 'floor', size: [1, 1], height: 0.56, surface: 0.56, price: 55,
    desc: 'A tree stump with ambitions. Good for a lamp or a mug.',
    parts: [C([0.7, 0.48, 0.7], [0, 0, 0], PAL.oak, { t: 'wood', taper: 0.88, r: 0.04 }), C([0.8, 0.08, 0.8], [0, 0.48, 0], PAL.pine, { t: 'wood', r: 0.04 })],
  },
  {
    id: 'log-bookcase', name: 'Log Bookcase', theme: 'cabin', kind: 'floor', size: [2, 1], height: 1.92, price: 150,
    desc: 'Four honey-pine shelves of well-thumbed paperbacks.',
    parts: [
      B([1.86, 1.84, 0.1], [0, 0.04, -0.37], PAL.honey, { t: 'wood', r: 0.03 }),
      B([0.12, 1.86, 0.82], [-0.89, 0.02, 0], PAL.honey, { t: 'wood', r: 0.05 }),
      B([0.12, 1.86, 0.82], [0.89, 0.02, 0], PAL.honey, { t: 'wood', r: 0.05 }),
      ...[0.02, 0.62, 1.2].map((y) => B([1.8, 0.08, 0.78], [0, y, 0], PAL.honey, { t: 'wood', r: 0.03 })),
      B([1.96, 0.1, 0.86], [0, 1.82, 0], PAL.walnut, { t: 'wood', r: 0.04 }),
      ...books(0.1, -0.82, 0.82, -0.05, 3), ...books(0.7, -0.82, 0.82, -0.05, 11), ...books(1.28, -0.82, 0.3, -0.05, 27),
      S([0.18, 0.22, 0.18], [0.55, 1.28, -0.02], PAL.sage),
    ],
  },
  {
    id: 'knit-rug', name: 'Knitted Rug', theme: 'cabin', kind: 'floor', size: [2, 3], height: 0.05, rug: true, price: 80,
    desc: 'Chunky cable-knit in toasted apricot. Warm underfoot.',
    parts: [B([1.94, 0.03, 2.94], [0, 0, 0], PAL.clay, { r: 0.015 }), B([1.84, 0.045, 2.84], [0, 0, 0], PAL.peach, { t: 'knit', r: 0.02 })],
  },
  {
    id: 'brass-lantern', name: 'Brass Lantern', theme: 'cabin', kind: 'floor', size: [1, 1], height: 0.46, small: true, light: true, price: 45,
    desc: 'A little brass lantern with a candle-warm glow.',
    parts: [
      C([0.3, 0.05, 0.3], [0, 0, 0], PAL.brass),
      C([0.22, 0.24, 0.22], [0, 0.05, 0], PAL.glow, { t: 'glow' }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => B([0.035, 0.24, 0.035], [sx * 0.11, 0.05, sz * 0.11], PAL.iron, { r: 0.01 }))),
      K([0.36, 0.13, 0.36], [0, 0.29, 0], PAL.brass, { seg: 4, rot: [0, 45, 0] }),
      T([0.11, 0.028, 0.11], [0, 0.41, 0], PAL.brass, { rot: [90, 0, 0] }),
    ],
  },
  {
    id: 'cabin-window', name: 'Cabin Window', theme: 'cabin', kind: 'wall', size: [2, 3], height: 1.5, light: true, price: 110,
    desc: 'Four panes of soft daylight in a chunky pine frame.',
    parts: [
      B([1.7, 1.38, 0.12], [0, 0.06, 0.0], PAL.honey, { t: 'wood', r: 0.05 }),
      B([1.44, 1.12, 0.04], [0, 0.19, 0.05], PAL.daylight, { t: 'glow' }),
      B([0.07, 1.12, 0.06], [0, 0.19, 0.08], PAL.honey, { r: 0.02 }),
      B([1.44, 0.07, 0.06], [0, 0.72, 0.08], PAL.honey, { r: 0.02 }),
      B([1.86, 0.1, 0.28], [0, 0.0, 0.06], PAL.walnut, { t: 'wood', r: 0.04 }),
    ],
  },
  {
    id: 'wood-stove', name: 'Pot-bellied Stove', theme: 'cabin', kind: 'floor', size: [1, 1], height: 2.35, light: true, price: null,
    source: quiz('general', 'Perfect score in the Pub Quiz'),
    desc: 'Crackles companionably. Earned by acing the Pub Quiz.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => C([0.08, 0.12, 0.08], [sx * 0.22, 0, sz * 0.2], PAL.charcoal))),
      B([0.66, 0.62, 0.6], [0, 0.1, -0.02], PAL.charcoal, { r: 0.15 }),
      B([0.34, 0.24, 0.04], [0, 0.26, 0.27], PAL.glow, { t: 'glow', r: 0.05 }),
      B([0.72, 0.06, 0.66], [0, 0.72, -0.02], PAL.iron, { r: 0.03 }),
      C([0.18, 1.48, 0.18], [0, 0.78, -0.12], PAL.iron),
      C([0.25, 0.08, 0.25], [0, 2.24, -0.12], PAL.iron),
    ],
  },
  {
    id: 'long-clock', name: 'Long-case Clock', theme: 'cabin', kind: 'floor', size: [1, 1], height: 2.1, price: null,
    source: setBonus('cabin', 'Complete the Cosy Cabin set'),
    desc: 'Tocks, rather than ticks. A reward for completing the Cosy Cabin set.',
    parts: [
      B([0.56, 0.25, 0.44], [0, 0, -0.14], PAL.walnut, { t: 'wood', r: 0.05 }),
      B([0.42, 1.2, 0.34], [0, 0.25, -0.14], PAL.honey, { t: 'wood', r: 0.05 }),
      B([0.2, 0.62, 0.03], [0, 0.44, 0.03], PAL.cream, { r: 0.02 }),
      C([0.13, 0.025, 0.13], [0, 0.55, 0.05], PAL.brass, { rot: [90, 0, 0] }),
      B([0.58, 0.56, 0.46], [0, 1.44, -0.14], PAL.walnut, { t: 'wood', r: 0.08 }),
      C([0.38, 0.04, 0.38], [0, 1.7, 0.09], PAL.cream, { rot: [90, 0, 0] }),
      B([0.025, 0.14, 0.02], [0, 1.72, 0.12], PAL.charcoal, { r: 0.008 }),
      B([0.1, 0.025, 0.02], [0.045, 1.71, 0.12], PAL.charcoal, { r: 0.008 }),
      B([0.64, 0.1, 0.5], [0, 1.99, -0.14], PAL.honey, { t: 'wood', r: 0.04 }),
    ],
  },

  // ============================== Seaside
  {
    id: 'deckchair', name: 'Striped Deckchair', theme: 'seaside', kind: 'floor', size: [1, 2], height: 0.95, seat: 0.38, price: 90,
    desc: 'Coral-and-white canvas on a driftwood frame. Smells faintly of suncream.',
    parts: [
      ...[-1, 1].flatMap((sx) => [
        B([0.07, 0.42, 0.07], [sx * 0.41, 0, 0.7], PAL.drift, { r: 0.02, t: 'wood' }),
        B([0.07, 1.0, 0.07], [sx * 0.41, 0, -0.5], PAL.drift, { r: 0.02, t: 'wood', rot: [-28, 0, 0] }),
        B([0.06, 0.06, 1.25], [sx * 0.41, 0.3, 0.12], PAL.drift, { r: 0.02, t: 'wood' }),
      ]),
      B([0.74, 0.07, 0.95], [0, 0.32, 0.3], PAL.coral, { t: 'stripe', c2: PAL.white, r: 0.03, rot: [-8, 0, 0] }),
      B([0.74, 0.07, 0.85], [0, 0.6, -0.42], PAL.coral, { t: 'stripe', c2: PAL.white, r: 0.03, rot: [58, 0, 0] }),
    ],
  },
  {
    id: 'driftwood-bench', name: 'Driftwood Bench', theme: 'seaside', kind: 'floor', size: [2, 1], height: 0.9, seat: 0.46, price: 110,
    desc: 'Sea-smoothed planks with a striped seat pad.',
    parts: [
      B([0.18, 0.34, 0.54], [-0.74, 0, 0.04], PAL.drift, { t: 'wood', r: 0.05 }),
      B([0.18, 0.34, 0.54], [0.74, 0, 0.04], PAL.drift, { t: 'wood', r: 0.05 }),
      B([1.86, 0.14, 0.64], [0, 0.32, 0.04], PAL.drift, { t: 'wood', r: 0.07 }),
      B([1.86, 0.4, 0.13], [0, 0.48, -0.3], PAL.drift, { t: 'wood', r: 0.06 }),
      B([1.6, 0.08, 0.5], [0, 0.46, 0.07], PAL.sky, { t: 'stripe', c2: PAL.white, r: 0.04 }),
    ],
  },
  {
    id: 'hut-dresser', name: 'Beach Hut Dresser', theme: 'seaside', kind: 'floor', size: [1, 1], height: 0.9, surface: 0.9, price: 130,
    desc: 'Painted in beach-hut stripes, with room on top for treasures.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => C([0.08, 0.1, 0.08], [sx * 0.3, 0, sz * 0.25], PAL.white))),
      B([0.8, 0.76, 0.66], [0, 0.08, -0.04], PAL.sky, { t: 'stripe', c2: PAL.white, r: 0.08 }),
      B([0.64, 0.26, 0.04], [0, 0.17, 0.29], PAL.white, { r: 0.03 }),
      B([0.64, 0.26, 0.04], [0, 0.49, 0.29], PAL.white, { r: 0.03 }),
      S([0.07, 0.07, 0.07], [0, 0.265, 0.31], PAL.brass),
      S([0.07, 0.07, 0.07], [0, 0.585, 0.31], PAL.brass),
      B([0.86, 0.06, 0.72], [0, 0.84, -0.04], PAL.white, { r: 0.03 }),
    ],
  },
  {
    id: 'shell-lamp', name: 'Shell Lamp', theme: 'seaside', kind: 'floor', size: [1, 1], height: 0.52, small: true, light: true, price: 50,
    desc: 'A scallop-shell shade on a sandy pebble base.',
    parts: [
      S([0.3, 0.16, 0.3], [0, 0, 0], PAL.sand),
      C([0.05, 0.14, 0.05], [0, 0.13, 0], PAL.brass),
      S([0.36, 0.26, 0.36], [0, 0.24, 0], '#ffe3d2', { t: 'glow' }),
      T([0.34, 0.03, 0.34], [0, 0.34, 0], PAL.blush),
    ],
  },
  {
    id: 'rope-rug', name: 'Rope Rug', theme: 'seaside', kind: 'floor', size: [2, 2], height: 0.05, rug: true, price: 75,
    desc: 'A big round coil of soft jute rope.',
    parts: [
      C([1.9, 0.035, 1.9], [0, 0, 0], PAL.sand, { t: 'weave', seg: 40, r: 0.01 }),
      T([1.62, 0.05, 1.62], [0, 0.0, 0], '#d9bd8c', { seg: 40 }),
      C([0.9, 0.045, 0.9], [0, 0, 0], '#f1dcb3', { t: 'weave', seg: 32, r: 0.01 }),
    ],
  },
  {
    id: 'sandcastle', name: 'Sandcastle', theme: 'seaside', kind: 'floor', size: [1, 1], height: 1.0, price: 60,
    desc: 'Built to last, which for a sandcastle is quite a claim.',
    parts: [
      B([0.82, 0.22, 0.82], [0, 0, 0], PAL.sand, { r: 0.1 }),
      ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [
        C([0.26, 0.38, 0.26], [sx * 0.24, 0.2, sz * 0.24], PAL.sand, { r: 0.04 }),
        K([0.3, 0.16, 0.3], [sx * 0.24, 0.58, sz * 0.24], PAL.coral, { seg: 12 }),
      ])),
      C([0.36, 0.56, 0.36], [0, 0.2, 0], PAL.sand, { r: 0.04 }),
      B([0.025, 0.24, 0.025], [0, 0.76, 0], PAL.iron, { r: 0.008 }),
      B([0.16, 0.09, 0.02], [0.08, 0.89, 0], PAL.sea, { r: 0.01 }),
    ],
  },
  {
    id: 'lifebuoy', name: 'Lifebuoy', theme: 'seaside', kind: 'wall', size: [1, 2], height: 1.0, price: 55,
    desc: 'Coral and white, just in case the rug gets choppy.',
    parts: [T([0.82, 0.2, 0.82], [0, 0.4, 0.12], PAL.coral, { rot: [90, 0, 0], t: 'stripe', c2: PAL.white, seg: 28 })],
  },
  {
    id: 'porthole', name: 'Porthole Window', theme: 'seaside', kind: 'wall', size: [2, 3], height: 1.5, light: true, price: 120,
    desc: 'A brass-rimmed round window. The view is always a calm sea.',
    parts: [
      C([1.06, 0.04, 1.06], [0, 0.73, 0.03], PAL.daylight, { rot: [90, 0, 0], t: 'glow', seg: 32 }),
      T([1.22, 0.17, 1.22], [0, 0.665, 0.07], PAL.brass, { rot: [90, 0, 0], seg: 32 }),
      ...[0, 90, 180, 270].map((a) => S([0.07, 0.07, 0.07], [Math.cos(rad(a)) * 0.61, 0.715 + Math.sin(rad(a)) * 0.61, 0.15], PAL.iron)),
    ],
  },
  {
    id: 'sailboat', name: 'Model Sailboat', theme: 'seaside', kind: 'floor', size: [1, 1], height: 0.62, small: true, price: null,
    source: game('memory', 'Finish Tide Pool Pairs in 12 moves or fewer'),
    desc: 'A tiny sloop on a walnut stand. Won at Tide Pool Pairs.',
    parts: [
      B([0.32, 0.04, 0.12], [0, 0, 0], PAL.walnut, { r: 0.015 }),
      C([0.03, 0.12, 0.03], [0, 0.04, 0], PAL.brass),
      B([0.44, 0.1, 0.15], [0, 0.14, 0], PAL.navy, { r: 0.05 }),
      C([0.025, 0.42, 0.025], [0.02, 0.22, 0], PAL.drift),
      B([0.2, 0.32, 0.012], [-0.09, 0.27, 0], PAL.white, { r: 0.005 }),
      B([0.11, 0.22, 0.012], [0.11, 0.27, 0], PAL.coral, { r: 0.005 }),
    ],
  },
  {
    id: 'lighthouse-lamp', name: 'Lighthouse Lamp', theme: 'seaside', kind: 'floor', size: [1, 1], height: 2.05, light: true, price: null,
    source: setBonus('seaside', 'Complete the Seaside set'),
    desc: 'Guides visitors safely to the sofa. A reward for completing the Seaside set.',
    parts: [
      C([0.62, 0.12, 0.62], [0, 0, 0], PAL.stone, { r: 0.04 }),
      C([0.52, 1.3, 0.52], [0, 0.12, 0], PAL.white, { t: 'band', c2: PAL.coral, taper: 0.7, seg: 24 }),
      C([0.5, 0.06, 0.5], [0, 1.42, 0], PAL.iron),
      C([0.3, 0.3, 0.3], [0, 1.48, 0], PAL.glow, { t: 'glow' }),
      K([0.42, 0.28, 0.42], [0, 1.78, 0], PAL.coral, { seg: 16 }),
    ],
  },

  // ============================== Greenhouse
  {
    id: 'potted-fern', name: 'Potted Fern', theme: 'garden', kind: 'floor', size: [1, 1], height: 0.95, price: 45,
    desc: 'A Boston fern in a terracotta pot. Forgives the occasional missed watering.',
    parts: [
      C([0.46, 0.38, 0.46], [0, 0, 0], PAL.terracotta, { taper: 1.2 }),
      C([0.62, 0.08, 0.62], [0, 0.36, 0], PAL.clay, { r: 0.03 }),
      C([0.52, 0.02, 0.52], [0, 0.43, 0], PAL.bark),
      ...fronds(7, 0.42, 0.2, [0.2, 0.07, 0.62], PAL.leaf, -30),
      ...fronds(5, 0.5, 0.1, [0.16, 0.07, 0.48], PAL.moss, -55, 30),
    ],
  },
  {
    id: 'monstera', name: 'Monstera', theme: 'garden', kind: 'floor', size: [1, 1], height: 1.45, price: 85,
    desc: 'Big, glossy, slightly dramatic leaves.',
    parts: [
      C([0.5, 0.46, 0.5], [0, 0, 0], PAL.cream, { taper: 1.1, r: 0.05 }),
      C([0.5, 0.02, 0.5], [0, 0.45, 0], PAL.bark),
      ...[0, 72, 144, 216, 288].map((a, i) => C([0.035, 0.5 + (i % 3) * 0.15, 0.035], [Math.sin(rad(a)) * 0.08, 0.46, Math.cos(rad(a)) * 0.08], PAL.fern, { rot: [-14, a, 0] })),
      ...[0, 72, 144, 216, 288].map((a, i) => S([0.5, 0.06, 0.44], [Math.sin(rad(a)) * 0.24, 0.85 + (i % 3) * 0.15, Math.cos(rad(a)) * 0.24], PAL.fern, { rot: [-22, a, 0], t: 'leaf' })),
    ],
  },
  {
    id: 'wicker-chair', name: 'Wicker Chair', theme: 'garden', kind: 'floor', size: [1, 1], height: 1.3, seat: 0.48, price: 100,
    desc: 'A grand fan-backed chair woven from rattan.',
    parts: [
      C([0.48, 0.34, 0.48], [0, 0, 0], PAL.sand, { t: 'weave', taper: 1.25 }),
      C([0.8, 0.12, 0.74], [0, 0.32, 0.04], PAL.sand, { t: 'weave', r: 0.05 }),
      C([0.64, 0.08, 0.58], [0, 0.42, 0.06], PAL.mint, { t: 'fabric', r: 0.04 }),
      S([1.0, 1.0, 0.22], [0, 0.32, -0.32], PAL.sand, { t: 'weave', rot: [-8, 0, 0] }),
    ],
  },
  {
    id: 'potting-bench', name: 'Potting Bench', theme: 'garden', kind: 'floor', size: [2, 1], height: 0.86, surface: 0.86, price: 140,
    desc: 'A workbench for repotting. Plenty of room on top.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => B([0.1, 0.78, 0.1], [sx * 0.84, 0, sz * 0.29], PAL.pine, { t: 'wood', r: 0.03 }))),
      B([1.76, 0.06, 0.62], [0, 0.22, 0], PAL.pine, { t: 'wood', r: 0.02 }),
      B([1.92, 0.1, 0.78], [0, 0.76, 0], PAL.pine, { t: 'wood', r: 0.04 }),
      C([0.24, 0.2, 0.24], [-0.52, 0.28, 0], PAL.terracotta, { taper: 1.2 }),
      C([0.2, 0.17, 0.2], [-0.2, 0.28, 0.08], PAL.terracotta, { taper: 1.2 }),
      B([0.44, 0.32, 0.32], [0.48, 0.28, 0], PAL.linen, { t: 'weave', r: 0.13 }),
    ],
  },
  {
    id: 'succulent', name: 'Succulent', theme: 'garden', kind: 'floor', size: [1, 1], height: 0.34, small: true, price: 30,
    desc: 'A chubby rosette in a powder-blue pot.',
    parts: [
      C([0.24, 0.18, 0.24], [0, 0, 0], PAL.powder, { taper: 1.15 }),
      ...fronds(6, 0.15, 0.07, [0.1, 0.07, 0.16], PAL.sage, -28),
      S([0.12, 0.12, 0.12], [0, 0.17, 0], PAL.mint),
    ],
  },
  {
    id: 'grass-mat', name: 'Meadow Mat', theme: 'garden', kind: 'floor', size: [2, 2], height: 0.06, rug: true, price: 60,
    desc: 'A soft green mat scattered with embroidered daisies.',
    parts: [
      B([1.9, 0.04, 1.9], [0, 0, 0], PAL.moss, { t: 'knit', r: 0.04 }),
      ...[[-0.5, -0.4], [0.45, 0.2], [-0.1, 0.6], [0.6, -0.6]].flatMap(([x, z]) => [
        S([0.12, 0.035, 0.12], [x, 0.035, z], PAL.white), S([0.05, 0.03, 0.05], [x, 0.05, z], PAL.lemon),
      ]),
    ],
  },
  {
    id: 'botanical-print', name: 'Botanical Print', theme: 'garden', kind: 'wall', size: [1, 2], height: 1.0, price: 65,
    desc: 'A pressed-fern illustration in a slim oak frame.',
    parts: [B([0.8, 0.95, 0.06], [0, 0.02, 0], PAL.oak, { t: 'wood', r: 0.03 }), B([0.66, 0.8, 0.02], [0, 0.095, 0.045], PAL.cream, { t: 'paper', c2: PAL.fern, r: 0.005 })],
  },
  {
    id: 'wall-sconce', name: 'Tulip Sconce', theme: 'garden', kind: 'wall', size: [1, 2], height: 1.0, light: true, price: 70,
    desc: 'A frosted tulip of light on a brass arm.',
    parts: [
      C([0.22, 0.04, 0.22], [0, 0.43, 0.0], PAL.brass, { rot: [90, 0, 0] }),
      B([0.04, 0.04, 0.22], [0, 0.52, 0.1], PAL.brass, { r: 0.015 }),
      S([0.26, 0.3, 0.26], [0, 0.42, 0.24], '#ffe7c2', { t: 'glow' }),
    ],
  },
  {
    id: 'watering-can', name: 'Watering Can', theme: 'garden', kind: 'floor', size: [1, 1], height: 0.4, small: true, price: null,
    source: quiz('nature', 'Perfect score in Field Notes'),
    desc: 'Sage-green enamel with a rose spout. Earned by acing Field Notes.',
    parts: [
      C([0.26, 0.22, 0.22], [0, 0, 0], '#9ec3a8', { r: 0.05 }),
      C([0.04, 0.28, 0.04], [0.18, 0.06, 0], '#9ec3a8', { rot: [0, 0, -55] }),
      C([0.09, 0.04, 0.09], [0.3, 0.24, 0], PAL.brass, { rot: [0, 0, -55] }),
      T([0.2, 0.035, 0.2], [0, 0.2, 0], '#9ec3a8', { rot: [90, 0, 0] }),
    ],
  },
  {
    id: 'lemon-tree', name: 'Lemon Tree', theme: 'garden', kind: 'floor', size: [1, 1], height: 1.75, price: null,
    source: setBonus('garden', 'Complete the Greenhouse set'),
    desc: 'Sunshine you can pick. A reward for completing the Greenhouse set.',
    parts: [
      B([0.56, 0.46, 0.56], [0, 0, 0], PAL.cream, { r: 0.1 }),
      C([0.08, 0.6, 0.08], [0, 0.46, 0], PAL.bark),
      S([0.86, 0.76, 0.86], [0, 0.92, 0], PAL.leaf, { t: 'leaf' }),
      ...[[0.3, 1.2, 0.25], [-0.32, 1.35, 0.1], [0.1, 1.55, -0.3], [-0.1, 1.05, 0.36], [0.36, 1.45, -0.12]].map(([x, y, z]) =>
        S([0.12, 0.14, 0.12], [x, y, z], PAL.lemon)),
    ],
  },

  // ============================== Sunday Studio
  {
    id: 'pill-sofa', name: 'Pill Sofa', theme: 'studio', kind: 'floor', size: [2, 1], height: 0.86, seat: 0.5, price: 180,
    desc: 'A rounded, peachy two-seater on tapered walnut feet.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => C([0.07, 0.09, 0.07], [sx * 0.8, 0, sz * 0.3], PAL.walnut, { taper: 0.7 }))),
      B([1.9, 0.32, 0.82], [0, 0.08, 0.02], PAL.peach, { t: 'fabric', r: 0.15 }),
      B([1.9, 0.52, 0.28], [0, 0.32, -0.27], PAL.peach, { t: 'fabric', r: 0.14 }),
      B([0.86, 0.14, 0.56], [-0.44, 0.38, 0.1], '#f8cbad', { t: 'fabric', r: 0.07 }),
      B([0.86, 0.14, 0.56], [0.44, 0.38, 0.1], '#f8cbad', { t: 'fabric', r: 0.07 }),
      B([0.2, 0.34, 0.82], [-0.86, 0.32, 0.02], PAL.peach, { t: 'fabric', r: 0.1 }),
      B([0.2, 0.34, 0.82], [0.86, 0.32, 0.02], PAL.peach, { t: 'fabric', r: 0.1 }),
    ],
  },
  {
    id: 'oval-table', name: 'Oval Coffee Table', theme: 'studio', kind: 'floor', size: [2, 1], height: 0.46, surface: 0.46, price: 110,
    desc: 'Walnut, oval and exactly the right height for a vase.',
    parts: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => C([0.07, 0.38, 0.07], [sx * 0.58, 0, sz * 0.2], PAL.walnut, { taper: 0.6 }))),
      C([1.84, 0.08, 0.82], [0, 0.38, 0], PAL.walnut, { t: 'wood', seg: 36, r: 0.035 }),
    ],
  },
  {
    id: 'globe-lamp', name: 'Globe Floor Lamp', theme: 'studio', kind: 'floor', size: [1, 1], height: 1.66, light: true, price: 95,
    desc: 'A milky glass moon on a slim brass stem.',
    parts: [
      C([0.42, 0.05, 0.42], [0, 0, 0], PAL.brass),
      C([0.04, 1.24, 0.04], [0, 0.05, 0], PAL.brass),
      S([0.44, 0.44, 0.44], [0, 1.2, 0], '#fff2da', { t: 'glow' }),
    ],
  },
  {
    id: 'terrazzo-plinth', name: 'Terrazzo Plinth', theme: 'studio', kind: 'floor', size: [1, 1], height: 0.72, surface: 0.72, price: 70,
    desc: 'A speckled pedestal for showing off small treasures.',
    parts: [B([0.62, 0.72, 0.62], [0, 0, 0], '#f1e6d8', { t: 'terrazzo', r: 0.06 })],
  },
  {
    id: 'cube-shelf', name: 'Cube Shelf', theme: 'studio', kind: 'floor', size: [2, 1], height: 1.0, price: 120,
    desc: 'Four cubbies, two coloured baskets and a few favourite books.',
    parts: [
      B([1.9, 0.94, 0.06], [0, 0.04, -0.27], PAL.cream, { r: 0.02 }),
      B([1.92, 0.08, 0.62], [0, 0.0, 0], PAL.cream, { r: 0.03 }),
      B([1.92, 0.08, 0.62], [0, 0.92, 0], PAL.cream, { r: 0.03 }),
      B([1.84, 0.06, 0.6], [0, 0.47, 0], PAL.cream, { r: 0.02 }),
      B([0.08, 0.96, 0.62], [-0.92, 0.0, 0], PAL.cream, { r: 0.03 }),
      B([0.08, 0.96, 0.62], [0.92, 0.0, 0], PAL.cream, { r: 0.03 }),
      B([0.06, 0.88, 0.6], [0, 0.04, 0], PAL.cream, { r: 0.02 }),
      B([0.74, 0.36, 0.48], [-0.46, 0.08, 0.04], PAL.coral, { t: 'weave', r: 0.06 }),
      B([0.74, 0.36, 0.48], [0.46, 0.53, 0.04], PAL.sky, { t: 'weave', r: 0.06 }),
      ...books(0.08, 0.1, 0.82, 0, 5), ...books(0.53, -0.84, -0.3, 0, 8),
      S([0.2, 0.24, 0.2], [-0.15, 0.53, 0.02], PAL.blush),
    ],
  },
  {
    id: 'squiggle-rug', name: 'Squiggle Rug', theme: 'studio', kind: 'floor', size: [2, 3], height: 0.05, rug: true, price: 85,
    desc: 'Lilac with butter-yellow squiggles. Cheerful in any weather.',
    parts: [B([1.9, 0.04, 2.9], [0, 0, 0], PAL.lilac, { t: 'squiggle', c2: PAL.butter, r: 0.03 })],
  },
  {
    id: 'tulip-vase', name: 'Tulip Vase', theme: 'studio', kind: 'floor', size: [1, 1], height: 0.5, small: true, price: 35,
    desc: 'Three tulips in a round blush vase.',
    parts: [
      S([0.22, 0.24, 0.22], [0, 0, 0], PAL.blush),
      C([0.1, 0.08, 0.1], [0, 0.2, 0], PAL.blush),
      ...[-20, 0, 20].map((a, i) => C([0.02, 0.18, 0.02], [Math.sin(rad(a)) * 0.04, 0.24, 0], PAL.fern, { rot: [0, 0, -a] })),
      ...[-20, 0, 20].map((a, i) => S([0.08, 0.1, 0.08], [Math.sin(rad(a)) * 0.11, 0.39 + (i === 1 ? 0.03 : 0), 0], [PAL.coral, PAL.butter, PAL.rose][i])),
    ],
  },
  {
    id: 'abstract-print', name: 'Shapes Print', theme: 'studio', kind: 'wall', size: [2, 2], height: 1.0, price: 80,
    desc: 'A sun, a block and a wobble. Very modern.',
    parts: [
      B([1.6, 0.92, 0.06], [0, 0.04, 0], PAL.white, { r: 0.03 }),
      B([1.46, 0.78, 0.02], [0, 0.11, 0.045], PAL.cream, { r: 0.005 }),
      C([0.42, 0.02, 0.42], [-0.36, 0.5, 0.06], PAL.coral, { rot: [90, 0, 0] }),
      B([0.36, 0.36, 0.02], [0.22, 0.2, 0.06], PAL.butter, { r: 0.005 }),
      B([0.5, 0.1, 0.02], [0.32, 0.66, 0.06], PAL.sage, { r: 0.04 }),
    ],
  },
  {
    id: 'record-player', name: 'Record Player', theme: 'studio', kind: 'floor', size: [1, 1], height: 0.22, small: true, price: null,
    source: quiz('music', 'Perfect score in Sound Check'),
    desc: 'Plays your favourite crackly LP. Earned by acing Sound Check.',
    parts: [
      B([0.5, 0.1, 0.42], [0, 0, 0], PAL.walnut, { t: 'wood', r: 0.03 }),
      C([0.34, 0.03, 0.34], [-0.05, 0.1, 0], PAL.charcoal, { seg: 28 }),
      C([0.1, 0.012, 0.1], [-0.05, 0.13, 0], PAL.coral),
      B([0.03, 0.03, 0.24], [0.17, 0.13, 0.0], PAL.brass, { r: 0.01, rot: [0, 18, 0] }),
    ],
  },
  {
    id: 'cloud-chair', name: 'Cloud Chair', theme: 'studio', kind: 'floor', size: [1, 1], height: 0.95, seat: 0.42, price: null,
    source: setBonus('studio', 'Complete the Sunday Studio set'),
    desc: 'Like sitting in a very supportive cumulus. A reward for completing the Sunday Studio set.',
    parts: [
      S([0.7, 0.42, 0.66], [0, 0.04, 0.06], '#f6f1fb', { t: 'fabric' }),
      S([0.42, 0.44, 0.5], [-0.27, 0.14, 0.02], '#f6f1fb', { t: 'fabric' }),
      S([0.42, 0.44, 0.5], [0.27, 0.14, 0.02], '#f6f1fb', { t: 'fabric' }),
      S([0.86, 0.62, 0.36], [0, 0.3, -0.25], '#f6f1fb', { t: 'fabric' }),
      S([0.4, 0.4, 0.3], [-0.24, 0.6, -0.26], '#f6f1fb', { t: 'fabric' }),
      S([0.4, 0.4, 0.3], [0.24, 0.6, -0.26], '#f6f1fb', { t: 'fabric' }),
    ],
  },
];

export const FURNITURE: Record<string, FurnitureDef> = Object.fromEntries(F.map((d) => [d.id, d]));
export const FURNITURE_LIST = F;

// ---------------------------------------------------------------- materials
export const MATERIALS_LIST: MaterialDef[] = [
  // floors
  { id: 'oak-planks', name: 'Honey Oak Planks', surface: 'floor', theme: 'cabin', price: 0, pattern: 'planks', colors: ['#dcab78', '#d3a06c', '#e3b685'] },
  { id: 'sandstone-tile', name: 'Sandstone Tile', surface: 'floor', theme: 'seaside', price: 90, pattern: 'tile', colors: ['#ecd9b6', '#e3cba2', '#f2e3c6'] },
  { id: 'driftwood-boards', name: 'Driftwood Boards', surface: 'floor', theme: 'seaside', price: 110, pattern: 'planks', colors: ['#dad2c4', '#d0c7b7', '#e4dccf'] },
  { id: 'terracotta-tile', name: 'Terracotta Tile', surface: 'floor', theme: 'garden', price: 100, pattern: 'hex', colors: ['#d99a76', '#cf8a66', '#e3a986'] },
  { id: 'terrazzo', name: 'Terrazzo', surface: 'floor', theme: 'studio', price: null, source: { type: 'quiz', id: 'design', label: 'Perfect score in Design Eye' }, pattern: 'terrazzo', colors: ['#f1e8dc', '#e59aa6', '#a8c79e', '#f6d88a', '#86bccb'] },
  { id: 'checker-lino', name: 'Checker Lino', surface: 'floor', theme: 'studio', price: 90, pattern: 'checker', colors: ['#f4ead8', '#c8dbf3'] },
  // walls
  { id: 'buttermilk-plaster', name: 'Buttermilk Plaster', surface: 'wall', theme: 'studio', price: 0, pattern: 'plaster', colors: ['#f6e9cf', '#efdfc0'] },
  { id: 'log-wall', name: 'Log Wall', surface: 'wall', theme: 'cabin', price: 120, pattern: 'logs', colors: ['#d39b67', '#bf8656', '#e0ae7c'] },
  { id: 'tartan-paper', name: 'Tartan Paper', surface: 'wall', theme: 'cabin', price: 100, pattern: 'tartan', colors: ['#e7c9a8', '#c97b6a', '#9fb28f'] },
  { id: 'hut-stripes', name: 'Beach Hut Stripes', surface: 'wall', theme: 'seaside', price: 90, pattern: 'stripes', colors: ['#f7f1e6', '#a9d0ea'] },
  { id: 'fern-paper', name: 'Fern Wallpaper', surface: 'wall', theme: 'garden', price: 110, pattern: 'fern', colors: ['#eef0dc', '#8fb27c'] },
  { id: 'sage-limewash', name: 'Sage Limewash', surface: 'wall', theme: 'garden', price: 80, pattern: 'plaster', colors: ['#c9d9bd', '#b9cdab'] },
];
export const MATERIALS: Record<string, MaterialDef> = Object.fromEntries(MATERIALS_LIST.map((m) => [m.id, m]));

// ---------------------------------------------------------------- themes & sets
export const THEMES: ThemeDef[] = [
  {
    id: 'cabin', name: 'Cosy Cabin', colour: '#d9846b', blurb: 'Pine, plaid and the smell of woodsmoke.',
    items: ['log-stool', 'plaid-armchair', 'quilted-bed', 'stump-table', 'log-bookcase', 'knit-rug', 'brass-lantern', 'cabin-window', 'wood-stove'],
    bonus: 'long-clock',
  },
  {
    id: 'seaside', name: 'Seaside', colour: '#6fa9c4', blurb: 'Stripes, driftwood and a breeze off the water.',
    items: ['deckchair', 'driftwood-bench', 'hut-dresser', 'shell-lamp', 'rope-rug', 'sandcastle', 'lifebuoy', 'porthole', 'sailboat'],
    bonus: 'lighthouse-lamp',
  },
  {
    id: 'garden', name: 'Greenhouse', colour: '#7fab68', blurb: 'Leaves, terracotta and warm, damp air.',
    items: ['potted-fern', 'monstera', 'wicker-chair', 'potting-bench', 'succulent', 'grass-mat', 'botanical-print', 'wall-sconce', 'watering-can'],
    bonus: 'lemon-tree',
  },
  {
    id: 'studio', name: 'Sunday Studio', colour: '#a68cc9', blurb: 'Soft curves, terrazzo and a record on.',
    items: ['pill-sofa', 'oval-table', 'globe-lamp', 'terrazzo-plinth', 'cube-shelf', 'squiggle-rug', 'tulip-vase', 'abstract-print', 'record-player'],
    bonus: 'cloud-chair',
  },
];
export const THEME_BY_ID: Record<ThemeId, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, ThemeDef>;

// ---------------------------------------------------------------- new players
export const STARTER_TOKENS = 200;
export const STARTER_INVENTORY: Record<string, number> = {
  'pill-sofa': 1, 'log-stool': 2, 'stump-table': 1, 'potted-fern': 1, 'shell-lamp': 1, 'knit-rug': 1, 'botanical-print': 1, 'succulent': 1,
};
export const STARTER_MATERIALS = ['oak-planks', 'buttermilk-plaster'];

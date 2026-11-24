// Tiny synthesised sound effects (no audio files): soft pops, clicks and chimes.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => { try { return localStorage.getItem('pc.sound') === 'off'; } catch { return false; } })();

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; to?: number; delay?: number; vol?: number } = {}) {
  if (muted) return;
  const c = ac();
  const t0 = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.5, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone(720, 0.07, { type: 'triangle', to: 520, vol: 0.35 }),
  pop: () => tone(520, 0.12, { to: 260, vol: 0.5 }),
  place: () => { tone(330, 0.1, { to: 180, vol: 0.55 }); tone(660, 0.08, { type: 'triangle', delay: 0.04, vol: 0.2 }); },
  lift: () => tone(260, 0.1, { to: 480, vol: 0.4 }),
  blip: () => tone(880, 0.06, { type: 'sine', to: 990, vol: 0.18 }),
  nope: () => { tone(220, 0.09, { type: 'triangle', vol: 0.35 }); tone(180, 0.12, { type: 'triangle', delay: 0.08, vol: 0.35 }); },
  coin: () => { tone(988, 0.08, { type: 'triangle', vol: 0.3 }); tone(1319, 0.16, { type: 'triangle', delay: 0.07, vol: 0.3 }); },
  chime: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { delay: i * 0.09, vol: 0.3 })),
  flip: () => tone(600, 0.05, { type: 'square', to: 900, vol: 0.08 }),
  right: () => { tone(660, 0.1, { vol: 0.35 }); tone(990, 0.16, { delay: 0.08, vol: 0.3 }); },
  wrong: () => tone(300, 0.2, { type: 'triangle', to: 200, vol: 0.3 }),
};

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('pc.sound', m ? 'off' : 'on'); } catch { /* ignore */ }
}

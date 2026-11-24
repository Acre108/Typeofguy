// Procedural textures drawn on canvases. Simple, readable patterns rather than
// photoreal detail: grain, weave, terrazzo chips, plaster mottling.

import * as THREE from 'three';
import { MATERIALS } from '../../../shared/catalogue';
import type { PartTexture } from '../../../shared/types';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, r: () => number, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 1.4})`;
    const s = 1 + r() * 2;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- furniture part textures

const partCache = new Map<string, THREE.Texture>();

/** Greyscale textures get multiplied by the part colour; two-tone ones carry their own colour. */
export function partTexture(kind: PartTexture, c: string, c2?: string): { map: THREE.Texture; tinted: boolean } | null {
  if (kind === 'plain' || kind === 'glow') return null;
  const twoTone = ['stripe', 'band', 'plaid', 'terrazzo', 'paper', 'squiggle'].includes(kind);
  const key = twoTone ? `${kind}|${c}|${c2}` : kind;
  let tex = partCache.get(key);
  if (!tex) {
    tex = toTexture(drawPart(kind, c, c2 ?? '#ffffff'));
    partCache.set(key, tex);
  }
  return { map: tex, tinted: !twoTone };
}

function drawPart(kind: PartTexture, c: string, c2: string): HTMLCanvasElement {
  const S = 128;
  const [cv, x] = canvas(S);
  const r = rng(kind.length * 977 + c.charCodeAt(2));
  switch (kind) {
    case 'wood': {
      x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 14; i++) {
        const y0 = r() * S;
        x.strokeStyle = `rgba(90,60,30,${0.08 + r() * 0.1})`;
        x.lineWidth = 1 + r() * 2;
        x.beginPath();
        for (let px = 0; px <= S; px += 8) x.lineTo(px, y0 + Math.sin(px / 18 + i) * 3);
        x.stroke();
      }
      noise(x, S, S, 300, r, 0.04);
      break;
    }
    case 'fabric': {
      x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, S, S);
      x.globalAlpha = 0.07;
      for (let i = 0; i < S; i += 3) { x.fillStyle = '#000'; x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); }
      x.globalAlpha = 1;
      noise(x, S, S, 500, r, 0.03);
      break;
    }
    case 'weave': {
      x.fillStyle = '#e9e9e9'; x.fillRect(0, 0, S, S);
      const n = 8, s = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const horiz = (i + j) % 2 === 0;
        const g = x.createLinearGradient(i * s, j * s, horiz ? i * s : (i + 1) * s, horiz ? (j + 1) * s : j * s);
        g.addColorStop(0, '#d0d0d0'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#cacaca');
        x.fillStyle = g;
        x.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
      }
      break;
    }
    case 'knit': {
      x.fillStyle = '#e2e2e2'; x.fillRect(0, 0, S, S);
      const cols = 8, rows = 10, w = S / cols, h = S / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        x.fillStyle = '#fbfbfb';
        for (const side of [-1, 1]) {
          x.beginPath();
          x.ellipse(i * w + w / 2 + side * w * 0.2, j * h + h / 2, w * 0.24, h * 0.62, side * 0.5, 0, Math.PI * 2);
          x.fill();
        }
      }
      noise(x, S, S, 200, r, 0.04);
      break;
    }
    case 'stripe':
    case 'band': {
      const n = 6, s = S / n;
      for (let i = 0; i < n; i++) {
        x.fillStyle = i % 2 ? c2 : c;
        if (kind === 'stripe') x.fillRect(i * s, 0, s, S); else x.fillRect(0, i * s, S, s);
      }
      noise(x, S, S, 250, r, 0.03);
      break;
    }
    case 'plaid': {
      x.fillStyle = c; x.fillRect(0, 0, S, S);
      x.globalAlpha = 0.45;
      x.fillStyle = c2;
      for (let i = 0; i < S; i += 32) { x.fillRect(i + 4, 0, 10, S); x.fillRect(0, i + 4, S, 10); }
      x.globalAlpha = 0.25;
      x.fillStyle = shade(c, -0.25);
      for (let i = 0; i < S; i += 32) { x.fillRect(i + 22, 0, 3, S); x.fillRect(0, i + 22, S, 3); }
      x.globalAlpha = 1;
      break;
    }
    case 'terrazzo': {
      x.fillStyle = c; x.fillRect(0, 0, S, S);
      chips(x, S, r, ['#e59aa6', '#a8c79e', '#f6d88a', '#86bccb', '#cdb8a8'], 70, 2, 7);
      noise(x, S, S, 300, r, 0.03);
      break;
    }
    case 'leaf': {
      x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, S, S);
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2;
      for (let y = 8; y < S; y += 14) {
        x.beginPath(); x.moveTo(S / 2, y); x.lineTo(S * 0.1, y - 10); x.moveTo(S / 2, y); x.lineTo(S * 0.9, y - 10); x.stroke();
      }
      break;
    }
    case 'paper': {
      x.fillStyle = c; x.fillRect(0, 0, S, S);
      x.strokeStyle = c2; x.fillStyle = c2; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(S * 0.5, S * 0.92); x.quadraticCurveTo(S * 0.42, S * 0.5, S * 0.55, S * 0.1); x.stroke();
      for (let k = 0; k < 9; k++) {
        const t = 0.15 + k * 0.085;
        const px = S * (0.5 - 0.05 * Math.sin(t * 3)), py = S * (0.92 - t * 0.85);
        const len = S * (0.22 - k * 0.016);
        for (const side of [-1, 1]) {
          x.beginPath();
          x.ellipse(px + side * len / 2, py - 4, len / 2, 4, side * -0.4, 0, Math.PI * 2);
          x.fill();
        }
      }
      noise(x, S, S, 200, r, 0.03);
      break;
    }
    case 'squiggle': {
      x.fillStyle = c; x.fillRect(0, 0, S, S);
      x.strokeStyle = c2; x.lineWidth = 6; x.lineCap = 'round';
      for (let k = 0; k < 7; k++) {
        const cx = r() * S, cy = r() * S, a = r() * Math.PI;
        x.beginPath();
        for (let t = -1; t <= 1; t += 0.1) {
          const px = cx + Math.cos(a) * t * 22 + Math.sin(t * 6) * Math.sin(a) * 6;
          const py = cy + Math.sin(a) * t * 22 - Math.sin(t * 6) * Math.cos(a) * 6;
          if (t === -1) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
      }
      break;
    }
  }
  return cv;
}

function chips(x: CanvasRenderingContext2D, S: number, r: () => number, colours: string[], n: number, min: number, max: number) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colours[Math.floor(r() * colours.length)];
    const cx = r() * S, cy = r() * S, rad = min + r() * (max - min);
    x.beginPath();
    const sides = 4 + Math.floor(r() * 3);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + r() * 0.6;
      const rr = rad * (0.6 + r() * 0.5);
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.fill();
  }
}

// ---------------------------------------------------------------- room materials

const matCache = new Map<string, HTMLCanvasElement>();

/** Canvas for a floor or wall material. Floors cover 2×2 tiles, walls 1×1 units. */
export function materialCanvas(id: string): HTMLCanvasElement {
  let cv = matCache.get(id);
  if (cv) return cv;
  const m = MATERIALS[id] ?? MATERIALS['oak-planks'];
  const S = 256;
  const [c, x] = canvas(S);
  const r = rng(id.length * 131 + id.charCodeAt(0) * 7);
  const [a, b, d] = [m.colors[0], m.colors[1] ?? m.colors[0], m.colors[2] ?? m.colors[0]];
  switch (m.pattern) {
    case 'planks': {
      const rows = 5, h = S / rows;
      for (let j = 0; j < rows; j++) {
        let px = -r() * 160;
        while (px < S) {
          const len = 140 + r() * 140;
          x.fillStyle = [a, b, d][Math.floor(r() * 3)];
          x.fillRect(px, j * h, len, h);
          for (let k = 0; k < 4; k++) {
            x.strokeStyle = `rgba(80,50,20,${0.06 + r() * 0.06})`; x.lineWidth = 1;
            const y = j * h + 3 + r() * (h - 6);
            x.beginPath(); x.moveTo(px, y); x.bezierCurveTo(px + len / 3, y + 2, px + len * 0.6, y - 2, px + len, y); x.stroke();
          }
          x.fillStyle = 'rgba(70,40,20,0.16)'; x.fillRect(px, j * h, 2, h);
          px += len;
        }
        x.fillStyle = 'rgba(70,40,20,0.18)'; x.fillRect(0, j * h, S, 2);
        x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, j * h + 2, S, 2);
      }
      break;
    }
    case 'tile': {
      const n = 4, s = S / n;
      x.fillStyle = shade(a, -0.12); x.fillRect(0, 0, S, S);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        x.fillStyle = [a, b, d][Math.floor(r() * 3)];
        roundRect(x, i * s + 3, j * s + 3, s - 6, s - 6, 8); x.fill();
      }
      noise(x, S, S, 900, r, 0.04);
      break;
    }
    case 'hex': {
      x.fillStyle = shade(a, -0.18); x.fillRect(0, 0, S, S);
      const R = S / 8, w = Math.sqrt(3) * R;
      for (let row = -1; row < 7; row++) for (let col = -1; col < 6; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5;
        x.fillStyle = [a, b, d][Math.floor(r() * 3)];
        x.beginPath();
        for (let k = 0; k < 6; k++) { const ang = Math.PI / 6 + (k * Math.PI) / 3; x.lineTo(cx + Math.cos(ang) * (R - 3), cy + Math.sin(ang) * (R - 3)); }
        x.fill();
      }
      noise(x, S, S, 800, r, 0.05);
      break;
    }
    case 'terrazzo': {
      x.fillStyle = a; x.fillRect(0, 0, S, S);
      chips(x, S, r, m.colors.slice(1), 260, 2, 9);
      noise(x, S, S, 900, r, 0.03);
      break;
    }
    case 'checker': {
      const n = 4, s = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? b : a; x.fillRect(i * s, j * s, s, s); }
      noise(x, S, S, 600, r, 0.03);
      break;
    }
    case 'plaster': {
      x.fillStyle = a; x.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        const g = x.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 30 + r() * 50);
        g.addColorStop(0, b + '66'); g.addColorStop(1, b + '00');
        x.fillStyle = g; x.fillRect(0, 0, S, S);
      }
      noise(x, S, S, 1200, r, 0.025);
      break;
    }
    case 'logs': {
      const n = 3, h = S / n;
      for (let j = 0; j < n; j++) {
        const g = x.createLinearGradient(0, j * h, 0, (j + 1) * h);
        const base = [a, b, d][j % 3];
        g.addColorStop(0, shade(base, -0.14)); g.addColorStop(0.25, shade(base, 0.05)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -0.2));
        x.fillStyle = g; x.fillRect(0, j * h, S, h);
        for (let k = 0; k < 5; k++) {
          x.strokeStyle = 'rgba(80,50,20,0.1)';
          const y = j * h + 8 + r() * (h - 16);
          x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(S / 3, y + 3, (S * 2) / 3, y - 3, S, y); x.stroke();
        }
      }
      break;
    }
    case 'tartan': {
      x.fillStyle = a; x.fillRect(0, 0, S, S);
      x.globalAlpha = 0.35; x.fillStyle = b;
      for (let i = 0; i < S; i += 64) { x.fillRect(i + 10, 0, 18, S); x.fillRect(0, i + 10, S, 18); }
      x.globalAlpha = 0.3; x.fillStyle = d;
      for (let i = 0; i < S; i += 64) { x.fillRect(i + 44, 0, 6, S); x.fillRect(0, i + 44, S, 6); }
      x.globalAlpha = 1;
      noise(x, S, S, 800, r, 0.025);
      break;
    }
    case 'stripes': {
      const n = 4, s = S / n;
      for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * s, 0, s, S); }
      noise(x, S, S, 800, r, 0.025);
      break;
    }
    case 'fern': {
      x.fillStyle = a; x.fillRect(0, 0, S, S);
      x.strokeStyle = b; x.fillStyle = b; x.lineWidth = 2;
      const sprig = (cx: number, cy: number, ang: number, len: number) => {
        x.save(); x.translate(cx, cy); x.rotate(ang);
        x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -len); x.stroke();
        for (let k = 1; k < 7; k++) {
          const y = -len * (k / 7), l = len * 0.32 * (1 - k / 9);
          for (const side of [-1, 1]) { x.beginPath(); x.ellipse((side * l) / 2, y + 3, l / 2, 3, side * -0.5, 0, Math.PI * 2); x.fill(); }
        }
        x.restore();
      };
      for (const [cx, cy, ang] of [[60, 110, -0.3], [190, 90, 0.35], [125, 230, 0.1], [250, 240, -0.2], [-5, 240, 0.2]]) sprig(cx, cy, ang, 80);
      noise(x, S, S, 600, r, 0.02);
      break;
    }
  }
  matCache.set(id, c);
  return c;
}

const matTexCache = new Map<string, THREE.Texture>();
export function materialTexture(id: string): THREE.Texture {
  let t = matTexCache.get(id);
  if (!t) { t = toTexture(materialCanvas(id)); matTexCache.set(id, t); }
  return t;
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, rad: number) {
  x.beginPath();
  x.moveTo(px + rad, py);
  x.arcTo(px + w, py, px + w, py + h, rad);
  x.arcTo(px + w, py + h, px, py + h, rad);
  x.arcTo(px, py + h, px, py, rad);
  x.arcTo(px, py, px + w, py, rad);
  x.closePath();
}

// ---------------------------------------------------------------- soft shadows / glows

let blob: THREE.Texture | null = null;
/** Radial falloff used for contact shadows (fake ambient occlusion) under furniture and avatars. */
export function blobTexture(): THREE.Texture {
  if (blob) return blob;
  const [c, x] = canvas(128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

let edge: THREE.Texture | null = null;
/** Linear falloff for the darkening where floor meets wall. */
export function edgeTexture(): THREE.Texture {
  if (edge) return edge;
  const [c, x] = canvas(4, 64);
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  edge = new THREE.CanvasTexture(c);
  return edge;
}

let glow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const [c, x] = canvas(128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,226,170,0.9)'); g.addColorStop(0.35, 'rgba(255,214,150,0.35)'); g.addColorStop(1, 'rgba(255,210,140,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

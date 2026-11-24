// A small, extendable word filter. It normalises common letter swaps
// (0→o, 4→a, $→s…) and repeated letters before matching, then masks the
// matching characters in the original text. Extend BLOCKED to suit your community.

const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'cock', 'pussy', 'wank', 'twat', 'slut', 'whore',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'spastic', 'tranny', 'kys', 'killyourself', 'rape',
];
// Allowed words that happen to contain a blocked string.
const ALLOW = ['scunthorpe', 'cocktail', 'cockpit', 'peacock', 'dickens', 'shitake', 'grape', 'drape', 'therapist', 'scrape'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '|': 'i' };

function normalise(text: string): { chars: string; map: number[] } {
  // Lower-case, map look-alikes, drop separators between letters and collapse
  // repeats ("fuuuck", "f.u.c.k"); keep a map back to original indices.
  let chars = '';
  const map: number[] = [];
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    let ch = LEET[lower[i]] ?? lower[i];
    if (!/[a-z]/.test(ch)) continue;
    if (chars.length && chars[chars.length - 1] === ch) { map[map.length - 1] = i; continue; }
    chars += ch;
    map.push(i);
  }
  return { chars, map };
}

export interface FilterResult { text: string; flagged: boolean }

export function filterText(text: string): FilterResult {
  const clean = text.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  const { chars, map } = normalise(clean);
  const mask = new Array(clean.length).fill(false);
  let flagged = false;
  for (const word of BLOCKED) {
    const target = normalise(word).chars;
    let from = 0;
    while (true) {
      const at = chars.indexOf(target, from);
      if (at < 0) break;
      from = at + 1;
      const window = chars.slice(Math.max(0, at - 6), at + target.length + 6);
      if (ALLOW.some((a) => window.includes(a))) continue;
      // Short words only count at word boundaries in the original text, to avoid false positives.
      if (target.length <= 4) {
        const s = map[at], e = map[at + target.length - 1];
        const before = clean[s - 1], after = clean[e + 1];
        if ((before && /[a-z]/i.test(before)) || (after && /[a-z]/i.test(after))) continue;
      }
      flagged = true;
      const s = map[at];
      const e = at + target.length - 1 < map.length ? map[at + target.length - 1] : clean.length - 1;
      for (let k = s; k <= e; k++) if (/\S/.test(clean[k])) mask[k] = true;
    }
  }
  if (!flagged) return { text: clean, flagged };
  return { text: [...clean].map((ch, i) => (mask[i] ? '•' : ch)).join(''), flagged };
}

export function isCleanName(name: string): boolean {
  return !filterText(name).flagged;
}

export const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;

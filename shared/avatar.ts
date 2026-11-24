import type { AvatarLook, BottomStyle, HairStyle, TopStyle } from './types';

export const SKIN_TONES = ['#ffe0c7', '#f6c9a5', '#e8b08a', '#cf9168', '#a96e4c', '#7f5038'];
export const HAIR_COLOURS = ['#3b2f2f', '#6b4a35', '#a8693d', '#e0b46c', '#f1dcae', '#c45f4a', '#8f7fb8', '#7fb8a6', '#e9a3b6', '#d9d4cc'];
export const CLOTH_COLOURS = ['#ec9a86', '#f6d88a', '#a8c79e', '#a9d0ea', '#c8b5e6', '#f2bcc4', '#fbf7f1', '#6884a3', '#d98b67', '#86bccb', '#9db67c', '#625a5e'];
export const HAIR_STYLES: HairStyle[] = ['crop', 'bob', 'bun', 'curly', 'tuft', 'none'];
export const TOP_STYLES: TopStyle[] = ['tee', 'hoodie', 'stripe', 'pinafore'];
export const BOTTOM_STYLES: BottomStyle[] = ['trousers', 'shorts', 'skirt'];

export const STYLE_LABELS: Record<string, string> = {
  crop: 'Crop', bob: 'Bob', bun: 'Bun', curly: 'Curls', tuft: 'Tuft', none: 'Bald',
  tee: 'Tee', hoodie: 'Hoodie', stripe: 'Breton', pinafore: 'Pinafore',
  trousers: 'Trousers', shorts: 'Shorts', skirt: 'Skirt',
};

export function randomLook(seed = Math.random()): AvatarLook {
  let s = Math.floor(seed * 233280);
  const pick = <T>(arr: T[]) => arr[(s = (s * 9301 + 49297) % 233280) % arr.length];
  return {
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES.filter((h) => h !== 'none')),
    hairColor: pick(HAIR_COLOURS),
    top: pick(TOP_STYLES),
    topColor: pick(CLOTH_COLOURS),
    bottom: pick(BOTTOM_STYLES),
    bottomColor: pick(CLOTH_COLOURS),
  };
}

export function validLook(l: unknown): l is AvatarLook {
  const a = l as AvatarLook;
  return !!a && SKIN_TONES.includes(a.skin) && HAIR_STYLES.includes(a.hair) && HAIR_COLOURS.includes(a.hairColor)
    && TOP_STYLES.includes(a.top) && CLOTH_COLOURS.includes(a.topColor)
    && BOTTOM_STYLES.includes(a.bottom) && CLOTH_COLOURS.includes(a.bottomColor);
}

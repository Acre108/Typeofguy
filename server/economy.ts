// Tokens, inventory and set bonuses. All grants happen here, on the server.

import { FURNITURE, MATERIALS, THEMES } from '../shared/catalogue';
import type { Reward, UserProfile } from '../shared/types';
import type { UserData, UserRow } from './store';

export function toProfile(row: UserRow): UserProfile {
  const d = row.data;
  return {
    id: row.id, username: row.username, avatar: d.avatar, tokens: d.tokens, inventory: d.inventory,
    materials: d.materials, collection: d.collection, bonuses: d.bonuses, apartmentId: d.apartmentId, isNew: d.isNew,
    traits: d.traits ?? {}, traitsPublic: d.traitsPublic ?? true,
  };
}

export function addItem(d: UserData, id: string, n = 1) {
  d.inventory[id] = (d.inventory[id] ?? 0) + n;
  if (!d.collection.includes(id)) d.collection.push(id);
}

export function takeItem(d: UserData, id: string): boolean {
  if (!d.inventory[id]) return false;
  d.inventory[id] -= 1;
  if (d.inventory[id] <= 0) delete d.inventory[id];
  return true;
}

/** Grant any set bonuses the player has just earned. Returns the bonus item ids. */
export function checkSets(d: UserData): string[] {
  const out: string[] = [];
  for (const t of THEMES) {
    if (d.bonuses.includes(t.id)) continue;
    if (t.items.every((id) => d.collection.includes(id))) {
      d.bonuses.push(t.id);
      addItem(d, t.bonus);
      out.push(t.bonus);
    }
  }
  return out;
}

/**
 * Repeating the same activity pays less for a while: the first three rewards in
 * any 30 minutes pay in full, the next three pay half, then a quarter.
 */
export function diminishing(d: UserData, key: string, now = Date.now()): number {
  const WINDOW = 30 * 60 * 1000;
  const log = (d.activity[key] ?? []).filter((t) => now - t < WINDOW);
  const mult = log.length < 3 ? 1 : log.length < 6 ? 0.5 : 0.25;
  log.push(now);
  d.activity[key] = log;
  return mult;
}

export function grant(d: UserData, r: { tokens: number; items?: string[]; materials?: string[]; label: string; multiplier?: number }): Reward {
  const tokens = Math.max(0, Math.round(r.tokens));
  d.tokens += tokens;
  const items = (r.items ?? []).filter((id) => FURNITURE[id]);
  for (const id of items) addItem(d, id);
  const materials = (r.materials ?? []).filter((id) => MATERIALS[id] && !d.materials.includes(id));
  d.materials.push(...materials);
  const bonusItems = checkSets(d);
  return { tokens, items, materials, bonusItems, label: r.label, multiplier: r.multiplier ?? 1 };
}

export function buy(d: UserData, id: string, kind: 'item' | 'material'): string | null {
  if (kind === 'item') {
    const def = FURNITURE[id];
    if (!def) return 'Unknown item';
    if (def.price === null) return def.source ? `Not for sale: ${def.source.label.toLowerCase()}` : 'Not for sale';
    if (d.tokens < def.price) return 'Not enough pebbles';
    d.tokens -= def.price;
    addItem(d, id);
    return null;
  }
  const m = MATERIALS[id];
  if (!m) return 'Unknown material';
  if (d.materials.includes(id)) return 'You already own that';
  if (m.price === null) return m.source ? `Not for sale: ${m.source.label.toLowerCase()}` : 'Not for sale';
  if (d.tokens < m.price) return 'Not enough pebbles';
  d.tokens -= m.price;
  d.materials.push(id);
  return null;
}

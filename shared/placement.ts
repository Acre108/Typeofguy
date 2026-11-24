// Grid placement rules. The client uses these for the green/red ghost preview;
// the server runs exactly the same checks before it accepts any change.

import { FURNITURE } from './catalogue';
import { DOOR_ROWS, isFloorTile, wallById } from './rooms';
import type { FurnitureDef, PlacedItem, PlacedWallItem, RoomLayout, RoomShape, Rot } from './types';

export type Check = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Check => ({ ok: false, reason });
const OK: Check = { ok: true };

/** Footprint dimensions after rotation. */
export function dims(def: FurnitureDef, rot: Rot): [number, number] {
  return rot % 2 === 0 ? [def.size[0], def.size[1]] : [def.size[1], def.size[0]];
}

/** Rotate a local offset the same way the renderer does (three.js rotation.y = rot·90°). */
export function rotateOffset(x: number, z: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [x, z];
    case 1: return [z, -x];
    case 2: return [-x, -z];
    case 3: return [-z, x];
  }
}

/** World-space centre of an item's footprint. */
export function footprintCentre(def: FurnitureDef, x: number, z: number, rot: Rot): [number, number] {
  const [w, d] = dims(def, rot);
  return [x + w / 2, z + d / 2];
}

export function cells(def: FurnitureDef, x: number, z: number, rot: Rot): [number, number][] {
  const [w, d] = dims(def, rot);
  const out: [number, number][] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([x + i, z + j]);
  return out;
}

/** Map a cell in the item's own (unrotated) footprint to a world tile. */
export function localToWorld(def: FurnitureDef, x: number, z: number, rot: Rot, li: number, lj: number): [number, number] {
  const [cx, cz] = footprintCentre(def, x, z, rot);
  const [ox, oz] = rotateOffset(li + 0.5 - def.size[0] / 2, lj + 0.5 - def.size[1] / 2, rot);
  return [Math.round(cx + ox - 0.5), Math.round(cz + oz - 0.5)];
}

/** Inverse of localToWorld. */
export function worldToLocal(def: FurnitureDef, x: number, z: number, rot: Rot, wx: number, wz: number): [number, number] {
  const [cx, cz] = footprintCentre(def, x, z, rot);
  const inv = ((4 - rot) % 4) as Rot;
  const [lx, lz] = rotateOffset(wx + 0.5 - cx, wz + 0.5 - cz, inv);
  return [Math.round(lx + def.size[0] / 2 - 0.5), Math.round(lz + def.size[1] / 2 - 0.5)];
}

/** Direction (radians, three.js rotation.y) an item's front faces. */
export function facingOf(rot: Rot): number {
  return (rot * Math.PI) / 2;
}

export function defOf(id: string): FurnitureDef | undefined {
  return FURNITURE[id];
}

/** Floor items whose footprint covers (x, z). Children (stacked) are excluded. */
export function itemsAt(layout: RoomLayout, x: number, z: number, ignore?: Set<string>): PlacedItem[] {
  const out: PlacedItem[] = [];
  for (const it of layout.items) {
    if (it.parent || ignore?.has(it.uid)) continue;
    const def = FURNITURE[it.def];
    if (!def) continue;
    const [w, d] = dims(def, it.rot);
    if (x >= it.x && x < it.x + w && z >= it.z && z < it.z + d) out.push(it);
  }
  return out;
}

export function childrenOf(layout: RoomLayout, uid: string): PlacedItem[] {
  return layout.items.filter((it) => it.parent === uid);
}

export interface FloorCandidate {
  def: string;
  x: number;
  z: number;
  rot: Rot;
  parent?: string;
}

/** Validate a floor placement. `moving` is the uid being moved (ignored for collisions). */
export function checkFloor(shape: RoomShape, layout: RoomLayout, c: FloorCandidate, moving?: string): Check {
  const def = FURNITURE[c.def];
  if (!def) return fail('Unknown item');
  if (def.kind !== 'floor') return fail('That goes on a wall');
  if (![0, 1, 2, 3].includes(c.rot)) return fail('Bad rotation');
  if (!Number.isInteger(c.x) || !Number.isInteger(c.z)) return fail('Off the grid');

  const ignore = new Set<string>();
  if (moving) {
    ignore.add(moving);
    for (const ch of childrenOf(layout, moving)) ignore.add(ch.uid);
  }

  if (c.parent) {
    if (!def.small) return fail('Only small items fit on a surface');
    const parent = layout.items.find((i) => i.uid === c.parent);
    if (!parent || ignore.has(parent.uid)) return fail('Surface not found');
    if (parent.parent) return fail('Only one level of stacking');
    const pdef = FURNITURE[parent.def];
    if (!pdef?.surface) return fail('Nothing can stand on that');
    if (moving && childrenOf(layout, moving).length > 0) return fail('Clear the top first');
    const covered = cells(pdef, parent.x, parent.z, parent.rot).some(([x, z]) => x === c.x && z === c.z);
    if (!covered) return fail('Not on the surface');
    const taken = layout.items.some((i) => i.parent === parent.uid && !ignore.has(i.uid) && i.x === c.x && i.z === c.z);
    if (taken) return fail('Something is already there');
    return OK;
  }

  const door = shape.door;
  for (const [x, z] of cells(def, c.x, c.z, c.rot)) {
    if (!isFloorTile(shape, x, z)) return fail('Outside the room');
    if (x === door.x && z === door.z) return fail('Keep the doorway clear');
    for (const other of itemsAt(layout, x, z, ignore)) {
      const odef = FURNITURE[other.def];
      if (!odef) continue;
      // Rugs only collide with rugs; everything else only with non-rugs.
      if (!!odef.rug === !!def.rug) return fail('Something is in the way');
    }
  }
  return OK;
}

export interface WallCandidate {
  def: string;
  wall: string;
  u: number;
  v: number;
}

export function checkWall(shape: RoomShape, layout: RoomLayout, c: WallCandidate, moving?: string): Check {
  const def = FURNITURE[c.def];
  if (!def) return fail('Unknown item');
  if (def.kind !== 'wall') return fail('That goes on the floor');
  const wall = wallById(shape, c.wall);
  if (!wall) return fail('No wall there');
  if (!Number.isInteger(c.u) || !Number.isInteger(c.v)) return fail('Off the grid');
  const [w, h] = def.size;
  if (c.u < 0 || c.v < 0 || c.u + w > wall.length || c.v + h > shape.wallRows) return fail('Off the wall');
  if (shape.door.wall === c.wall && overlaps(c.u, c.v, w, h, shape.door.u, 0, 1, DOOR_ROWS)) return fail('Keep the doorway clear');
  for (const other of layout.wallItems) {
    if (other.uid === moving || other.wall !== c.wall) continue;
    const odef = FURNITURE[other.def];
    if (!odef) continue;
    if (overlaps(c.u, c.v, w, h, other.u, other.v, odef.size[0], odef.size[1])) return fail('Something is in the way');
  }
  return OK;
}

function overlaps(u1: number, v1: number, w1: number, h1: number, u2: number, v2: number, w2: number, h2: number) {
  return u1 < u2 + w2 && u2 < u1 + w1 && v1 < v2 + h2 && v2 < v1 + h1;
}

/** When a surface item moves or rotates, carry its stacked children along. */
export function relocateChildren(layout: RoomLayout, parent: PlacedItem, next: { x: number; z: number; rot: Rot }): PlacedItem[] {
  const pdef = FURNITURE[parent.def];
  if (!pdef) return [];
  return childrenOf(layout, parent.uid).map((ch) => {
    const [li, lj] = worldToLocal(pdef, parent.x, parent.z, parent.rot, ch.x, ch.z);
    const [nx, nz] = localToWorld(pdef, next.x, next.z, next.rot, li, lj);
    const rot = (((ch.rot + next.rot - parent.rot) % 4) + 4) % 4 as Rot;
    return { ...ch, x: nx, z: nz, rot };
  });
}

/** Tiles avatars can't walk through. */
export function blockedTiles(shape: RoomShape, layout: RoomLayout): Set<string> {
  const out = new Set<string>();
  for (const it of layout.items) {
    if (it.parent) continue;
    const def = FURNITURE[it.def];
    if (!def || def.rug) continue;
    for (const [x, z] of cells(def, it.x, it.z, it.rot)) out.add(`${x},${z}`);
  }
  return out;
}

/** If (x, z) is part of a seat, return how to sit there. */
export function seatAt(layout: RoomLayout, x: number, z: number): { item: PlacedItem; y: number; facing: number } | null {
  for (const it of itemsAt(layout, x, z)) {
    const def = FURNITURE[it.def];
    if (def?.seat) return { item: it, y: def.seat, facing: facingOf(it.rot) };
  }
  return null;
}

export function wallItemsOn(layout: RoomLayout, wall: string): PlacedWallItem[] {
  return layout.wallItems.filter((w) => w.wall === wall);
}

export function newUid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

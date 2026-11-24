// Room shapes and default layouts. Shapes are data, so a lobby, a café or an
// L-shaped flat is a new entry here (plus a RoomRecord with kind 'public').

import type { RoomLayout, RoomShape, WallSegment } from './types';

export const WALL_ROW_HEIGHT = 0.5;
export const DOOR_ROWS = 4; // door opening is 1 slot wide and 2.0 units tall

export const SHAPES: Record<string, RoomShape> = {
  apartment: {
    id: 'apartment',
    name: 'Studio apartment',
    width: 10,
    depth: 10,
    walls: [
      { id: 'n', x: 0, z: 0, axis: 'x', length: 10 },
      { id: 'w', x: 0, z: 0, axis: 'z', length: 10 },
    ],
    wallRows: 6,
    door: { wall: 'n', u: 2, x: 2, z: 0 },
    capacity: 12,
  },
  // Example of a future shared space; not used by the first version, but the
  // placement, pathfinding and renderer all accept it already.
  cafe: {
    id: 'cafe',
    name: 'Corner café',
    width: 14,
    depth: 12,
    mask: [
      '##############',
      '##############',
      '##############',
      '##############',
      '##############',
      '##############',
      '##############',
      '########......',
      '########......',
      '########......',
      '########......',
      '########......',
    ],
    walls: [
      { id: 'n', x: 0, z: 0, axis: 'x', length: 14 },
      { id: 'w', x: 0, z: 0, axis: 'z', length: 12 },
    ],
    wallRows: 7,
    door: { wall: 'w', u: 5, x: 0, z: 5 },
    capacity: 30,
  },
};

export function isFloorTile(shape: RoomShape, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= shape.width || z >= shape.depth) return false;
  if (!shape.mask) return true;
  return shape.mask[z]?.[x] === '#';
}

export function wallById(shape: RoomShape, id: string): WallSegment | undefined {
  return shape.walls.find((w) => w.id === id);
}

export function defaultApartmentLayout(): RoomLayout {
  return {
    floor: 'oak-planks',
    wall: 'buttermilk-plaster',
    items: [
      { uid: 'rug1', def: 'knit-rug', x: 4, z: 3, rot: 0 },
      { uid: 'sofa1', def: 'pill-sofa', x: 4, z: 2, rot: 0 },
      { uid: 'tbl1', def: 'stump-table', x: 6, z: 2, rot: 0 },
      { uid: 'lamp1', def: 'shell-lamp', x: 6, z: 2, rot: 0, parent: 'tbl1' },
      { uid: 'stool1', def: 'log-stool', x: 4, z: 5, rot: 2 },
      { uid: 'stool2', def: 'log-stool', x: 5, z: 5, rot: 2 },
      { uid: 'fern1', def: 'potted-fern', x: 9, z: 0, rot: 0 },
    ],
    wallItems: [{ uid: 'print1', def: 'botanical-print', wall: 'w', u: 4, v: 3 }],
  };
}

/** Items used by defaultApartmentLayout (removed from a new player's inventory). */
export function layoutItemCounts(layout: RoomLayout): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of layout.items) counts[it.def] = (counts[it.def] ?? 0) + 1;
  for (const it of layout.wallItems) counts[it.def] = (counts[it.def] ?? 0) + 1;
  return counts;
}

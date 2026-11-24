// A* over the tile grid with 8-way movement and no corner cutting.

import { isFloorTile } from './rooms';
import type { RoomShape } from './types';

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Shortest path from start to goal, excluding the start tile.
 * `blocked` holds "x,z" keys. The goal may be blocked if `allowBlockedGoal`
 * (used for walking onto a seat). Returns null when there is no route.
 */
export function findPath(
  shape: RoomShape,
  blocked: Set<string>,
  start: [number, number],
  goal: [number, number],
  allowBlockedGoal = false,
): [number, number][] | null {
  const [gx, gz] = goal;
  if (!isFloorTile(shape, gx, gz)) return null;
  if (start[0] === gx && start[1] === gz) return [];
  const goalKey = `${gx},${gz}`;
  if (blocked.has(goalKey) && !allowBlockedGoal) return null;

  const W = shape.width;
  const idx = (x: number, z: number) => z * W + x;
  const passable = (x: number, z: number) =>
    isFloorTile(shape, x, z) && (!blocked.has(`${x},${z}`) || (x === gx && z === gz && allowBlockedGoal));

  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open: { i: number; f: number }[] = [];
  const h = (x: number, z: number) => {
    const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const s = idx(start[0], start[1]);
  g.set(s, 0);
  open.push({ i: s, f: h(start[0], start[1]) });
  const closed = new Set<number>();

  while (open.length) {
    // Rooms are small (~100 tiles), so a linear scan beats a heap here.
    let best = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
    const { i } = open.splice(best, 1)[0];
    if (closed.has(i)) continue;
    closed.add(i);
    const x = i % W, z = Math.floor(i / W);
    if (x === gx && z === gz) {
      const path: [number, number][] = [];
      let cur = i;
      while (cur !== s) {
        path.push([cur % W, Math.floor(cur / W)]);
        cur = came.get(cur)!;
      }
      return path.reverse();
    }
    for (const [dx, dz, cost] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (!passable(nx, nz)) continue;
      // Diagonals need both side tiles clear, so avatars never clip corners.
      if (dx && dz && (!passable(x + dx, z) || !passable(x, z + dz))) continue;
      const ni = idx(nx, nz);
      if (closed.has(ni)) continue;
      const ng = g.get(i)! + cost;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, i);
        open.push({ i: ni, f: ng + h(nx, nz) });
      }
    }
  }
  return null;
}

/** Duration in ms to walk a path from `from` at `speed` tiles per second. */
export function pathDuration(from: [number, number], path: [number, number][], speed: number): number {
  let d = 0;
  let px = from[0], pz = from[1];
  for (const [x, z] of path) {
    d += Math.hypot(x - px, z - pz);
    px = x; pz = z;
  }
  return (d / speed) * 1000;
}

/** Position along a path after `elapsed` ms. Returns a fractional position and the last tile reached. */
export function positionAlong(
  from: [number, number], path: [number, number][], speed: number, elapsedMs: number,
): { x: number; z: number; tile: [number, number]; next: [number, number] | null; done: boolean; heading: number | null } {
  let remaining = (elapsedMs / 1000) * speed;
  let px = from[0], pz = from[1];
  let heading: number | null = null;
  for (let k = 0; k < path.length; k++) {
    const [x, z] = path[k];
    const seg = Math.hypot(x - px, z - pz);
    heading = Math.atan2(x - px, z - pz);
    if (remaining < seg) {
      const t = remaining / seg;
      return { x: px + (x - px) * t, z: pz + (z - pz) * t, tile: [px, pz], next: [x, z], done: false, heading };
    }
    remaining -= seg;
    px = x; pz = z;
  }
  return { x: px, z: pz, tile: [px, pz], next: null, done: true, heading };
}

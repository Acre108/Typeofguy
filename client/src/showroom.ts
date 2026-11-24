// Dev showroom: open /?showroom to see every catalogue item laid out in one
// room, with no server or account needed. Handy when authoring new furniture.

import { FURNITURE_LIST } from '../../shared/catalogue';
import { checkFloor, checkWall, dims } from '../../shared/placement';
import type { PlacedItem, PlacedWallItem, RoomLayout, RoomShape, Rot } from '../../shared/types';
import { randomLook } from '../../shared/avatar';
import { World } from './render/world';
import { h } from './ui/dom';

export function startShowroom(root: HTMLElement) {
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  const defs = FURNITURE_LIST.filter((d) => !theme || d.theme === theme);
  const shape: RoomShape = {
    id: 'showroom', name: 'Showroom', width: 14, depth: 14, wallRows: 6, capacity: 1,
    walls: [{ id: 'n', x: 0, z: 0, axis: 'x', length: 14 }, { id: 'w', x: 0, z: 0, axis: 'z', length: 14 }],
    door: { wall: 'n', u: 12, x: 12, z: 0 },
  };
  const layout: RoomLayout = {
    floor: params.get('floor') ?? 'oak-planks', wall: params.get('wall') ?? 'buttermilk-plaster', items: [], wallItems: [],
  };
  // Greedy packing: walk the grid and drop each floor item in the first spot that fits.
  let n = 0;
  for (const def of defs.filter((d) => d.kind === 'floor')) {
    const rot: Rot = 0;
    const [w, d] = dims(def, rot);
    let placed = false;
    for (let z = 1; z + d <= shape.depth && !placed; z += 1) {
      for (let x = 1; x + w <= shape.width && !placed; x += 1) {
        const cand = { def: def.id, x, z, rot };
        // leave a one-tile gap around everything so models are easy to read
        const ring = { ...layout, items: layout.items.map((i) => ({ ...i })) };
        if (!checkFloor(shape, ring, cand).ok) continue;
        const clear = [-1, 0, 1].every((dx) => [-1, 0, 1].every((dz) => checkFloor(shape, ring, { ...cand, x: x + dx, z: z + dz }).ok || (dx === 0 && dz === 0)));
        if (!clear && !def.rug) continue;
        layout.items.push({ uid: `s${n++}`, ...cand } as PlacedItem);
        placed = true;
      }
    }
  }
  let u = 0, wallId = 'w';
  for (const def of defs.filter((d) => d.kind === 'wall')) {
    let ok = false;
    while (!ok && u < 14) {
      const cand = { def: def.id, wall: wallId, u, v: 2 };
      ok = checkWall(shape, layout, cand).ok;
      if (ok) layout.wallItems.push({ uid: `w${n++}`, ...cand } as PlacedWallItem);
      u += ok ? def.size[0] + 1 : 1;
      if (u >= 13 && wallId === 'w') { wallId = 'n'; u = 0; }
    }
  }
  root.replaceChildren();
  const stage = h('div', { id: 'stage' });
  root.append(stage, h('div', { class: 'card', style: { position: 'fixed', top: '14px', left: '14px', padding: '10px 14px' } },
    h('b', null, 'Showroom'), h('div', { class: 'muted-text' }, `${layout.items.length + layout.wallItems.length} items · Q/E rotate · scroll to zoom`)));
  const world = new World(stage);
  world.setRoom(shape, layout);
  world.zoomBy(0.8);
  world.addAvatar({ userId: 'a', name: 'Model', avatar: randomLook(0.3), x: 6, z: 12, path: [], pathStart: 0, facing: 0.6, state: 'stand' }, 0);
  world.addAvatar({ userId: 'b', name: 'Model', avatar: randomLook(0.71), x: 8, z: 12, path: [], pathStart: 0, facing: -0.4, state: 'dance' }, 0);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'q') world.rotateView(-1);
    if (e.key === 'e') world.rotateView(1);
  });
  stage.addEventListener('wheel', (e) => world.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1));
  (window as any).pebble = { world };
}

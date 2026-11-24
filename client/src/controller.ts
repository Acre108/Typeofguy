// Turns pointer input into intents: walking, sitting, and (in edit mode) the
// ghost preview, placement, moving, rotating, storing and undo.

import { FURNITURE } from '../../shared/catalogue';
import { blockedTiles, cells, checkFloor, checkWall, childrenOf, dims, seatAt } from '../../shared/placement';
import { WALL_ROW_HEIGHT } from '../../shared/rooms';
import type { PlacedItem, Rot } from '../../shared/types';
import { sfx } from './audio';
import { net } from './net';
import type { World } from './render/world';
import { state } from './state';
import { toast } from './ui/dom';

type FloorTarget = { x: number; z: number; rot: Rot; parent?: string };
type WallTarget = { wall: string; u: number; v: number };

type Placing =
  | { kind: 'floor'; def: string; rot: Rot; moving?: string; target?: FloorTarget; ok?: boolean }
  | { kind: 'wall'; def: string; moving?: string; target?: WallTarget; ok?: boolean };

type Undo =
  | { t: 'placed'; uid: string }
  | { t: 'moved'; uid: string; x: number; z: number; rot: Rot; parent?: string }
  | { t: 'picked'; uid: string; item: Omit<PlacedItem, 'uid'>; children: Omit<PlacedItem, 'uid' | 'parent'>[] }
  | { t: 'wallPlaced'; uid: string }
  | { t: 'wallMoved'; uid: string; wall: string; u: number; v: number }
  | { t: 'wallPicked'; uid: string; item: { def: string; wall: string; u: number; v: number } }
  | { t: 'material'; surface: 'floor' | 'wall'; prev: string };

export class Controller {
  placing: Placing | null = null;
  selected: { uid: string; wall: boolean } | null = null;
  private undoStack: Undo[] = [];
  private busy = false;
  onChange: () => void = () => {};
  onAvatarClick: (userId: string) => void = () => {};
  private pointers = new Map<number, { x: number; y: number }>();
  private down: { x: number; y: number; moved: boolean } | null = null;
  private pinchDist = 0;
  private lastHover: { x: number; y: number } | null = null;

  constructor(private world: World, private canvas: HTMLElement) {
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.pointerUp(e));
    canvas.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.down = null; });
    canvas.addEventListener('pointerleave', () => { if (!this.placing) world.showMarker(null); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.world.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    state.on('mode', (m) => { if (m === 'walk') this.reset(); this.world.setGrid(m === 'edit'); });
    state.on('room', () => { this.reset(); this.undoStack = []; this.onChange(); });
    state.on('layout', () => {
      // Drop the selection if the item disappeared; refresh the ghost colour.
      if (this.selected && !this.findAny(this.selected.uid)) this.select(null);
      if (this.lastHover && this.placing) this.hover(this.lastHover.x, this.lastHover.y);
      this.world.showSelection(this.selected?.uid ?? null);
    });
  }

  get canUndo() { return this.undoStack.length > 0; }

  private reset() {
    this.placing = null;
    this.selected = null;
    this.world.showGhost(null);
    this.world.setItemHidden(null);
    this.world.showSelection(null);
    this.world.showMarker(null);
    this.onChange();
  }

  private findAny(uid: string) {
    const l = state.room?.layout;
    return l?.items.find((i) => i.uid === uid) ?? l?.wallItems.find((i) => i.uid === uid);
  }

  // ------------------------------------------------------------ pointer plumbing
  private pointerDown(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.down) this.down.moved = true;
    }
  }

  private pointerMove(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    if (prev) {
      if (this.pointers.size === 2) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.world.zoomBy(d / this.pinchDist);
        this.pinchDist = d;
        return;
      }
      if (this.down) {
        const dist = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
        if (dist > 7) this.down.moved = true;
        if (this.down.moved && !this.placing) {
          this.world.panBy(e.clientX - prev.x, e.clientY - prev.y);
          this.canvas.style.cursor = 'grabbing';
        }
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (e.pointerType === 'mouse' || this.placing) this.hover(e.clientX, e.clientY);
  }

  private pointerUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    const d = this.down;
    if (this.pointers.size === 0) this.down = null;
    this.canvas.style.cursor = '';
    if (!d || d.moved) return;
    if (e.pointerType !== 'mouse') this.hover(e.clientX, e.clientY);
    this.click(e.clientX, e.clientY);
  }

  // ------------------------------------------------------------ hover
  hover(x: number, y: number) {
    this.lastHover = { x, y };
    if (!state.room || !state.shape) return;
    if (state.mode === 'walk') {
      const p = this.world.pick(x, y, { items: true, avatars: true });
      const seat = p.item && FURNITURE[p.item.def]?.seat;
      this.canvas.style.cursor = p.avatar || seat ? 'pointer' : '';
      const blocked = p.tile && blockedTiles(state.shape, state.room.layout).has(`${p.tile[0]},${p.tile[1]}`);
      this.world.showMarker(p.avatar ? null : seat && p.itemPoint ? [Math.floor(p.itemPoint.x), Math.floor(p.itemPoint.z)] : blocked ? null : p.tile, seat ? '#ffe39a' : '#ffffff');
      return;
    }
    if (!this.placing) {
      const p = this.world.pick(x, y, { items: true });
      this.canvas.style.cursor = p.item || p.wallItem ? 'pointer' : '';
      this.world.showMarker(null);
      return;
    }
    this.canvas.style.cursor = 'crosshair';
    const shape = state.shape, layout = state.room.layout;
    const pl = this.placing;
    const def = FURNITURE[pl.def];
    if (pl.kind === 'floor') {
      const p = this.world.pick(x, y, { items: true });
      let tile = p.tile;
      let parent: string | undefined;
      const under = p.item;
      if (def.small && under && !under.parent && under.uid !== pl.moving && FURNITURE[under.def]?.surface && p.itemPoint) {
        const pdef = FURNITURE[under.def];
        const covered = cells(pdef, under.x, under.z, under.rot);
        const tx = Math.floor(p.itemPoint.x), tz = Math.floor(p.itemPoint.z);
        tile = covered.find(([cx, cz]) => cx === tx && cz === tz) ?? covered[0];
        parent = under.uid;
      }
      if (!tile) { this.world.showGhost(null); pl.target = undefined; return; }
      const [w, d] = dims(def, pl.rot);
      const target: FloorTarget = parent
        ? { x: tile[0], z: tile[1], rot: pl.rot, parent }
        : { x: tile[0] - Math.floor((w - 1) / 2), z: tile[1] - Math.floor((d - 1) / 2), rot: pl.rot };
      const check = checkFloor(shape, layout, { def: pl.def, ...target }, pl.moving);
      pl.target = target;
      pl.ok = check.ok;
      const baseY = parent ? FURNITURE[layout.items.find((i) => i.uid === parent)!.def].surface ?? 0 : 0;
      this.world.showGhost(pl.def, { x: target.x, z: target.z, rot: target.rot, y: baseY }, check.ok);
      this.world.showMarker(null);
    } else {
      const p = this.world.pick(x, y, { walls: true });
      if (!p.wall) { this.world.showGhost(null); pl.target = undefined; return; }
      const wall = shape.walls.find((w) => w.id === p.wall!.id)!;
      const [w, hgt] = def.size;
      const u = Math.max(0, Math.min(wall.length - w, Math.round(p.wall.along - w / 2)));
      const v = Math.max(0, Math.min(shape.wallRows - hgt, Math.round(p.wall.y / WALL_ROW_HEIGHT - hgt / 2)));
      const target = { wall: wall.id, u, v };
      const check = checkWall(shape, layout, { def: pl.def, ...target }, pl.moving);
      pl.target = target;
      pl.ok = check.ok;
      this.world.showGhost(pl.def, target, check.ok);
    }
  }

  // ------------------------------------------------------------ click
  private async click(x: number, y: number) {
    if (!state.room || !state.shape) return;
    if (state.mode === 'walk') {
      const p = this.world.pick(x, y, { items: true, avatars: true });
      if (p.avatar) return this.onAvatarClick(p.avatar);
      if (p.item && FURNITURE[p.item.def]?.seat && p.itemPoint) {
        const tile: [number, number] = [Math.floor(p.itemPoint.x), Math.floor(p.itemPoint.z)];
        const seat = seatAt(state.room.layout, tile[0], tile[1]) ? tile : cells(FURNITURE[p.item.def], p.item.x, p.item.z, p.item.rot)[0];
        return this.walk(seat, true);
      }
      if (p.tile) this.walk(p.tile, false);
      return;
    }
    // edit mode
    if (this.placing) return this.commitPlacing();
    const p = this.world.pick(x, y, { items: true });
    if (p.item) this.select({ uid: p.item.uid, wall: false });
    else if (p.wallItem) this.select({ uid: p.wallItem.uid, wall: true });
    else this.select(null);
  }

  private async walk(tile: [number, number], sit: boolean) {
    try { await net.request('move', { x: tile[0], z: tile[1], sit }); sfx.blip(); }
    catch (e) { toast((e as Error).message, 'warn'); }
  }

  select(sel: { uid: string; wall: boolean } | null) {
    this.selected = sel;
    this.world.showSelection(sel?.uid ?? null);
    if (sel) sfx.pop();
    this.onChange();
  }

  // ------------------------------------------------------------ placing
  startPlacing(defId: string) {
    const def = FURNITURE[defId];
    if (!def || !state.isOwner) return;
    if (state.mode !== 'edit') state.setMode('edit');
    this.select(null);
    this.world.setItemHidden(null);
    this.placing = def.kind === 'wall' ? { kind: 'wall', def: defId } : { kind: 'floor', def: defId, rot: 0 };
    sfx.lift();
    if (this.lastHover) this.hover(this.lastHover.x, this.lastHover.y);
    this.onChange();
  }

  startMoving() {
    if (!this.selected || !state.room) return;
    const layout = state.room.layout;
    if (this.selected.wall) {
      const it = layout.wallItems.find((w) => w.uid === this.selected!.uid);
      if (!it) return;
      this.placing = { kind: 'wall', def: it.def, moving: it.uid };
    } else {
      const it = layout.items.find((i) => i.uid === this.selected!.uid);
      if (!it) return;
      this.placing = { kind: 'floor', def: it.def, rot: it.rot, moving: it.uid };
    }
    this.world.setItemHidden(this.selected.uid);
    this.world.showSelection(null);
    sfx.lift();
    if (this.lastHover) this.hover(this.lastHover.x, this.lastHover.y);
    this.onChange();
  }

  cancelPlacing() {
    if (!this.placing) return false;
    const moving = this.placing.moving;
    this.placing = null;
    this.world.showGhost(null);
    this.world.setItemHidden(null);
    if (moving) this.select({ uid: moving, wall: !!state.room?.layout.wallItems.find((w) => w.uid === moving) });
    this.onChange();
    return true;
  }

  rotate() {
    if (this.placing?.kind === 'floor') {
      this.placing.rot = ((this.placing.rot + 1) % 4) as Rot;
      sfx.click();
      if (this.lastHover) this.hover(this.lastHover.x, this.lastHover.y);
      return;
    }
    if (this.selected && !this.selected.wall) this.rotateSelected();
  }

  private async rotateSelected() {
    const it = state.room?.layout.items.find((i) => i.uid === this.selected?.uid);
    if (!it || this.busy) return;
    const def = FURNITURE[it.def];
    const next = ((it.rot + 1) % 4) as Rot;
    // Try keeping the anchor, then nudging so the footprint stays put for non-square items.
    const [w, d] = dims(def, it.rot);
    const attempts: FloorTarget[] = [{ x: it.x, z: it.z, rot: next, parent: it.parent }];
    if (w !== d) attempts.push({ x: it.x + Math.floor((w - d) / 2), z: it.z + Math.floor((d - w) / 2), rot: next, parent: it.parent });
    const target = attempts.find((t) => checkFloor(state.shape!, state.room!.layout, { def: it.def, ...t }, it.uid).ok);
    if (!target) { toast("There isn't room to turn it here", 'warn'); return; }
    const prev = { x: it.x, z: it.z, rot: it.rot, parent: it.parent };
    await this.op(async () => {
      await net.request('edit.move', { uid: it.uid, ...target });
      this.push({ t: 'moved', uid: it.uid, ...prev });
      sfx.place();
    });
  }

  private async commitPlacing() {
    const pl = this.placing;
    if (!pl || !pl.target) return;
    if (!pl.ok) { sfx.nope(); return; }
    await this.op(async () => {
      if (pl.kind === 'floor') {
        const t = pl.target as FloorTarget;
        if (pl.moving) {
          const it = state.room!.layout.items.find((i) => i.uid === pl.moving)!;
          const prev = { x: it.x, z: it.z, rot: it.rot, parent: it.parent };
          await net.request('edit.move', { uid: pl.moving, ...t });
          this.push({ t: 'moved', uid: pl.moving, ...prev });
          this.finishMove(pl.moving, false);
        } else {
          const item = await net.request('edit.place', { def: pl.def, ...t });
          this.push({ t: 'placed', uid: item.uid });
          if (!state.profile?.inventory[pl.def]) this.cancelPlacing();
        }
      } else {
        const t = pl.target as WallTarget;
        if (pl.moving) {
          const it = state.room!.layout.wallItems.find((i) => i.uid === pl.moving)!;
          const prev = { wall: it.wall, u: it.u, v: it.v };
          await net.request('edit.wallMove', { uid: pl.moving, ...t });
          this.push({ t: 'wallMoved', uid: pl.moving, ...prev });
          this.finishMove(pl.moving, true);
        } else {
          const item = await net.request('edit.wallPlace', { def: pl.def, ...t });
          this.push({ t: 'wallPlaced', uid: item.uid });
          if (!state.profile?.inventory[pl.def]) this.cancelPlacing();
        }
      }
      sfx.place();
    });
  }

  private finishMove(uid: string, wall: boolean) {
    this.placing = null;
    this.world.showGhost(null);
    this.world.setItemHidden(null);
    this.select({ uid, wall });
  }

  async pickupSelected() {
    const sel = this.selected;
    if (!sel || !state.room) return;
    const layout = state.room.layout;
    await this.op(async () => {
      if (sel.wall) {
        const it = layout.wallItems.find((w) => w.uid === sel.uid);
        if (!it) return;
        await net.request('edit.wallPickup', { uid: it.uid });
        this.push({ t: 'wallPicked', uid: it.uid, item: { def: it.def, wall: it.wall, u: it.u, v: it.v } });
      } else {
        const it = layout.items.find((i) => i.uid === sel.uid);
        if (!it) return;
        const children = childrenOf(layout, it.uid).map(({ def, x, z, rot }) => ({ def, x, z, rot }));
        await net.request('edit.pickup', { uid: it.uid });
        this.push({ t: 'picked', uid: it.uid, item: { def: it.def, x: it.x, z: it.z, rot: it.rot, parent: it.parent }, children });
      }
      sfx.lift();
      this.select(null);
    });
  }

  async applyMaterial(surface: 'floor' | 'wall', id: string) {
    if (!state.room || state.room.layout[surface] === id) return;
    const prev = state.room.layout[surface];
    await this.op(async () => {
      await net.request('edit.material', { surface, material: id });
      this.push({ t: 'material', surface, prev });
      sfx.place();
    });
  }

  // ------------------------------------------------------------ undo
  private push(u: Undo) {
    this.undoStack.push(u);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.onChange();
  }

  private remap(oldUid: string, newUid: string) {
    for (const u of this.undoStack) if ('uid' in u && u.uid === oldUid) u.uid = newUid;
    for (const u of this.undoStack) if (u.t === 'moved' && u.parent === oldUid) u.parent = newUid;
  }

  async undo() {
    const u = this.undoStack.pop();
    if (!u) return;
    this.cancelPlacing();
    this.select(null);
    await this.op(async () => {
      switch (u.t) {
        case 'placed': await net.request('edit.pickup', { uid: u.uid }); break;
        case 'moved': await net.request('edit.move', { uid: u.uid, x: u.x, z: u.z, rot: u.rot, parent: u.parent }); break;
        case 'picked': {
          const placed = await net.request('edit.place', { ...u.item });
          this.remap(u.uid, placed.uid);
          for (const ch of u.children) await net.request('edit.place', { ...ch, parent: placed.uid }).catch(() => {});
          break;
        }
        case 'wallPlaced': await net.request('edit.wallPickup', { uid: u.uid }); break;
        case 'wallMoved': await net.request('edit.wallMove', { uid: u.uid, wall: u.wall, u: u.u, v: u.v }); break;
        case 'wallPicked': {
          const placed = await net.request('edit.wallPlace', u.item);
          this.remap(u.uid, placed.uid);
          break;
        }
        case 'material': await net.request('edit.material', { surface: u.surface, material: u.prev }); break;
      }
      sfx.pop();
    }, () => { /* failed undo is dropped rather than retried */ });
    this.onChange();
  }

  private async op(fn: () => Promise<void>, onFail?: () => void) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); }
    catch (e) { toast((e as Error).message, 'warn'); onFail?.(); }
    finally { this.busy = false; this.onChange(); }
  }
}

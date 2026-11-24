// Unit tests for the shared rules and the server-side economy.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FURNITURE, FURNITURE_LIST, MATERIALS_LIST, THEMES } from '../shared/catalogue';
import { filterText } from '../shared/filter';
import { findPath } from '../shared/pathfinding';
import { blockedTiles, cells, checkFloor, checkWall, localToWorld, relocateChildren, seatAt, worldToLocal } from '../shared/placement';
import { defaultApartmentLayout, SHAPES } from '../shared/rooms';
import type { RoomLayout, Rot } from '../shared/types';
import { answerQuiz, flipMemory, startMemory, startQuiz } from '../server/activities';
import { buy, checkSets, diminishing } from '../server/economy';
import type { UserData } from '../server/store';

const shape = SHAPES.apartment;
const empty = (): RoomLayout => ({ floor: 'oak-planks', wall: 'buttermilk-plaster', items: [], wallItems: [] });

test('catalogue is complete and consistent', () => {
  assert.equal(FURNITURE_LIST.length, 40);
  assert.equal(MATERIALS_LIST.length, 12);
  assert.equal(THEMES.length, 4);
  for (const t of THEMES) {
    assert.ok(FURNITURE[t.bonus], `bonus ${t.bonus} exists`);
    for (const id of t.items) assert.equal(FURNITURE[id]?.theme, t.id, `${id} belongs to ${t.id}`);
  }
  for (const d of FURNITURE_LIST) {
    assert.ok(d.parts.length > 0, `${d.id} has parts`);
    if (d.small) assert.deepEqual(d.size, [1, 1], `${d.id} small items are 1x1`);
    if (d.price === null) assert.ok(d.source, `${d.id} unpurchasable items say where they come from`);
  }
});

test('default apartment layout is valid', () => {
  const layout = defaultApartmentLayout();
  const check: RoomLayout = empty();
  for (const it of layout.items) {
    const r = checkFloor(shape, check, it);
    assert.ok(r.ok, `${it.def}: ${!r.ok && r.reason}`);
    check.items.push(it);
  }
  for (const w of layout.wallItems) assert.ok(checkWall(shape, check, w).ok);
});

test('footprints rotate and cells map back and forth', () => {
  const sofa = FURNITURE['pill-sofa']; // 2×1
  assert.deepEqual(cells(sofa, 3, 3, 0), [[3, 3], [4, 3]]);
  assert.deepEqual(cells(sofa, 3, 3, 1), [[3, 3], [3, 4]]);
  const bed = FURNITURE['quilted-bed']; // 2×3
  for (const rot of [0, 1, 2, 3] as Rot[]) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
      const [wx, wz] = localToWorld(bed, 4, 4, rot, i, j);
      assert.ok(cells(bed, 4, 4, rot).some(([x, z]) => x === wx && z === wz), 'local cell lands inside footprint');
      assert.deepEqual(worldToLocal(bed, 4, 4, rot, wx, wz), [i, j]);
    }
  }
});

test('placement: bounds, collisions, door and rugs', () => {
  const l = empty();
  assert.ok(checkFloor(shape, l, { def: 'pill-sofa', x: 4, z: 4, rot: 0 }).ok);
  assert.equal(checkFloor(shape, l, { def: 'pill-sofa', x: 9, z: 4, rot: 0 }).ok, false, 'off the edge');
  assert.equal(checkFloor(shape, l, { def: 'log-stool', x: shape.door.x, z: shape.door.z, rot: 0 }).ok, false, 'door tile');
  l.items.push({ uid: 'a', def: 'pill-sofa', x: 4, z: 4, rot: 0 });
  assert.equal(checkFloor(shape, l, { def: 'log-stool', x: 5, z: 4, rot: 0 }).ok, false, 'overlap');
  assert.ok(checkFloor(shape, l, { def: 'knit-rug', x: 4, z: 3, rot: 0 }).ok, 'rugs go under furniture');
  l.items.push({ uid: 'r', def: 'knit-rug', x: 4, z: 3, rot: 0 });
  assert.equal(checkFloor(shape, l, { def: 'rope-rug', x: 5, z: 5, rot: 0 }).ok, false, 'rugs collide with rugs');
  assert.ok(checkFloor(shape, l, { def: 'pill-sofa', x: 4, z: 4, rot: 0 }, 'a').ok, 'moving an item ignores itself');
});

test('stacking: one level, small items only, one per tile', () => {
  const l = empty();
  l.items.push({ uid: 't', def: 'oval-table', x: 2, z: 5, rot: 0 });
  assert.ok(checkFloor(shape, l, { def: 'tulip-vase', x: 3, z: 5, rot: 0, parent: 't' }).ok);
  assert.equal(checkFloor(shape, l, { def: 'tulip-vase', x: 4, z: 5, rot: 0, parent: 't' }).ok, false, 'off the surface');
  assert.equal(checkFloor(shape, l, { def: 'log-stool', x: 2, z: 5, rot: 0, parent: 't' }).ok, false, 'not small');
  assert.equal(checkFloor(shape, l, { def: 'tulip-vase', x: 2, z: 5, rot: 0, parent: 'nope' }).ok, false, 'missing parent');
  l.items.push({ uid: 'v', def: 'tulip-vase', x: 2, z: 5, rot: 0, parent: 't' });
  assert.equal(checkFloor(shape, l, { def: 'succulent', x: 2, z: 5, rot: 0, parent: 't' }).ok, false, 'tile taken');
  assert.equal(checkFloor(shape, l, { def: 'succulent', x: 2, z: 5, rot: 0, parent: 'v' }).ok, false, 'no second level');
  // Moving and rotating the table carries the vase with it.
  const [moved] = relocateChildren(l, l.items[0], { x: 6, z: 6, rot: 1 });
  const table = FURNITURE['oval-table'];
  assert.ok(cells(table, 6, 6, 1).some(([x, z]) => x === moved.x && z === moved.z));
  assert.equal(moved.rot, 1);
});

test('wall items: bounds, overlap and the door opening', () => {
  const l = empty();
  assert.ok(checkWall(shape, l, { def: 'cabin-window', wall: 'n', u: 5, v: 2 }).ok);
  assert.equal(checkWall(shape, l, { def: 'cabin-window', wall: 'n', u: 9, v: 2 }).ok, false, 'off the end');
  assert.equal(checkWall(shape, l, { def: 'cabin-window', wall: 'n', u: 5, v: 4 }).ok, false, 'too high');
  assert.equal(checkWall(shape, l, { def: 'lifebuoy', wall: 'n', u: shape.door.u, v: 1 }).ok, false, 'door');
  l.wallItems.push({ uid: 'w', def: 'cabin-window', wall: 'n', u: 5, v: 2 });
  assert.equal(checkWall(shape, l, { def: 'lifebuoy', wall: 'n', u: 6, v: 3 }).ok, false, 'overlap');
  assert.ok(checkWall(shape, l, { def: 'lifebuoy', wall: 'w', u: 6, v: 3 }).ok, 'other wall is free');
  assert.equal(checkWall(shape, l, { def: 'pill-sofa', wall: 'w', u: 1, v: 0 }).ok, false, 'floor item on wall');
});

test('pathfinding avoids furniture, never cuts corners, and can end on a seat', () => {
  const l = empty();
  l.items.push({ uid: 'b', def: 'log-bookcase', x: 3, z: 3, rot: 0 }); // blocks (3,3),(4,3)
  const blocked = blockedTiles(shape, l);
  const path = findPath(shape, blocked, [3, 1], [3, 5])!;
  assert.ok(path.length >= 4);
  for (const [x, z] of path) assert.ok(!blocked.has(`${x},${z}`));
  let prev: [number, number] = [3, 1];
  for (const step of path) {
    const dx = step[0] - prev[0], dz = step[1] - prev[1];
    if (dx && dz) assert.ok(!blocked.has(`${prev[0] + dx},${prev[1]}`) && !blocked.has(`${prev[0]},${prev[1] + dz}`), 'no corner cutting');
    prev = step;
  }
  assert.equal(findPath(shape, blocked, [0, 0], [3, 3]), null, 'cannot walk into furniture');
  l.items.push({ uid: 's', def: 'log-stool', x: 7, z: 7, rot: 0 });
  assert.ok(seatAt(l, 7, 7));
  assert.ok(findPath(shape, blockedTiles(shape, l), [0, 0], [7, 7], true), 'can walk onto a seat');
});

test('word filter masks bad words but leaves innocent ones', () => {
  assert.equal(filterText('what the fuck').flagged, true);
  assert.equal(filterText('sh1t happens').flagged, true);
  assert.equal(filterText('f.u.c.k').flagged, true);
  assert.ok(!filterText('what the fuck').text.includes('fuck'));
  for (const ok of ['I live in Scunthorpe', 'a cocktail by the peacock', 'class assignment', 'grapes and drapes', 'hello there']) {
    assert.equal(filterText(ok).flagged, false, ok);
  }
});

function user(tokens = 100): UserData {
  return { avatar: {} as any, tokens, inventory: {}, materials: [], collection: [], bonuses: [], apartmentId: 'x', isNew: false, activity: {} };
}

test('shop: prices, exclusives and owned materials', () => {
  const u = user(100);
  assert.equal(buy(u, 'log-stool', 'item'), null);
  assert.equal(u.tokens, 60);
  assert.equal(u.inventory['log-stool'], 1);
  assert.match(buy(u, 'wood-stove', 'item')!, /not for sale/i);
  assert.match(buy(u, 'quilted-bed', 'item')!, /not enough/i);
  assert.equal(buy(u, 'checker-lino', 'material'), 'Not enough pebbles');
  u.tokens = 500;
  assert.equal(buy(u, 'checker-lino', 'material'), null);
  assert.match(buy(u, 'checker-lino', 'material')!, /already/);
});

test('completing a set grants its bonus once', () => {
  const u = user();
  const cabin = THEMES.find((t) => t.id === 'cabin')!;
  u.collection = cabin.items.slice(0, -1);
  assert.deepEqual(checkSets(u), []);
  u.collection.push(cabin.items.at(-1)!);
  assert.deepEqual(checkSets(u), ['long-clock']);
  assert.equal(u.inventory['long-clock'], 1);
  assert.deepEqual(checkSets(u), []);
});

test('repeated rewards diminish', () => {
  const u = user();
  const m = [1, 2, 3, 4, 5, 6, 7].map(() => diminishing(u, 'quiz:x'));
  assert.deepEqual(m, [1, 1, 1, 0.5, 0.5, 0.5, 0.25]);
});

test('quiz is scored on the server, in order, without leaking answers', () => {
  const u = user(0);
  const s = startQuiz('u1', 'general');
  assert.ok(s.questions.every((q) => !('answer' in q)), 'answers are not sent to the client');
  assert.throws(() => answerQuiz(u, 'u1', s.sessionId, 1, 0), /order/);
  assert.throws(() => answerQuiz(u, 'someone-else', s.sessionId, 0, 0));
  let last;
  for (let i = 0; i < s.questions.length; i++) last = answerQuiz(u, 'u1', s.sessionId, i, 0);
  assert.ok(last!.done && last!.reward, 'the last answer settles the reward');
  assert.ok(u.tokens > 0, 'every score band pays something');
  assert.throws(() => answerQuiz(u, 'u1', s.sessionId, 0, 0), /finished/, 'a finished quiz cannot be replayed for more');
});

test('memory game: server deals the cards and pays out on completion', () => {
  const u = user(0);
  const s = startMemory('u2');
  // Learn every face by flipping cards in pairs (each pair counts as a move).
  const faces: number[] = [];
  for (let i = 0; i < s.cards; i += 2) {
    const a = flipMemory(u, 'u2', s.sessionId, i);
    faces[i] = a.face;
    const b = flipMemory(u, 'u2', s.sessionId, i + 1);
    faces[i + 1] = b.face;
    if (b.done) break;
  }
  assert.equal(faces.filter((f) => f !== undefined).length, 16);
  // Now match the remaining pairs.
  const byFace = new Map<number, number[]>();
  faces.forEach((f, i) => byFace.set(f, [...(byFace.get(f) ?? []), i]));
  let reward;
  for (const [, [i, j]] of byFace) {
    try {
      flipMemory(u, 'u2', s.sessionId, i);
      const r = flipMemory(u, 'u2', s.sessionId, j);
      if (r.reward) reward = r.reward;
    } catch { /* pair already matched in the first sweep */ }
  }
  assert.ok(reward, 'finishing pays out');
  assert.ok(u.tokens >= 30);
  assert.throws(() => flipMemory(u, 'u2', s.sessionId, 0), /finished/);
});

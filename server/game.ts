// Live game state: connected players, loaded rooms, presence, movement, chat,
// editing and the social features. Every request is validated here.

import type { WebSocket } from 'ws';
import { FURNITURE, MATERIALS } from '../shared/catalogue';
import { filterText } from '../shared/filter';
import { findPath, positionAlong } from '../shared/pathfinding';
import {
  blockedTiles, checkFloor, checkWall, childrenOf, newUid, relocateChildren, seatAt,
} from '../shared/placement';
import { CHAT_MAX, GUESTBOOK_MAX, WALK_SPEED, type Op, type Requests, type RoomSnapshot, type ServerEvent } from '../shared/protocol';
import { SHAPES } from '../shared/rooms';
import { validLook } from '../shared/avatar';
import type { Access, ChatMessage, DirectoryEntry, Occupant, PlacedItem, RoomRecord, RoomShape, Rot } from '../shared/types';
import { answerQuiz, endMemory, flipMemory, quizList, startMemory, startQuiz } from './activities';
import { buy, takeItem, addItem, toProfile } from './economy';
import { limits } from './ratelimit';
import type { Store, UserRow } from './store';

class GameError extends Error {}
const err = (msg: string): never => { throw new GameError(msg); };

interface Client {
  ws: WebSocket;
  user: UserRow;
  roomId: string | null;
  blocked: Set<string>;
}

interface LiveOccupant {
  userId: string;
  from: [number, number];
  path: [number, number][];
  start: number;
  facing: number;
  state: Occupant['state'];
  sit?: { y: number; facing: number };
}

interface LiveRoom {
  record: RoomRecord;
  shape: RoomShape;
  occupants: Map<string, LiveOccupant>;
}

const POST_COLOURS = ['#fff3c4', '#ffd9cf', '#d8efd0', '#d6e8f7', '#e8dcf5', '#fbe0e8'];

type Handler<O extends Op> = (c: Client, p: Requests[O][0]) => Requests[O][1] | Promise<Requests[O][1]>;

export class Game {
  clients = new Map<string, Client>();
  rooms = new Map<string, LiveRoom>();
  /** `${roomId}:${userId}` → time a kick expires. */
  private bans = new Map<string, number>();
  private msgSeq = 0;

  constructor(private store: Store) {}

  // ------------------------------------------------------------ connections
  connect(ws: WebSocket, user: UserRow) {
    const old = this.clients.get(user.id);
    if (old) {
      this.leaveRoom(old);
      old.ws.close(4000, 'Signed in elsewhere');
    }
    const c: Client = { ws, user, roomId: null, blocked: new Set(this.store.blocked(user.id)) };
    this.clients.set(user.id, c);
    this.send(c, { t: 'welcome', profile: toProfile(user), blocked: [...c.blocked], serverTime: Date.now() });

    ws.on('message', async (raw) => {
      let id = 0;
      try {
        const msg = JSON.parse(String(raw));
        id = Number(msg.id) || 0;
        if (!limits.any.take(`any:${user.id}`)) err('Slow down a little');
        const op = String(msg.op);
        // Own properties only, so names like "constructor" can't reach inherited functions.
        if (!Object.hasOwn(this.handlers, op)) err('Unknown request');
        const handler = (this.handlers as Record<string, Handler<any>>)[op];
        const data = await handler(c, msg.p ?? {});
        ws.send(JSON.stringify({ t: 'res', id, ok: true, data }));
      } catch (e) {
        const message = e instanceof GameError ? e.message : 'Something went wrong';
        if (!(e instanceof GameError)) console.error('[game]', e);
        ws.send(JSON.stringify({ t: 'res', id, ok: false, error: message }));
      }
    });
    ws.on('close', () => {
      if (this.clients.get(user.id) !== c) return;
      this.leaveRoom(c);
      this.clients.delete(user.id);
    });
  }

  private send(c: Client, ev: ServerEvent) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(ev));
  }

  private broadcast(room: LiveRoom, ev: ServerEvent, filter?: (c: Client) => boolean) {
    const json = JSON.stringify(ev);
    for (const uid of room.occupants.keys()) {
      const c = this.clients.get(uid);
      if (c && (!filter || filter(c)) && c.ws.readyState === c.ws.OPEN) c.ws.send(json);
    }
  }

  private saveUser(c: Client, pushProfile = true) {
    this.store.saveUserData(c.user.id, c.user.data);
    if (pushProfile) this.send(c, { t: 'profile', profile: toProfile(c.user) });
  }

  // ------------------------------------------------------------ rooms
  private loadRoom(id: string): LiveRoom | null {
    let room = this.rooms.get(id);
    if (room) return room;
    const record = this.store.room(id);
    if (!record) return null;
    const shape = SHAPES[record.shape];
    if (!shape) return null;
    room = { record, shape, occupants: new Map() };
    this.rooms.set(id, room);
    return room;
  }

  private currentRoom(c: Client): LiveRoom {
    const room = c.roomId ? this.rooms.get(c.roomId) : null;
    if (!room) err('You are not in a room');
    return room!;
  }

  private ownRoom(c: Client): LiveRoom {
    const room = this.currentRoom(c);
    if (room.record.ownerId !== c.user.id) err('Only the owner can decorate');
    return room;
  }

  private accessError(c: Client, room: LiveRoom): string | null {
    const r = room.record;
    if (r.ownerId === c.user.id) return null;
    if (r.ownerId && this.store.blocked(r.ownerId).includes(c.user.id)) return "You can't visit this apartment";
    const ban = this.bans.get(`${r.id}:${c.user.id}`);
    if (ban && ban > Date.now()) return 'You were asked to leave. Try again a bit later.';
    if (r.access === 'locked') return `${r.ownerName}'s apartment is locked`;
    if (r.access === 'friends' && (!r.ownerId || !this.store.areFriends(r.ownerId, c.user.id))) return `${r.ownerName}'s apartment is friends only`;
    if (room.occupants.size >= room.shape.capacity) return 'That room is full';
    return null;
  }

  private occupantView(room: LiveRoom, o: LiveOccupant): Occupant {
    const u = this.clients.get(o.userId)?.user;
    const now = Date.now();
    const pos = positionAlong(o.from, o.path, WALK_SPEED, now - o.start);
    return {
      userId: o.userId, name: u?.username ?? '?', avatar: u!.data.avatar,
      x: pos.done ? pos.tile[0] : o.from[0], z: pos.done ? pos.tile[1] : o.from[1],
      path: pos.done ? [] : o.path, pathStart: o.start, facing: o.facing, state: o.state, sitY: o.sit?.y,
    };
  }

  private tileNow(o: LiveOccupant): [number, number] {
    const pos = positionAlong(o.from, o.path, WALK_SPEED, Date.now() - o.start);
    return pos.done ? pos.tile : pos.next!;
  }

  private leaveRoom(c: Client) {
    if (!c.roomId) return;
    const room = this.rooms.get(c.roomId);
    c.roomId = null;
    if (!room) return;
    room.occupants.delete(c.user.id);
    this.broadcast(room, { t: 'presence.leave', userId: c.user.id });
    if (room.occupants.size === 0) this.rooms.delete(room.record.id);
  }

  private enter(c: Client, roomId: string): RoomSnapshot {
    const room = this.loadRoom(roomId);
    if (!room) err('That room does not exist');
    const blockedReason = this.accessError(c, room!);
    if (blockedReason) err(blockedReason);
    this.leaveRoom(c);
    const r = room!;
    const door = r.shape.door;
    const occ: LiveOccupant = { userId: c.user.id, from: [door.x, door.z], path: [], start: Date.now(), facing: 0, state: 'stand' };
    // Step one tile in from the door so arrivals don't stack in the doorway.
    const inward: [number, number] = door.wall === 'n' ? [door.x, door.z + 1] : [door.x + 1, door.z];
    const step = findPath(r.shape, blockedTiles(r.shape, r.record.layout), [door.x, door.z], inward);
    if (step) occ.path = step;
    r.occupants.set(c.user.id, occ);
    c.roomId = r.record.id;
    this.broadcast(r, { t: 'presence.join', occupant: this.occupantView(r, occ) }, (o) => o !== c);
    const visible = [...r.occupants.values()].map((o) => this.occupantView(r, o));
    return { room: r.record, occupants: visible, you: c.user.id, serverTime: Date.now() };
  }

  private saveLayout(room: LiveRoom) {
    this.store.saveRoom(room.record);
    this.broadcast(room, { t: 'room.layout', roomId: room.record.id, layout: room.record.layout });
    // Anyone sitting on furniture that moved stands up.
    for (const o of room.occupants.values()) {
      if (o.state !== 'sit') continue;
      const [x, z] = this.tileNow(o);
      if (!seatAt(room.record.layout, x, z)) {
        o.state = 'stand'; o.sit = undefined;
        this.broadcast(room, { t: 'avatar.emote', userId: o.userId, kind: 'stand' });
      }
    }
  }

  private findItem(room: LiveRoom, uid: string): PlacedItem {
    const it = room.record.layout.items.find((i) => i.uid === uid);
    if (!it) err('That item has gone');
    return it!;
  }

  private notice(c: Client, text: string, tone: 'info' | 'good' | 'warn' = 'info') {
    this.send(c, { t: 'notice', text, tone });
  }

  private systemChat(room: LiveRoom, text: string) {
    const message: ChatMessage = { id: `s${++this.msgSeq}`, userId: '', name: '', text, ts: Date.now(), system: true };
    this.broadcast(room, { t: 'chat', message });
  }

  // ------------------------------------------------------------ handlers
  handlers: { [O in Op]: Handler<O> } = {
    'room.enter': (c, { roomId }) => this.enter(c, String(roomId)),

    'room.directory': (c) => {
      const friends = new Set(this.store.friendIds(c.user.id));
      const out: DirectoryEntry[] = this.store.allRooms().map((r) => ({
        roomId: r.id, name: r.name, ownerId: r.ownerId, ownerName: r.ownerName, access: r.access,
        occupants: this.rooms.get(r.id)?.occupants.size ?? 0,
        isFriend: !!r.ownerId && friends.has(r.ownerId),
        ownerOnline: !!r.ownerId && this.clients.has(r.ownerId),
      }));
      return out.sort((a, b) => b.occupants - a.occupants || Number(b.isFriend) - Number(a.isFriend) || a.name.localeCompare(b.name));
    },

    'room.settings': (c, { name, access }) => {
      const room = this.ownRoom(c);
      if (name !== undefined) {
        const n = String(name).trim().slice(0, 32);
        if (n.length < 2) err('Give your room a name of at least two letters');
        if (filterText(n).flagged) err('Please pick a different name');
        room.record.name = n;
      }
      if (access !== undefined) {
        if (!(['open', 'friends', 'locked'] as Access[]).includes(access)) err('Unknown setting');
        room.record.access = access;
      }
      this.store.saveRoom(room.record);
      this.broadcast(room, { t: 'room.meta', room: room.record });
      return room.record;
    },

    'move': (c, { x, z, sit }) => {
      if (!limits.move.take(`move:${c.user.id}`)) err('Slow down');
      const room = this.currentRoom(c);
      const o = room.occupants.get(c.user.id)!;
      const from = this.tileNow(o);
      const layout = room.record.layout;
      const target: [number, number] = [Math.floor(Number(x)), Math.floor(Number(z))];
      let seat: ReturnType<typeof seatAt> = null;
      if (sit) {
        seat = seatAt(layout, target[0], target[1]);
        if (!seat) err('Nowhere to sit there');
      }
      const path = findPath(room.shape, blockedTiles(room.shape, layout), from, target, !!seat);
      if (!path) err("Can't get there");
      o.from = from;
      o.path = path!;
      o.start = Date.now();
      o.state = seat ? 'sit' : 'stand';
      o.sit = seat ? { y: seat.y, facing: seat.facing } : undefined;
      this.broadcast(room, { t: 'avatar.move', userId: c.user.id, from, path: path!, start: o.start, sit: o.sit });
      return { ok: true as const };
    },

    'chat': (c, { text }) => {
      const room = this.currentRoom(c);
      const raw = String(text ?? '').slice(0, CHAT_MAX);
      if (!raw.trim()) err('Say something first');
      if (!limits.chat.take(`chat:${c.user.id}`)) err("You're chatting very fast — take a breath");
      const { text: clean } = filterText(raw);
      const message: ChatMessage = { id: `m${++this.msgSeq}`, userId: c.user.id, name: c.user.username, text: clean, ts: Date.now() };
      this.broadcast(room, { t: 'chat', message }, (o) => !o.blocked.has(c.user.id) && !c.blocked.has(o.user.id));
      return { ok: true as const };
    },

    'emote': (c, { kind }) => {
      const room = this.currentRoom(c);
      if (!['wave', 'dance', 'stand'].includes(kind)) err('Unknown emote');
      const o = room.occupants.get(c.user.id)!;
      if (kind === 'dance') { o.state = 'dance'; o.sit = undefined; }
      if (kind === 'stand') { o.state = 'stand'; o.sit = undefined; }
      this.broadcast(room, { t: 'avatar.emote', userId: c.user.id, kind });
      return { ok: true as const };
    },

    'avatar.update': (c, { avatar }) => {
      if (!validLook(avatar)) err("That look isn't available");
      c.user.data.avatar = { ...avatar };
      c.user.data.isNew = false;
      this.saveUser(c);
      const room = c.roomId ? this.rooms.get(c.roomId) : null;
      if (room) this.broadcast(room, { t: 'avatar.look', userId: c.user.id, avatar: c.user.data.avatar });
      return toProfile(c.user);
    },

    // ---------------------------------------------------------- editing
    'edit.place': (c, p) => {
      if (!limits.edit.take(`edit:${c.user.id}`)) err('Slow down');
      const room = this.ownRoom(c);
      const def = FURNITURE[p.def];
      if (!def || !c.user.data.inventory[p.def]) err("You don't have one of those to place");
      const cand = { def: p.def, x: p.x, z: p.z, rot: p.rot, parent: p.parent || undefined };
      const check = checkFloor(room.shape, room.record.layout, cand);
      if (!check.ok) err(check.reason);
      takeItem(c.user.data, p.def);
      const item: PlacedItem = { uid: newUid(), def: p.def, x: p.x, z: p.z, rot: p.rot as Rot };
      if (cand.parent) item.parent = cand.parent;
      room.record.layout.items.push(item);
      this.saveUser(c);
      this.saveLayout(room);
      return item;
    },

    'edit.move': (c, p) => {
      if (!limits.edit.take(`edit:${c.user.id}`)) err('Slow down');
      const room = this.ownRoom(c);
      const layout = room.record.layout;
      const it = this.findItem(room, p.uid);
      const cand = { def: it.def, x: p.x, z: p.z, rot: p.rot, parent: p.parent || undefined };
      const check = checkFloor(room.shape, layout, cand, it.uid);
      if (!check.ok) err(check.reason);
      const moved = relocateChildren(layout, it, { x: p.x, z: p.z, rot: p.rot as Rot });
      for (const ch of moved) Object.assign(layout.items.find((i) => i.uid === ch.uid)!, ch);
      it.x = p.x; it.z = p.z; it.rot = p.rot as Rot;
      if (cand.parent) it.parent = cand.parent; else delete it.parent;
      this.saveLayout(room);
      return it;
    },

    'edit.pickup': (c, { uid }) => {
      const room = this.ownRoom(c);
      const layout = room.record.layout;
      const it = this.findItem(room, uid);
      const gone = [it, ...childrenOf(layout, it.uid)];
      for (const g of gone) addItem(c.user.data, g.def);
      layout.items = layout.items.filter((i) => !gone.includes(i));
      this.saveUser(c);
      this.saveLayout(room);
      return { ok: true as const };
    },

    'edit.wallPlace': (c, p) => {
      if (!limits.edit.take(`edit:${c.user.id}`)) err('Slow down');
      const room = this.ownRoom(c);
      if (!FURNITURE[p.def] || !c.user.data.inventory[p.def]) err("You don't have one of those to place");
      const check = checkWall(room.shape, room.record.layout, p);
      if (!check.ok) err(check.reason);
      takeItem(c.user.data, p.def);
      const item = { uid: newUid(), def: p.def, wall: p.wall, u: p.u, v: p.v };
      room.record.layout.wallItems.push(item);
      this.saveUser(c);
      this.saveLayout(room);
      return item;
    },

    'edit.wallMove': (c, p) => {
      if (!limits.edit.take(`edit:${c.user.id}`)) err('Slow down');
      const room = this.ownRoom(c);
      const it = room.record.layout.wallItems.find((w) => w.uid === p.uid);
      if (!it) err('That item has gone');
      const check = checkWall(room.shape, room.record.layout, { def: it!.def, wall: p.wall, u: p.u, v: p.v }, it!.uid);
      if (!check.ok) err(check.reason);
      Object.assign(it!, { wall: p.wall, u: p.u, v: p.v });
      this.saveLayout(room);
      return it!;
    },

    'edit.wallPickup': (c, { uid }) => {
      const room = this.ownRoom(c);
      const it = room.record.layout.wallItems.find((w) => w.uid === uid);
      if (!it) err('That item has gone');
      addItem(c.user.data, it!.def);
      room.record.layout.wallItems = room.record.layout.wallItems.filter((w) => w !== it);
      this.saveUser(c);
      this.saveLayout(room);
      return { ok: true as const };
    },

    'edit.material': (c, { surface, material }) => {
      const room = this.ownRoom(c);
      const m = MATERIALS[material];
      if (!m || m.surface !== surface) err('That material does not fit there');
      if (!c.user.data.materials.includes(material)) err("You don't own that material yet");
      room.record.layout[surface] = material;
      this.saveLayout(room);
      return { ok: true as const };
    },

    // ---------------------------------------------------------- economy
    'shop.buy': (c, { id, kind }) => {
      const problem = buy(c.user.data, String(id), kind === 'material' ? 'material' : 'item');
      if (problem) err(problem);
      this.saveUser(c);
      return toProfile(c.user);
    },

    'quiz.list': () => quizList(),
    'quiz.start': (c, { quizId }) => {
      try { return startQuiz(c.user.id, String(quizId)); } catch (e) { return err((e as Error).message); }
    },
    'quiz.answer': (c, { sessionId, index, choice }) => {
      let res;
      try { res = answerQuiz(c.user.data, c.user.id, String(sessionId), Number(index), Number(choice)); }
      catch (e) { return err((e as Error).message); }
      if (res.done) this.saveUser(c);
      return res;
    },

    'memory.start': (c) => startMemory(c.user.id),
    'memory.flip': (c, { sessionId, index }) => {
      let res;
      try { res = flipMemory(c.user.data, c.user.id, String(sessionId), Number(index)); }
      catch (e) { return err((e as Error).message); }
      if (res.done) this.saveUser(c);
      return res;
    },
    'memory.end': (c, { sessionId }) => {
      let res;
      try { res = endMemory(c.user.data, c.user.id, String(sessionId)); }
      catch (e) { return err((e as Error).message); }
      this.saveUser(c);
      return res;
    },

    // ---------------------------------------------------------- guestbook
    'guestbook.list': (c, { roomId }) => {
      const room = this.store.room(String(roomId));
      if (!room) err('That room does not exist');
      const posts = this.store.posts(room!.id);
      return posts.filter((p) => !c.blocked.has(p.authorId));
    },

    'guestbook.post': (c, { roomId, text, colour }) => {
      const room = this.loadRoom(String(roomId));
      if (!room) err('That room does not exist');
      const reason = this.accessError(c, room!);
      if (reason && room!.record.ownerId !== c.user.id) err(reason);
      const raw = String(text ?? '').trim().slice(0, GUESTBOOK_MAX);
      if (raw.length < 2) err('Write a little more first');
      if (!limits.guestbook.take(`gb:${c.user.id}`)) err('You can leave another note in a moment');
      const post = this.store.addPost({
        roomId: room!.record.id, authorId: c.user.id, authorName: c.user.username, text: filterText(raw).text,
        colour: POST_COLOURS.includes(colour) ? colour : POST_COLOURS[0], createdAt: Date.now(),
      });
      this.broadcast(room!, { t: 'guestbook.new', post }, (o) => !o.blocked.has(c.user.id));
      const owner = room!.record.ownerId ? this.clients.get(room!.record.ownerId) : null;
      if (owner && owner !== c && owner.roomId !== room!.record.id) this.notice(owner, `${c.user.username} left a note in your guestbook`);
      if (room!.occupants.size === 0) this.rooms.delete(room!.record.id);
      return post;
    },

    'guestbook.delete': (c, { postId }) => {
      const post = this.store.post(Number(postId));
      if (!post) err('That note has already gone');
      const room = this.store.room(post!.roomId);
      if (post!.authorId !== c.user.id && room?.ownerId !== c.user.id) err('Only the owner or the author can remove a note');
      this.store.deletePost(post!.id);
      const live = this.rooms.get(post!.roomId);
      if (live) this.broadcast(live, { t: 'guestbook.deleted', postId: post!.id, roomId: post!.roomId });
      return { ok: true as const };
    },

    // ---------------------------------------------------------- friends
    'friends.list': (c) => {
      const ids = this.store.friendIds(c.user.id);
      const names = this.store.usernames([...ids, ...this.store.incoming(c.user.id), ...this.store.outgoing(c.user.id)]);
      const friends = ids.map((id) => {
        const fc = this.clients.get(id);
        const room = fc?.roomId ? this.rooms.get(fc.roomId) : null;
        return { userId: id, username: names[id] ?? '?', online: !!fc, roomId: room?.record.id ?? null, roomName: room?.record.name ?? null };
      }).sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
      return {
        friends,
        incoming: this.store.incoming(c.user.id).map((id) => ({ userId: id, username: names[id] ?? '?' })),
        outgoing: this.store.outgoing(c.user.id).map((id) => ({ userId: id, username: names[id] ?? '?' })),
      };
    },

    'friends.request': (c, { username }) => {
      if (!limits.social.take(`social:${c.user.id}`)) err('Slow down a little');
      const target = this.store.userByName(String(username ?? '').trim());
      if (!target) err('Nobody by that name lives here');
      if (target!.id === c.user.id) err("You're already your own best friend");
      if (this.store.areFriends(c.user.id, target!.id)) return { ok: true as const, message: `You and ${target!.username} are already friends` };
      if (this.store.blocked(target!.id).includes(c.user.id)) return { ok: true as const, message: 'Request sent' };
      const tc = this.clients.get(target!.id);
      if (this.store.hasRequest(target!.id, c.user.id)) {
        this.store.addFriendship(c.user.id, target!.id);
        if (tc) { this.send(tc, { t: 'friends.changed' }); this.notice(tc, `${c.user.username} accepted your friend request`, 'good'); }
        return { ok: true as const, message: `You and ${target!.username} are now friends` };
      }
      this.store.addRequest(c.user.id, target!.id);
      if (tc) { this.send(tc, { t: 'friends.changed' }); this.notice(tc, `${c.user.username} sent you a friend request`); }
      return { ok: true as const, message: 'Request sent' };
    },

    'friends.respond': (c, { userId, accept }) => {
      if (!this.store.hasRequest(String(userId), c.user.id)) err('That request has gone');
      if (accept) this.store.addFriendship(c.user.id, String(userId));
      else this.store.deleteRequest(String(userId), c.user.id);
      const other = this.clients.get(String(userId));
      if (other) {
        this.send(other, { t: 'friends.changed' });
        if (accept) this.notice(other, `${c.user.username} accepted your friend request`, 'good');
      }
      return { ok: true as const };
    },

    'friends.remove': (c, { userId }) => {
      this.store.removeFriendship(c.user.id, String(userId));
      this.store.deleteRequest(c.user.id, String(userId));
      const other = this.clients.get(String(userId));
      if (other) this.send(other, { t: 'friends.changed' });
      return { ok: true as const };
    },

    // ---------------------------------------------------------- safety
    'safety.block': (c, { userId }) => {
      const id = String(userId);
      if (id === c.user.id) err("You can't block yourself");
      if (!this.store.userById(id)) err('Player not found');
      this.store.block(c.user.id, id);
      this.store.removeFriendship(c.user.id, id);
      this.store.deleteRequest(id, c.user.id);
      c.blocked.add(id);
      // A blocked player is removed from your apartment straight away.
      const room = c.roomId ? this.rooms.get(c.roomId) : null;
      const target = this.clients.get(id);
      if (room && room.record.ownerId === c.user.id && target?.roomId === room.record.id) this.eject(room, target, c.user.username);
      return { blocked: [...c.blocked] };
    },

    'safety.unblock': (c, { userId }) => {
      this.store.unblock(c.user.id, String(userId));
      c.blocked.delete(String(userId));
      return { blocked: [...c.blocked] };
    },

    'safety.report': (c, { userId, reason, messageId, text }) => {
      if (!limits.social.take(`social:${c.user.id}`)) err('Slow down a little');
      const target = this.store.userById(String(userId));
      if (!target) err('Player not found');
      this.store.report({
        reporterId: c.user.id, targetId: target!.id, roomId: c.roomId, reason: String(reason ?? 'other').slice(0, 40),
        messageId: messageId ? String(messageId).slice(0, 20) : undefined, text: text ? String(text).slice(0, 300) : undefined,
      });
      console.log(`[report] ${c.user.username} reported ${target!.username}: ${reason}${text ? ` — "${text}"` : ''}`);
      return { ok: true as const };
    },

    'safety.kick': (c, { userId }) => {
      const room = this.ownRoom(c);
      const target = this.clients.get(String(userId));
      if (!target || target.roomId !== room.record.id) err("They're not here");
      if (target!.user.id === c.user.id) err("You can't kick yourself out");
      this.eject(room, target!, c.user.username);
      return { ok: true as const };
    },
  };

  private eject(room: LiveRoom, target: Client, by: string) {
    this.bans.set(`${room.record.id}:${target.user.id}`, Date.now() + 10 * 60 * 1000);
    this.leaveRoom(target);
    this.send(target, { t: 'kicked', by, roomName: room.record.name });
    this.systemChat(room, `${target.user.username} was shown the door.`);
  }
}

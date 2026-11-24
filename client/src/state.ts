// Client-side game state. Pure data plus change events; the renderer and the UI
// both subscribe, and neither owns the state.

import { SHAPES } from '../../shared/rooms';
import type { ChatMessage, GuestbookPost, Occupant, Reward, RoomLayout, RoomRecord, RoomShape, UserProfile, AvatarLook } from '../../shared/types';

type Events = {
  profile: UserProfile;
  room: RoomRecord;
  meta: RoomRecord;
  layout: RoomLayout;
  join: Occupant;
  leave: string;
  move: { userId: string; from: [number, number]; path: [number, number][]; startedAgo: number; sit?: { y: number; facing: number } };
  emote: { userId: string; kind: 'wave' | 'dance' | 'stand' };
  look: { userId: string; avatar: AvatarLook };
  chat: ChatMessage;
  mode: 'walk' | 'edit';
  blocked: Set<string>;
  muted: Set<string>;
  guestbook: { kind: 'new'; post: GuestbookPost } | { kind: 'deleted'; postId: number };
  friends: null;
  reward: Reward;
};

class Emitter<E extends Record<string, any>> {
  private map = new Map<keyof E, Set<(v: any) => void>>();
  on<K extends keyof E>(k: K, fn: (v: E[K]) => void) {
    if (!this.map.has(k)) this.map.set(k, new Set());
    this.map.get(k)!.add(fn);
    return () => this.map.get(k)!.delete(fn);
  }
  emit<K extends keyof E>(k: K, v: E[K]) {
    for (const fn of this.map.get(k) ?? []) fn(v);
  }
}

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')); } catch { return new Set(); }
}

export class GameState extends Emitter<Events> {
  profile: UserProfile | null = null;
  room: RoomRecord | null = null;
  shape: RoomShape | null = null;
  you = '';
  occupants = new Map<string, Occupant>();
  chat: ChatMessage[] = [];
  mode: 'walk' | 'edit' = 'walk';
  blocked = new Set<string>();
  muted = loadSet('pc.muted');

  get isOwner() { return !!this.room && this.room.ownerId === this.you; }

  setProfile(p: UserProfile) { this.profile = p; this.you = p.id; this.emit('profile', p); }

  setRoom(room: RoomRecord, occupants: Occupant[]) {
    this.room = room;
    this.shape = SHAPES[room.shape];
    this.occupants = new Map(occupants.map((o) => [o.userId, o]));
    this.mode = 'walk';
    this.emit('room', room);
    this.emit('mode', 'walk');
  }

  setMode(m: 'walk' | 'edit') {
    if (m === 'edit' && !this.isOwner) return;
    this.mode = m;
    this.emit('mode', m);
  }

  addChat(m: ChatMessage) {
    this.chat.push(m);
    if (this.chat.length > 200) this.chat.shift();
    this.emit('chat', m);
  }

  toggleMute(userId: string) {
    if (this.muted.has(userId)) this.muted.delete(userId); else this.muted.add(userId);
    try { localStorage.setItem('pc.muted', JSON.stringify([...this.muted])); } catch { /* private mode */ }
    this.emit('muted', this.muted);
  }

  hidden(userId: string) { return this.blocked.has(userId) || this.muted.has(userId); }
}

export const state = new GameState();

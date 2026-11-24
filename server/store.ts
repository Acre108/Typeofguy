// Persistent store on Node's built-in SQLite. Documents that change shape as
// the game grows (user data, room records) are kept as JSON columns, so new
// fields don't need migrations; relationships get proper tables.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AvatarLook, GuestbookPost, RoomRecord } from '../shared/types';

export interface UserData {
  avatar: AvatarLook;
  tokens: number;
  inventory: Record<string, number>;
  materials: string[];
  collection: string[];
  bonuses: string[];
  apartmentId: string;
  isNew: boolean;
  /** Recent reward timestamps per activity, for diminishing returns. */
  activity: Record<string, number[]>;
  /** Personality quiz results (quiz id → outcome). Only the outcome is kept, never answers or birthdays. */
  traits?: Record<string, string>;
  traitsPublic?: boolean;
}

export interface UserRow {
  id: string;
  username: string;
  passHash: string;
  salt: string;
  createdAt: number;
  data: UserData;
}

export class Store {
  db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, owner_id TEXT, kind TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS guestbook (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, author_id TEXT NOT NULL,
        author_name TEXT NOT NULL, text TEXT NOT NULL, colour TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS guestbook_room ON guestbook(room_id, created_at);
      CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b));
      CREATE TABLE IF NOT EXISTS friend_requests (from_id TEXT NOT NULL, to_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (from_id, to_id));
      CREATE TABLE IF NOT EXISTS blocks (user_id TEXT NOT NULL, blocked_id TEXT NOT NULL, PRIMARY KEY (user_id, blocked_id));
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id TEXT NOT NULL, target_id TEXT NOT NULL,
        room_id TEXT, reason TEXT NOT NULL, message_id TEXT, text TEXT, created_at INTEGER NOT NULL);
    `);
  }

  // ------------------------------------------------------------ users
  createUser(row: UserRow) {
    this.db.prepare('INSERT INTO users (id, username, pass_hash, salt, created_at, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.username, row.passHash, row.salt, row.createdAt, JSON.stringify(row.data));
  }

  private toUser(r: any): UserRow | null {
    if (!r) return null;
    return { id: r.id, username: r.username, passHash: r.pass_hash, salt: r.salt, createdAt: r.created_at, data: JSON.parse(r.data) };
  }

  userById(id: string) { return this.toUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id)); }
  userByName(name: string) { return this.toUser(this.db.prepare('SELECT * FROM users WHERE username = ?').get(name)); }

  saveUserData(id: string, data: UserData) {
    this.db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
  }

  usernames(ids: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    const stmt = this.db.prepare('SELECT username FROM users WHERE id = ?');
    for (const id of ids) {
      const r = stmt.get(id) as { username: string } | undefined;
      if (r) out[id] = r.username;
    }
    return out;
  }

  // ------------------------------------------------------------ sessions
  createSession(token: string, userId: string) {
    this.db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, Date.now());
  }
  sessionUser(token: string): string | null {
    const r = this.db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as { user_id: string } | undefined;
    return r?.user_id ?? null;
  }
  deleteSession(token: string) { this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token); }

  // ------------------------------------------------------------ rooms
  saveRoom(room: RoomRecord) {
    this.db.prepare('INSERT INTO rooms (id, owner_id, kind, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(room.id, room.ownerId, room.kind, JSON.stringify(room));
  }
  room(id: string): RoomRecord | null {
    const r = this.db.prepare('SELECT data FROM rooms WHERE id = ?').get(id) as { data: string } | undefined;
    return r ? JSON.parse(r.data) : null;
  }
  allRooms(): RoomRecord[] {
    return (this.db.prepare('SELECT data FROM rooms').all() as { data: string }[]).map((r) => JSON.parse(r.data));
  }

  // ------------------------------------------------------------ guestbook
  posts(roomId: string, limit = 60): GuestbookPost[] {
    return (this.db.prepare('SELECT * FROM guestbook WHERE room_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(roomId, limit) as any[])
      .map((r) => ({ id: r.id, roomId: r.room_id, authorId: r.author_id, authorName: r.author_name, text: r.text, colour: r.colour, createdAt: r.created_at }));
  }
  addPost(p: Omit<GuestbookPost, 'id'>): GuestbookPost {
    const res = this.db.prepare('INSERT INTO guestbook (room_id, author_id, author_name, text, colour, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.roomId, p.authorId, p.authorName, p.text, p.colour, p.createdAt);
    return { ...p, id: Number(res.lastInsertRowid) };
  }
  post(id: number): GuestbookPost | null {
    const r = this.db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id) as any;
    return r ? { id: r.id, roomId: r.room_id, authorId: r.author_id, authorName: r.author_name, text: r.text, colour: r.colour, createdAt: r.created_at } : null;
  }
  deletePost(id: number) { this.db.prepare('DELETE FROM guestbook WHERE id = ?').run(id); }

  // ------------------------------------------------------------ friends
  friendIds(userId: string): string[] {
    return (this.db.prepare('SELECT b FROM friends WHERE a = ?').all(userId) as { b: string }[]).map((r) => r.b);
  }
  areFriends(a: string, b: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').get(a, b);
  }
  addFriendship(a: string, b: string) {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO friends (a, b) VALUES (?, ?)');
    stmt.run(a, b); stmt.run(b, a);
    this.db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(a, b, b, a);
  }
  removeFriendship(a: string, b: string) {
    this.db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').run(a, b, b, a);
  }
  addRequest(from: string, to: string) {
    this.db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').run(from, to, Date.now());
  }
  hasRequest(from: string, to: string) {
    return !!this.db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(from, to);
  }
  deleteRequest(from: string, to: string) {
    this.db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?').run(from, to);
  }
  incoming(userId: string): string[] {
    return (this.db.prepare('SELECT from_id FROM friend_requests WHERE to_id = ?').all(userId) as { from_id: string }[]).map((r) => r.from_id);
  }
  outgoing(userId: string): string[] {
    return (this.db.prepare('SELECT to_id FROM friend_requests WHERE from_id = ?').all(userId) as { to_id: string }[]).map((r) => r.to_id);
  }

  // ------------------------------------------------------------ safety
  blocked(userId: string): string[] {
    return (this.db.prepare('SELECT blocked_id FROM blocks WHERE user_id = ?').all(userId) as { blocked_id: string }[]).map((r) => r.blocked_id);
  }
  block(userId: string, target: string) { this.db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)').run(userId, target); }
  unblock(userId: string, target: string) { this.db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(userId, target); }
  report(r: { reporterId: string; targetId: string; roomId: string | null; reason: string; messageId?: string; text?: string }) {
    this.db.prepare('INSERT INTO reports (reporter_id, target_id, room_id, reason, message_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(r.reporterId, r.targetId, r.roomId, r.reason, r.messageId ?? null, r.text ?? null, Date.now());
  }
}

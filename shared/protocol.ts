// WebSocket protocol. Clients send requests and get one response each;
// the server also pushes events. Both directions are JSON.

import type {
  Access, AvatarLook, ChatMessage, DirectoryEntry, FriendEntry, GuestbookPost, Occupant,
  PlacedItem, PlacedWallItem, QuizMeta, QuizQuestionPublic, Reward, RoomRecord, Rot, UserProfile,
} from './types';

export interface RoomSnapshot {
  room: RoomRecord;
  occupants: Occupant[];
  you: string;
  serverTime: number;
}

/** op name → [params, result] */
export interface Requests {
  'room.enter': [{ roomId: string }, RoomSnapshot];
  'room.directory': [{}, DirectoryEntry[]];
  'room.settings': [{ name?: string; access?: Access }, RoomRecord];
  'move': [{ x: number; z: number; sit?: boolean }, { ok: true }];
  'chat': [{ text: string }, { ok: true }];
  'emote': [{ kind: 'wave' | 'dance' | 'stand' }, { ok: true }];
  'avatar.update': [{ avatar: AvatarLook }, UserProfile];

  'edit.place': [{ def: string; x: number; z: number; rot: Rot; parent?: string }, PlacedItem];
  'edit.move': [{ uid: string; x: number; z: number; rot: Rot; parent?: string }, PlacedItem];
  'edit.pickup': [{ uid: string }, { ok: true }];
  'edit.wallPlace': [{ def: string; wall: string; u: number; v: number }, PlacedWallItem];
  'edit.wallMove': [{ uid: string; wall: string; u: number; v: number }, PlacedWallItem];
  'edit.wallPickup': [{ uid: string }, { ok: true }];
  'edit.material': [{ surface: 'floor' | 'wall'; material: string }, { ok: true }];

  'shop.buy': [{ id: string; kind: 'item' | 'material' }, UserProfile];

  'quiz.list': [{}, QuizMeta[]];
  'quiz.start': [{ quizId: string }, { sessionId: string; questions: QuizQuestionPublic[] }];
  'quiz.answer': [{ sessionId: string; index: number; choice: number },
    { correct: boolean; correctIndex: number; score: number; done: boolean; reward?: Reward }];

  'persona.submit': [{ quizId: string; answers?: number[]; month?: number; day?: number },
    { outcome: string; scores: Record<string, number>; reward: Reward }];
  'persona.visibility': [{ public: boolean }, UserProfile];

  'memory.start': [{}, { sessionId: string; cards: number; cols: number; timeLimit: number; serverTime: number }];
  'memory.flip': [{ sessionId: string; index: number },
    { index: number; face: number; pair?: { other: number; otherFace: number; match: boolean };
      moves: number; pairs: number; done: boolean; reward?: Reward }];
  'memory.end': [{ sessionId: string }, { reward: Reward }];

  'guestbook.list': [{ roomId: string }, GuestbookPost[]];
  'guestbook.post': [{ roomId: string; text: string; colour: string }, GuestbookPost];
  'guestbook.delete': [{ postId: number }, { ok: true }];

  'friends.list': [{}, { friends: FriendEntry[]; incoming: { userId: string; username: string }[]; outgoing: { userId: string; username: string }[] }];
  'friends.request': [{ username: string }, { ok: true; message: string }];
  'friends.respond': [{ userId: string; accept: boolean }, { ok: true }];
  'friends.remove': [{ userId: string }, { ok: true }];

  'safety.block': [{ userId: string }, { blocked: string[] }];
  'safety.unblock': [{ userId: string }, { blocked: string[] }];
  'safety.report': [{ userId: string; reason: string; messageId?: string; text?: string }, { ok: true }];
  'safety.kick': [{ userId: string }, { ok: true }];
}

export type Op = keyof Requests;
export type Params<O extends Op> = Requests[O][0];
export type Result<O extends Op> = Requests[O][1];

export type ClientMessage = { id: number; op: Op; p: unknown };

export type ServerMessage =
  | { t: 'res'; id: number; ok: true; data: unknown }
  | { t: 'res'; id: number; ok: false; error: string }
  | ServerEvent;

export type ServerEvent =
  | { t: 'welcome'; profile: UserProfile; blocked: string[]; serverTime: number }
  | { t: 'profile'; profile: UserProfile }
  | { t: 'room.layout'; roomId: string; layout: RoomRecord['layout'] }
  | { t: 'room.meta'; room: RoomRecord }
  | { t: 'presence.join'; occupant: Occupant }
  | { t: 'presence.leave'; userId: string }
  | { t: 'avatar.move'; userId: string; from: [number, number]; path: [number, number][]; start: number; sit?: { y: number; facing: number } }
  | { t: 'avatar.emote'; userId: string; kind: 'wave' | 'dance' | 'stand' }
  | { t: 'avatar.look'; userId: string; avatar: AvatarLook }
  | { t: 'avatar.traits'; userId: string; traits: Record<string, string> }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'guestbook.new'; post: GuestbookPost }
  | { t: 'guestbook.deleted'; postId: number; roomId: string }
  | { t: 'friends.changed' }
  | { t: 'kicked'; by: string; roomName: string }
  | { t: 'notice'; text: string; tone?: 'info' | 'good' | 'warn' }
  | { t: 'reward'; reward: Reward };

export const WALK_SPEED = 3.2; // tiles per second
export const CHAT_MAX = 120;
export const GUESTBOOK_MAX = 160;

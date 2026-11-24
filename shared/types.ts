// Core data model shared by client and server.
// Everything here is plain data: rooms are stored as layouts (item id, grid
// position, rotation, stacking parent), never as scene graphs.

export type Rot = 0 | 1 | 2 | 3;
export type Access = 'open' | 'friends' | 'locked';
export type ThemeId = 'cabin' | 'seaside' | 'garden' | 'studio';
export type RoomKind = 'apartment' | 'public';

// ---------------------------------------------------------------- avatars

export type HairStyle = 'crop' | 'bob' | 'bun' | 'curly' | 'tuft' | 'none';
export type TopStyle = 'tee' | 'hoodie' | 'stripe' | 'pinafore';
export type BottomStyle = 'trousers' | 'shorts' | 'skirt';

export interface AvatarLook {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  top: TopStyle;
  topColor: string;
  bottom: BottomStyle;
  bottomColor: string;
}

// ---------------------------------------------------------------- room shapes

/** A wall segment starts at grid corner (x, z) and runs `length` tiles along `axis`.
 *  It faces into the room (+z for an x-axis wall, +x for a z-axis wall). */
export interface WallSegment {
  id: string;
  x: number;
  z: number;
  axis: 'x' | 'z';
  length: number;
}

export interface RoomShape {
  id: string;
  name: string;
  width: number; // tiles along x
  depth: number; // tiles along z
  /** Optional floor mask, one string per z row, '#' = floor, anything else = void.
   *  Lets later room shapes be L-shaped, have alcoves and so on. */
  mask?: string[];
  walls: WallSegment[];
  /** Wall grid rows. Each row is WALL_ROW_HEIGHT tall. */
  wallRows: number;
  /** The door sits on a wall at slot `u`; (x, z) is the floor tile in front of it. */
  door: { wall: string; u: number; x: number; z: number };
  /** Max avatars allowed at once. */
  capacity: number;
}

// ---------------------------------------------------------------- layouts

export interface PlacedItem {
  uid: string;
  def: string;
  /** Anchor = the footprint's minimum-x, minimum-z tile after rotation. */
  x: number;
  z: number;
  rot: Rot;
  /** uid of the surface item this sits on (one level of stacking). */
  parent?: string;
}

export interface PlacedWallItem {
  uid: string;
  def: string;
  wall: string;
  /** Slot along the wall (left edge) and row up from the floor (bottom edge). */
  u: number;
  v: number;
}

export interface RoomLayout {
  floor: string; // material id
  wall: string; // material id
  items: PlacedItem[];
  wallItems: PlacedWallItem[];
}

export interface RoomRecord {
  id: string;
  kind: RoomKind;
  ownerId: string | null;
  ownerName: string;
  name: string;
  shape: string;
  access: Access;
  layout: RoomLayout;
  createdAt: number;
}

// ---------------------------------------------------------------- catalogue

export type PartShape = 'box' | 'cyl' | 'sphere' | 'cone' | 'torus' | 'capsule';
export type PartTexture =
  | 'plain' | 'wood' | 'fabric' | 'weave' | 'knit' | 'stripe' | 'band' | 'plaid' | 'terrazzo' | 'glow' | 'leaf' | 'paper' | 'squiggle';

/** One chunk of a code-built model. Units are tiles (1 tile = 1 world unit).
 *  `at` is [x, bottom-y, z] relative to the footprint centre at floor level;
 *  for wall items it is [along wall, bottom-y above the item's slot, out from wall]. */
export interface Part {
  s: PartShape;
  size: [number, number, number];
  at: [number, number, number];
  c: string; // colour (hex)
  /** Second colour for two-tone textures (stripe, band, plaid, paper, squiggle). */
  c2?: string;
  t?: PartTexture;
  /** Bevel radius for boxes, rim rounding for cylinders. */
  r?: number;
  /** Rotation in degrees around the part's own centre: [tilt x, yaw y, roll z],
   *  applied roll first, then tilt, then yaw (Euler order YXZ). */
  rot?: [number, number, number];
  /** Cylinders: top radius as a fraction of the bottom radius. */
  taper?: number;
  /** Segment count override for round parts. */
  seg?: number;
}

export interface ItemSource {
  type: 'quiz' | 'minigame' | 'set' | 'starter';
  id: string;
  label: string;
}

export interface FurnitureDef {
  id: string;
  name: string;
  desc: string;
  theme: ThemeId;
  kind: 'floor' | 'wall';
  /** Floor: [width x, depth z] in tiles. Wall: [width in slots, height in rows]. */
  size: [number, number];
  /** Visual height, used for picking and contact shadows. */
  height: number;
  /** Height of the top surface if small items can stand on it. */
  surface?: number;
  /** Small 1×1 items can stand on a surface. */
  small?: boolean;
  /** Seat height if avatars can sit here. */
  seat?: number;
  /** Rugs lie flat: other furniture can stand on them and avatars can walk on them. */
  rug?: boolean;
  /** Emits a warm glow (cosmetic). */
  light?: boolean;
  /** null = not sold in the catalogue (earned from a quiz, minigame or set). */
  price: number | null;
  source?: ItemSource;
  parts: Part[];
}

export interface MaterialDef {
  id: string;
  name: string;
  surface: 'floor' | 'wall';
  theme: ThemeId;
  price: number | null;
  source?: ItemSource;
  /** Procedural texture recipe (see client/src/render/textures.ts). */
  pattern: string;
  colors: string[];
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  blurb: string;
  colour: string;
  /** Owning every item in `items` grants `bonus`. */
  items: string[];
  bonus: string;
}

// ---------------------------------------------------------------- live state

export interface UserProfile {
  id: string;
  username: string;
  avatar: AvatarLook;
  tokens: number;
  inventory: Record<string, number>;
  materials: string[];
  /** Every item id this player has ever owned (drives set completion). */
  collection: string[];
  bonuses: string[];
  apartmentId: string;
  isNew: boolean;
  /** Personality quiz results: quiz id → outcome key. */
  traits: Record<string, string>;
  /** Whether visitors can see those results on the player card. */
  traitsPublic: boolean;
}

export type AvatarState = 'stand' | 'sit' | 'dance';

export interface Occupant {
  userId: string;
  name: string;
  avatar: AvatarLook;
  x: number;
  z: number;
  /** Remaining path (tiles) if walking, with the server time it started. */
  path: [number, number][];
  pathStart: number;
  facing: number; // radians around y
  state: AvatarState;
  sitY?: number;
  /** Personality results the player has chosen to show. */
  traits?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface GuestbookPost {
  id: number;
  roomId: string;
  authorId: string;
  authorName: string;
  text: string;
  colour: string;
  createdAt: number;
}

export interface DirectoryEntry {
  roomId: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
  access: Access;
  occupants: number;
  isFriend: boolean;
  ownerOnline: boolean;
}

export interface FriendEntry {
  userId: string;
  username: string;
  online: boolean;
  roomId: string | null;
  roomName: string | null;
}

export interface QuizMeta {
  id: string;
  title: string;
  blurb: string;
  theme: ThemeId;
  questionCount: number;
  rewardItem?: string;
  rewardMaterial?: string;
  bands: { min: number; tokens: number; label: string }[];
}

export interface QuizQuestionPublic {
  q: string;
  options: string[];
}

export interface Reward {
  tokens: number;
  items: string[];
  materials: string[];
  bonusItems: string[];
  label: string;
  multiplier: number;
}

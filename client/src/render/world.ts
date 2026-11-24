// The 3D view. It reads game state and draws it; it never changes it.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FURNITURE } from '../../../shared/catalogue';
import { positionAlong } from '../../../shared/pathfinding';
import { footprintCentre, dims } from '../../../shared/placement';
import { WALK_SPEED } from '../../../shared/protocol';
import { DOOR_ROWS, isFloorTile, WALL_ROW_HEIGHT } from '../../../shared/rooms';
import type { AvatarLook, FurnitureDef, Occupant, PlacedItem, PlacedWallItem, RoomLayout, RoomShape, Rot, WallSegment } from '../../../shared/types';
import { AvatarModel } from './avatar';
import { buildFurniture, ghostMaterial } from './models';
import { edgeTexture, materialTexture } from './textures';

const WALL_T = 0.22;
const ELEVATION = THREE.MathUtils.degToRad(33);
const VIEW_HEIGHT = 12.5; // world units visible vertically at zoom 1

export interface PickResult {
  tile: [number, number] | null;
  item: PlacedItem | null;
  itemPoint: THREE.Vector3 | null;
  wallItem: PlacedWallItem | null;
  wall: { id: string; along: number; y: number } | null;
  avatar: string | null;
}

interface AvatarView {
  model: AvatarModel;
  x: number; z: number;
  from: [number, number];
  path: [number, number][];
  start: number;
  facing: number;
  targetFacing: number;
  sitAfter: { y: number; facing: number } | null;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  private clock = new THREE.Clock();
  private roomGroup = new THREE.Group();
  private itemGroup = new THREE.Group();
  private avatarGroup = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private shape: RoomShape | null = null;
  private layout: RoomLayout | null = null;
  private floorMesh: THREE.Mesh | null = null;
  private wallFaces: { wall: WallSegment; meshes: THREE.Mesh[] }[] = [];
  private wallGroups = new Map<string, THREE.Group>();
  private wallPick = new Map<string, THREE.Mesh>();
  private wallFaceMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  private floorMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  private items = new Map<string, THREE.Group>();
  private wallItems = new Map<string, THREE.Group>();
  private avatars = new Map<string, AvatarView>();
  private raycaster = new THREE.Raycaster();
  private target = new THREE.Vector3();
  private pan = new THREE.Vector2();
  private az = Math.PI / 4;
  private azTarget = Math.PI / 4;
  viewStep = 0;
  zoom = 1;
  private zoomTarget = 1;
  private grid: THREE.LineSegments | null = null;
  private marker: THREE.Mesh;
  private selection: THREE.Mesh;
  private ghost: THREE.Group | null = null;
  private ghostMat = ghostMaterial();
  private wallCut = new Map<string, number>();
  private hiddenUid: string | null = null;
  onFrame: ((dt: number) => void)[] = [];

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.scene.add(this.roomGroup, this.itemGroup, this.avatarGroup);

    // Soft sky-and-floor fill plus one warm low sun for gentle floor shadows.
    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#d9bfa3', 1.9));
    this.sun = new THREE.DirectionalLight('#fff0d6', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    const markerGeo = new RoundedBoxGeometry(0.9, 0.02, 0.9, 2, 0.008);
    this.marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }));
    this.marker.visible = false;
    this.marker.renderOrder = 2;
    this.scene.add(this.marker);
    this.selection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.4, depthWrite: false }));
    this.selection.rotation.x = -Math.PI / 2;
    this.selection.visible = false;
    this.selection.renderOrder = 2;
    this.scene.add(this.selection);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ camera
  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.updateCamera();
  }

  private updateCamera() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const aspect = w / h;
    // On narrow (portrait) screens fit the room's width rather than height.
    const vh = (aspect < 1 ? VIEW_HEIGHT * 1.15 / aspect : VIEW_HEIGHT) / this.zoom;
    this.camera.left = (-vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    const dist = 60;
    const t = this.target.clone();
    // pan is in screen-aligned ground directions
    const right = new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az));
    const fwd = new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az));
    t.addScaledVector(right, this.pan.x).addScaledVector(fwd, this.pan.y);
    this.camera.position.set(
      t.x + Math.sin(this.az) * Math.cos(ELEVATION) * dist,
      t.y + Math.sin(ELEVATION) * dist,
      t.z + Math.cos(this.az) * Math.cos(ELEVATION) * dist,
    );
    this.camera.lookAt(t);
    this.camera.updateProjectionMatrix();
  }

  rotateView(dir: 1 | -1) {
    this.viewStep = (this.viewStep + dir + 4) % 4;
    this.azTarget += (dir * Math.PI) / 2;
  }

  zoomBy(f: number) {
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * f, 0.7, 2.6);
  }

  panBy(dxPx: number, dyPx: number) {
    const h = this.container.clientHeight || 1;
    const unitsPerPx = (this.camera.top - this.camera.bottom) / h;
    this.pan.x -= dxPx * unitsPerPx;
    this.pan.y -= (dyPx * unitsPerPx) / Math.sin(ELEVATION) * 0.6;
    const lim = 4 + (this.zoom - 1) * 4;
    this.pan.clampScalar(-lim, lim);
  }

  resetPan() { this.pan.set(0, 0); }

  // ------------------------------------------------------------ room
  setRoom(shape: RoomShape, layout: RoomLayout) {
    this.shape = shape;
    this.roomGroup.clear();
    this.wallFaces = [];
    this.wallGroups.clear();
    this.wallPick.clear();
    this.wallCut.clear();
    this.target.set(shape.width / 2, 0.8, shape.depth / 2);
    this.pan.set(0, 0);

    const W = shape.width, D = shape.depth, H = shape.wallRows * WALL_ROW_HEIGHT;

    // A chunky diorama base under the floor.
    const base = new THREE.Mesh(new RoundedBoxGeometry(W + WALL_T + 0.3, 0.5, D + WALL_T + 0.3, 3, 0.12), new THREE.MeshStandardMaterial({ color: '#ead6bb', roughness: 0.9 }));
    base.position.set(W / 2 - WALL_T / 2 + 0.075, -0.25 - 0.001, D / 2 - WALL_T / 2 + 0.075);
    base.receiveShadow = true;
    this.roomGroup.add(base);

    // Floor tiles (supports masked shapes): one textured plane per row run.
    const floorGeo = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let z = 0; z < D; z++) {
      let x = 0;
      while (x < W) {
        if (!isFloorTile(shape, x, z)) { x++; continue; }
        let x1 = x;
        while (x1 < W && isFloorTile(shape, x1, z)) x1++;
        const i = pos.length / 3;
        pos.push(x, 0, z, x1, 0, z, x1, 0, z + 1, x, 0, z + 1);
        uv.push(x / 2, -z / 2, x1 / 2, -z / 2, x1 / 2, -(z + 1) / 2, x / 2, -(z + 1) / 2);
        idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
        x = x1;
      }
    }
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    floorGeo.setIndex(idx);
    floorGeo.computeVertexNormals();
    this.floorMesh = new THREE.Mesh(floorGeo, this.floorMat);
    this.floorMesh.receiveShadow = true;
    this.roomGroup.add(this.floorMesh);

    // Walls, each in its own group so it can be cut away when it faces the camera.
    const capMat = new THREE.MeshStandardMaterial({ color: '#f3e6d2', roughness: 0.9 });
    const aoMat = new THREE.MeshBasicMaterial({ color: '#6b4a32', transparent: true, opacity: 0.2, alphaMap: edgeTexture(), depthWrite: false });
    for (const wall of shape.walls) {
      const g = new THREE.Group();
      const faces: THREE.Mesh[] = [];
      const door = shape.door.wall === wall.id ? shape.door.u : -1;
      const startExt = wall.axis === 'x' ? WALL_T : 0;
      const pieces: [number, number, number, number][] = []; // along0, along1, y0, y1
      if (door >= 0) {
        pieces.push([-startExt, door, 0, H], [door + 1, wall.length, 0, H], [door, door + 1, DOOR_ROWS * WALL_ROW_HEIGHT, H]);
      } else pieces.push([-startExt, wall.length, 0, H]);
      for (const [a0, a1, y0, y1] of pieces) {
        const len = a1 - a0, hh = y1 - y0;
        const box = new THREE.Mesh(new RoundedBoxGeometry(len, hh, WALL_T, 2, 0.04), capMat);
        this.placeOnWall(box, wall, a0 + len / 2, y0 + hh / 2, -WALL_T / 2);
        box.castShadow = true; box.receiveShadow = true;
        g.add(box);
        // Inner face with the wall material, UVs in world units so the pattern lines up.
        const fa0 = Math.max(a0, 0);
        const face = this.wallFace(fa0, a1, y0, y1);
        this.placeOnWall(face, wall, 0, 0, 0.002);
        face.receiveShadow = true;
        g.add(face);
        faces.push(face);
      }
      if (door >= 0) g.add(this.buildDoor(wall, door));
      // AO strip where the wall meets the floor.
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(wall.length, 0.7), aoMat);
      ao.rotation.x = -Math.PI / 2;
      const aoHolder = new THREE.Group();
      aoHolder.add(ao);
      ao.position.set(0, 0, 0.35);
      ao.rotation.set(-Math.PI / 2, 0, 0);
      this.placeOnWall(aoHolder, wall, wall.length / 2, 0.006, 0);
      this.roomGroup.add(aoHolder);
      // Invisible plane for picking wall slots.
      const pick = new THREE.Mesh(new THREE.PlaneGeometry(wall.length, H), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      this.placeOnWall(pick, wall, wall.length / 2, H / 2, 0.01);
      pick.userData.wall = wall.id;
      g.add(pick);
      this.wallPick.set(wall.id, pick);
      this.wallFaces.push({ wall, meshes: faces });
      this.wallGroups.set(wall.id, g);
      this.roomGroup.add(g);
    }

    // Sun and its shadow camera cover the whole room.
    this.sun.position.set(W / 2 + 7, 14, D / 2 + 10);
    this.sun.target.position.set(W / 2, 0, D / 2);
    const sc = this.sun.shadow.camera;
    const ext = Math.max(W, D) * 0.85;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();

    this.buildGrid(shape);
    this.setLayout(layout);
    this.updateCamera();
  }

  private placeOnWall(obj: THREE.Object3D, wall: WallSegment, along: number, y: number, out: number) {
    if (wall.axis === 'x') {
      obj.position.set(wall.x + along, y, wall.z + out);
      obj.rotation.y = 0;
    } else {
      obj.position.set(wall.x + out, y, wall.z + along);
      obj.rotation.y = Math.PI / 2;
    }
    // Rotating a z-axis wall by +90° flips the local x direction; mirror it back.
    if (wall.axis === 'z') obj.scale.x = -Math.abs(obj.scale.x || 1);
  }

  private wallFace(a0: number, a1: number, y0: number, y1: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a0, y0, 0, a1, y0, 0, a1, y1, 0, a0, y1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([a0, y0, a1, y0, a1, y1, a0, y1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return new THREE.Mesh(g, this.wallFaceMat);
  }

  private buildDoor(wall: WallSegment, u: number): THREE.Group {
    const g = new THREE.Group();
    const h = DOOR_ROWS * WALL_ROW_HEIGHT;
    const trim = new THREE.MeshStandardMaterial({ color: '#dca46a', roughness: 0.8 });
    const panel = new THREE.MeshStandardMaterial({ color: '#9cc7b4', roughness: 0.75 });
    const add = (m: THREE.Mesh, along: number, y: number, out: number) => { this.placeOnWall(m, wall, along, y, out); m.castShadow = true; g.add(m); };
    add(new THREE.Mesh(new RoundedBoxGeometry(0.86, h - 0.06, 0.08, 2, 0.03), panel), u + 0.5, (h - 0.06) / 2, -WALL_T + 0.08);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.1, h + 0.08, 0.1, 2, 0.03), trim), u + 0.02, (h + 0.08) / 2, 0.03);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.1, h + 0.08, 0.1, 2, 0.03), trim), u + 0.98, (h + 0.08) / 2, 0.03);
    add(new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.12, 0.12, 2, 0.04), trim), u + 0.5, h + 0.04, 0.03);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#d8b36a', roughness: 0.4 })), u + 0.78, 1.0, -WALL_T + 0.16);
    const win = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.4, 0.04, 2, 0.12), new THREE.MeshStandardMaterial({ color: '#d6ecf7', emissive: '#d6ecf7', emissiveIntensity: 0.5 }));
    add(win, u + 0.5, 1.5, -WALL_T + 0.13);
    // Welcome mat on the door tile.
    const mat = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.03, 0.55, 2, 0.012), new THREE.MeshStandardMaterial({ color: '#c47a5a', roughness: 0.95 }));
    this.placeOnWall(mat, wall, u + 0.5, 0.015, 0.36);
    mat.receiveShadow = true;
    g.add(mat);
    return g;
  }

  private buildGrid(shape: RoomShape) {
    if (this.grid) this.scene.remove(this.grid);
    const pts: number[] = [];
    for (let z = 0; z < shape.depth; z++) for (let x = 0; x < shape.width; x++) {
      if (!isFloorTile(shape, x, z)) continue;
      pts.push(x, 0.02, z, x + 1, 0.02, z, x, 0.02, z, x, 0.02, z + 1);
      if (!isFloorTile(shape, x + 1, z)) pts.push(x + 1, 0.02, z, x + 1, 0.02, z + 1);
      if (!isFloorTile(shape, x, z + 1)) pts.push(x, 0.02, z + 1, x + 1, 0.02, z + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false }));
    this.grid.visible = false;
    this.scene.add(this.grid);
  }

  setGrid(on: boolean) { if (this.grid) this.grid.visible = on; }

  setLayout(layout: RoomLayout) {
    this.layout = layout;
    // Materials
    const ft = materialTexture(layout.floor);
    if (this.floorMat.map !== ft) { this.floorMat.map = ft; this.floorMat.needsUpdate = true; }
    const wt = materialTexture(layout.wall);
    if (this.wallFaceMat.map !== wt) { this.wallFaceMat.map = wt; this.wallFaceMat.needsUpdate = true; }

    // Floor items: rebuild only what changed.
    const seen = new Set<string>();
    for (const it of layout.items) {
      seen.add(it.uid);
      const key = `${it.def}|${it.x}|${it.z}|${it.rot}|${it.parent ?? ''}`;
      let obj = this.items.get(it.uid);
      if (obj && obj.userData.key === key) continue;
      const def = FURNITURE[it.def];
      if (!def) continue;
      if (!obj || obj.userData.def !== it.def) {
        if (obj) this.itemGroup.remove(obj);
        obj = buildFurniture(def, { shadows: true, contact: !it.parent });
        obj.userData.def = it.def;
        obj.userData.pop = 1;
        this.itemGroup.add(obj);
        this.items.set(it.uid, obj);
      }
      if (obj.userData.key) obj.userData.pop = 0.7;
      obj.userData.key = key;
      obj.userData.uid = it.uid;
      this.placeFloorObject(obj, def, it.x, it.z, it.rot, it.parent ? this.surfaceHeight(it.parent, layout) : 0);
    }
    for (const [uid, obj] of this.items) if (!seen.has(uid)) { this.itemGroup.remove(obj); this.items.delete(uid); }

    // Wall items
    const seenW = new Set<string>();
    for (const it of layout.wallItems) {
      seenW.add(it.uid);
      const key = `${it.def}|${it.wall}|${it.u}|${it.v}`;
      let obj = this.wallItems.get(it.uid);
      if (obj && obj.userData.key === key) continue;
      const def = FURNITURE[it.def];
      const wall = this.shape?.walls.find((w) => w.id === it.wall);
      if (!def || !wall) continue;
      if (obj) this.itemGroup.remove(obj);
      obj = buildFurniture(def, { shadows: true });
      obj.userData = { key, uid: it.uid, wallItem: true, wall: it.wall, pop: 1 };
      this.placeWallObject(obj, def, wall, it.u, it.v);
      this.itemGroup.add(obj);
      this.wallItems.set(it.uid, obj);
    }
    for (const [uid, obj] of this.wallItems) if (!seenW.has(uid)) { this.itemGroup.remove(obj); this.wallItems.delete(uid); }
  }

  private surfaceHeight(parentUid: string, layout: RoomLayout) {
    const p = layout.items.find((i) => i.uid === parentUid);
    return (p && FURNITURE[p.def]?.surface) || 0;
  }

  private placeFloorObject(obj: THREE.Object3D, def: FurnitureDef, x: number, z: number, rot: Rot, y: number) {
    const [cx, cz] = footprintCentre(def, x, z, rot);
    obj.position.set(cx, y, cz);
    obj.rotation.y = (rot * Math.PI) / 2;
  }

  private placeWallObject(obj: THREE.Object3D, def: FurnitureDef, wall: WallSegment, u: number, v: number) {
    const along = u + def.size[0] / 2;
    const y = v * WALL_ROW_HEIGHT;
    if (wall.axis === 'x') { obj.position.set(wall.x + along, y, wall.z + 0.01); obj.rotation.y = 0; }
    else { obj.position.set(wall.x + 0.01, y, wall.z + along); obj.rotation.y = Math.PI / 2; }
  }

  // ------------------------------------------------------------ edit visuals
  showGhost(defId: string | null, place?: { x: number; z: number; rot: Rot; y: number } | { wall: string; u: number; v: number }, ok = true) {
    if (!defId || !place) {
      if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
      return;
    }
    const def = FURNITURE[defId];
    if (!def) return;
    if (!this.ghost || this.ghost.userData.def !== defId) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = buildFurniture(def, { ghost: this.ghostMat });
      this.ghost.userData.def = defId;
      this.ghost.renderOrder = 5;
      this.scene.add(this.ghost);
    }
    this.ghostMat.color.set(ok ? '#86dc92' : '#f08a7e');
    this.ghostMat.emissive.set(ok ? '#2d6a36' : '#7a2a22');
    if ('wall' in place) {
      const wall = this.shape?.walls.find((w) => w.id === place.wall);
      if (wall) this.placeWallObject(this.ghost, def, wall, place.u, place.v);
      this.ghost.position.addScaledVector(wall?.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), 0.03);
    } else {
      this.placeFloorObject(this.ghost, def, place.x, place.z, place.rot, place.y + 0.01);
    }
  }

  /** Hide the real object while it is being moved (the ghost stands in for it). */
  setItemHidden(uid: string | null) {
    this.hiddenUid = uid;
    const kids = new Set(uid ? (this.layout?.items.filter((i) => i.parent === uid) ?? []).map((k) => k.uid) : []);
    for (const [id, obj] of this.items) obj.visible = id !== uid && !kids.has(id);
  }

  showSelection(uid: string | null) {
    const it = uid ? this.layout?.items.find((i) => i.uid === uid) : null;
    const wi = uid ? this.layout?.wallItems.find((i) => i.uid === uid) : null;
    if (it) {
      const def = FURNITURE[it.def];
      const [w, d] = dims(def, it.rot);
      const [cx, cz] = footprintCentre(def, it.x, it.z, it.rot);
      this.selection.scale.set(w + 0.1, d + 0.1, 1);
      this.selection.rotation.set(-Math.PI / 2, 0, 0);
      this.selection.position.set(cx, (it.parent ? this.surfaceHeight(it.parent, this.layout!) : 0) + 0.025, cz);
      this.selection.visible = true;
    } else if (wi) {
      const def = FURNITURE[wi.def];
      const wall = this.shape!.walls.find((w) => w.id === wi.wall)!;
      this.selection.scale.set(def.size[0] + 0.1, def.size[1] * WALL_ROW_HEIGHT + 0.1, 1);
      const along = wi.u + def.size[0] / 2, y = wi.v * WALL_ROW_HEIGHT + (def.size[1] * WALL_ROW_HEIGHT) / 2;
      this.selection.rotation.set(0, wall.axis === 'x' ? 0 : Math.PI / 2, 0);
      if (wall.axis === 'x') this.selection.position.set(wall.x + along, y, wall.z + 0.02);
      else this.selection.position.set(wall.x + 0.02, y, wall.z + along);
      this.selection.visible = true;
    } else this.selection.visible = false;
  }

  showMarker(tile: [number, number] | null, colour = '#ffffff') {
    if (!tile) { this.marker.visible = false; return; }
    this.marker.visible = true;
    (this.marker.material as THREE.MeshBasicMaterial).color.set(colour);
    this.marker.position.set(tile[0] + 0.5, 0.012, tile[1] + 0.5);
  }

  // ------------------------------------------------------------ avatars
  addAvatar(o: Occupant, serverOffset: number) {
    this.removeAvatar(o.userId);
    const model = new AvatarModel(o.avatar);
    model.root.userData.avatar = o.userId;
    const av: AvatarView = { model, x: o.x, z: o.z, from: [o.x, o.z], path: [], start: 0, facing: o.facing, targetFacing: o.facing, sitAfter: null };
    if (o.path.length) {
      av.path = o.path;
      av.start = performance.now() - (Date.now() + serverOffset - o.pathStart);
      if (o.state === 'sit' && o.sitY !== undefined) av.sitAfter = { y: o.sitY, facing: o.facing };
    } else if (o.state === 'sit' && o.sitY !== undefined) {
      model.setSit(o.sitY);
    } else if (o.state === 'dance') model.state = 'dance';
    this.avatars.set(o.userId, av);
    this.avatarGroup.add(model.root);
    this.syncAvatar(av);
  }

  removeAvatar(id: string) {
    const av = this.avatars.get(id);
    if (av) { this.avatarGroup.remove(av.model.root); this.avatars.delete(id); }
  }

  clearAvatars() { for (const id of [...this.avatars.keys()]) this.removeAvatar(id); }

  moveAvatar(id: string, from: [number, number], path: [number, number][], startedAgo: number, sit?: { y: number; facing: number }) {
    const av = this.avatars.get(id);
    if (!av) return;
    // Walk from wherever we are drawn now, through the server's start tile.
    av.from = [av.x, av.z];
    av.path = [from, ...path];
    av.start = performance.now() - startedAgo;
    av.sitAfter = sit ?? null;
    av.model.state = 'stand';
  }

  emote(id: string, kind: 'wave' | 'dance' | 'stand') {
    const av = this.avatars.get(id);
    if (!av) return;
    if (kind === 'wave') av.model.wave();
    if (kind === 'dance') av.model.state = 'dance';
    if (kind === 'stand') av.model.state = 'stand';
  }

  setLook(id: string, look: AvatarLook) { this.avatars.get(id)?.model.setLook(look); }

  avatarScreen(id: string): { x: number; y: number } | null {
    const av = this.avatars.get(id);
    if (!av) return null;
    return this.toScreen(new THREE.Vector3(av.x + 0.5, av.model.topY(), av.z + 0.5));
  }

  avatarTile(id: string): [number, number] | null {
    const av = this.avatars.get(id);
    return av ? [Math.round(av.x), Math.round(av.z)] : null;
  }

  toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top };
  }

  /** Screen position of a tile centre (handy for tests and tooltips). */
  tileScreen(x: number, z: number, y = 0) { return this.toScreen(new THREE.Vector3(x + 0.5, y, z + 0.5)); }

  itemScreen(uid: string): { x: number; y: number } | null {
    const obj = this.items.get(uid) ?? this.wallItems.get(uid);
    if (!obj) return null;
    const box = new THREE.Box3().setFromObject(obj);
    return this.toScreen(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.2, (box.min.z + box.max.z) / 2));
  }

  private syncAvatar(av: AvatarView) {
    av.model.root.position.set(av.x + 0.5, 0, av.z + 0.5);
    av.model.root.rotation.y = av.facing;
  }

  // ------------------------------------------------------------ picking
  pick(clientX: number, clientY: number, opts: { items?: boolean; walls?: boolean; avatars?: boolean } = {}): PickResult {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out: PickResult = { tile: null, item: null, itemPoint: null, wallItem: null, wall: null, avatar: null };

    const floorHit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit) && this.shape) {
      const tx = Math.floor(floorHit.x), tz = Math.floor(floorHit.z);
      if (isFloorTile(this.shape, tx, tz)) out.tile = [tx, tz];
    }
    if (opts.avatars) {
      const boxes = [...this.avatars.entries()].map(([id, av]) => { av.model.hitbox.userData.avatar = id; return av.model.hitbox; });
      const hit = this.raycaster.intersectObjects(boxes, false)[0];
      if (hit) out.avatar = hit.object.userData.avatar;
    }
    if (opts.items || opts.walls) {
      const targets: THREE.Object3D[] = [];
      if (opts.items) for (const obj of [...this.items.values(), ...this.wallItems.values()]) if (obj.visible && this.objectShown(obj)) targets.push(obj);
      if (opts.walls) for (const [id, m] of this.wallPick) if ((this.wallCut.get(id) ?? 1) > 0.5) targets.push(m);
      const hits = this.raycaster.intersectObjects(targets, true).filter((h) => !h.object.userData.noPick && !(h.object as THREE.Sprite).isSprite);
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.uid && !o.userData.wall) o = o.parent;
        if (!o) continue;
        if (o.userData.wall && !o.userData.uid) {
          if (!out.wall) out.wall = this.wallCoords(o.userData.wall, h.point);
          continue;
        }
        if (out.item || out.wallItem) continue;
        if (o.userData.wallItem) out.wallItem = this.layout?.wallItems.find((w) => w.uid === o!.userData.uid) ?? null;
        else { out.item = this.layout?.items.find((i) => i.uid === o!.userData.uid) ?? null; out.itemPoint = h.point.clone(); }
        if (!opts.walls) break;
      }
    }
    return out;
  }

  private objectShown(obj: THREE.Object3D) {
    if (!obj.userData.wallItem) return true;
    return (this.wallCut.get(obj.userData.wall) ?? 1) > 0.5;
  }

  private wallCoords(id: string, p: THREE.Vector3) {
    const wall = this.shape!.walls.find((w) => w.id === id)!;
    const along = wall.axis === 'x' ? p.x - wall.x : p.z - wall.z;
    return { id, along, y: p.y };
  }

  // ------------------------------------------------------------ per-frame
  /** A wall faces the camera when its inward normal points away from the viewer: cut it down. */
  private updateWallVisibility(instant = false) {
    if (!this.shape) return;
    const dx = Math.sin(this.az), dz = Math.cos(this.az);
    for (const wall of this.shape.walls) {
      const dot = wall.axis === 'x' ? dz : dx;
      const want = dot > 0.05 ? 1 : 0;
      const cur = this.wallCut.get(wall.id) ?? want;
      const next = instant ? want : cur + (want - cur) * 0.18;
      this.wallCut.set(wall.id, next);
      const g = this.wallGroups.get(wall.id);
      if (g) {
        const H = this.shape.wallRows * WALL_ROW_HEIGHT;
        g.scale.y = Math.max(0.12 / H, next);
      }
      for (const obj of this.wallItems.values()) if (obj.userData.wall === wall.id) obj.visible = next > 0.6 && obj.userData.uid !== this.hiddenUid;
    }
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();

    // Ease rotation and zoom.
    this.az += (this.azTarget - this.az) * Math.min(1, dt * 9);
    if (Math.abs(this.azTarget - this.az) < 0.0005) this.az = this.azTarget;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 10);
    this.updateCamera();
    this.updateWallVisibility();

    // Pop-in for newly placed items.
    for (const obj of [...this.items.values(), ...this.wallItems.values()]) {
      if (obj.userData.pop > 0) {
        obj.userData.pop = Math.max(0, obj.userData.pop - dt * 4);
        const k = Math.sin(obj.userData.pop * Math.PI);
        obj.scale.set(1 + k * 0.12, 1 - k * 0.08, 1 + k * 0.12);
      }
    }

    for (const av of this.avatars.values()) {
      if (av.path.length) {
        const p = positionAlong(av.from, av.path, WALK_SPEED, now - av.start);
        av.x = p.x; av.z = p.z;
        if (p.heading !== null && !p.done) av.targetFacing = p.heading;
        av.model.walking = !p.done;
        if (p.done) {
          av.path = [];
          if (av.sitAfter) { av.model.setSit(av.sitAfter.y); av.targetFacing = av.sitAfter.facing; }
        }
      } else av.model.walking = false;
      let d = av.targetFacing - av.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      av.facing += d * Math.min(1, dt * 12);
      av.model.update(dt, t);
      this.syncAvatar(av);
    }
    // Draw order: nearer avatars on top for overlapping bubbles is handled by DOM; nothing to sort here.
    for (const fn of this.onFrame) fn(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

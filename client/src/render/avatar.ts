// Small rounded avatars with big heads, built from primitives, plus their
// bouncy walk, wave, dance and sit animations.

import * as THREE from 'three';
import type { AvatarLook, AvatarState } from '../../../shared/types';
import { blobTexture } from './textures';

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(colour: string, rough = 0.8) {
  const key = `${colour}|${rough}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: colour, roughness: rough }); mats.set(key, m); }
  return m;
}

const G = {
  head: new THREE.SphereGeometry(0.27, 28, 20),
  eye: new THREE.SphereGeometry(0.035, 10, 8),
  cheek: new THREE.CircleGeometry(0.04, 12),
  limb: new THREE.CapsuleGeometry(0.055, 0.14, 4, 10),
  arm: new THREE.CapsuleGeometry(0.048, 0.13, 4, 10),
  hand: new THREE.SphereGeometry(0.055, 10, 8),
  foot: new THREE.SphereGeometry(0.07, 12, 8),
  torso: new THREE.CapsuleGeometry(0.15, 0.1, 6, 16),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  smile: new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI),
  skirt: new THREE.CylinderGeometry(0.14, 0.22, 0.16, 18),
  hood: new THREE.TorusGeometry(0.12, 0.05, 8, 16),
  bib: new THREE.BoxGeometry(0.16, 0.13, 0.04),
  stripe: new THREE.CylinderGeometry(0.152, 0.152, 0.025, 18),
};

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

const blobMat = new THREE.MeshBasicMaterial({ color: '#4a3020', transparent: true, opacity: 0.25, depthWrite: false });

export class AvatarModel {
  root = new THREE.Group();
  private bob = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  hitbox: THREE.Mesh;

  state: AvatarState = 'stand';
  walking = false;
  private phase = 0;
  private waveT = 0;
  private sitY = 0;
  private sitBlend = 0;
  private popT = 0;

  constructor(public look: AvatarLook) {
    this.root.add(this.bob);
    this.bob.add(this.body);
    this.build(look);
    if (!blobMat.alphaMap) blobMat.alphaMap = blobTexture();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), blobMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    shadow.userData.noPick = true;
    this.root.add(shadow);
    this.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.1, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 0.55;
    this.root.add(this.hitbox);
    this.popT = 1;
  }

  setLook(look: AvatarLook) {
    this.look = look;
    this.body.clear();
    this.head = new THREE.Group();
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    this.build(look);
    this.popT = 1;
  }

  private build(l: AvatarLook) {
    const skin = mat(l.skin);
    const top = mat(l.topColor);
    const bottom = mat(l.bottomColor);
    const shoe = mat(shade(l.bottomColor, -0.3));
    const hair = mat(l.hairColor, 0.7);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, s?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (s) mesh.scale.set(...s);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // legs pivot at the hip
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.position.set(side * 0.075, 0.24, 0);
      const legMat = l.bottom === 'trousers' ? bottom : skin;
      add(leg, G.limb, legMat, 0, -0.1, 0);
      add(leg, G.foot, shoe, 0, -0.2, 0.03, [1, 0.7, 1.25]);
      this.body.add(leg);
    }
    // hips / bottoms
    if (l.bottom === 'skirt') add(this.body, G.skirt, bottom, 0, 0.27, 0);
    else add(this.body, G.sphere, bottom, 0, 0.28, 0, [0.16, 0.09, 0.13]);
    if (l.bottom === 'shorts') {
      add(this.body, G.limb, bottom, -0.075, 0.2, 0, [1.25, 0.45, 1.25]);
      add(this.body, G.limb, bottom, 0.075, 0.2, 0, [1.25, 0.45, 1.25]);
    }
    // torso
    const torsoMat = l.top === 'pinafore' ? mat('#fbf7f1') : top;
    add(this.body, G.torso, torsoMat, 0, 0.4, 0, [1, 0.85, 0.85]);
    if (l.top === 'stripe') {
      for (const y of [0.34, 0.41, 0.48]) add(this.body, G.stripe, mat('#fbf7f1'), 0, y, 0, [1, 1, 0.86]);
    }
    if (l.top === 'pinafore') {
      add(this.body, G.sphere, top, 0, 0.36, 0, [0.158, 0.11, 0.133]);
      add(this.body, G.bib, top, 0, 0.45, 0.11);
    }
    if (l.top === 'hoodie') {
      const hood = add(this.body, G.hood, top, 0, 0.55, -0.06);
      hood.rotation.x = Math.PI / 2.4;
    }
    // arms pivot at the shoulder
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(side * 0.17, 0.5, 0);
      const sleeve = add(arm, G.arm, l.top === 'pinafore' ? mat('#fbf7f1') : top, 0, -0.08, 0);
      sleeve.rotation.z = side * 0.18;
      add(arm, G.hand, skin, side * 0.03, -0.19, 0);
      this.body.add(arm);
    }
    // head
    this.head.position.set(0, 0.8, 0);
    add(this.head, G.head, skin, 0, 0, 0, [1, 0.95, 0.95]);
    const eyeMat = mat('#3a2f33', 0.4);
    add(this.head, G.eye, eyeMat, -0.09, 0.0, 0.24, [1, 1.3, 0.6]);
    add(this.head, G.eye, eyeMat, 0.09, 0.0, 0.24, [1, 1.3, 0.6]);
    const cheekMat = new THREE.MeshBasicMaterial({ color: '#f29a9a', transparent: true, opacity: 0.45, depthWrite: false });
    for (const side of [-1, 1]) {
      const ch = new THREE.Mesh(G.cheek, cheekMat);
      ch.position.set(side * 0.15, -0.06, 0.215);
      ch.rotation.y = side * 0.55;
      this.head.add(ch);
    }
    const smile = add(this.head, G.smile, eyeMat, 0, -0.07, 0.25);
    smile.rotation.z = Math.PI;
    this.buildHair(l, hair, add);
    this.body.add(this.head);
  }

  private buildHair(l: AvatarLook, hair: THREE.Material, add: (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, s?: [number, number, number]) => THREE.Mesh) {
    const h = this.head;
    switch (l.hair) {
      // Hair is a cap set up and back on the head, so the face stays clear.
      case 'crop':
        add(h, G.sphere, hair, 0, 0.075, -0.06, [0.285, 0.255, 0.27]);
        add(h, G.sphere, hair, 0.04, 0.19, 0.12, [0.17, 0.07, 0.1]);
        break;
      case 'bob':
        add(h, G.sphere, hair, 0, 0.06, -0.06, [0.3, 0.28, 0.28]);
        add(h, G.sphere, hair, -0.22, -0.08, -0.04, [0.09, 0.15, 0.17]);
        add(h, G.sphere, hair, 0.22, -0.08, -0.04, [0.09, 0.15, 0.17]);
        add(h, G.sphere, hair, 0, 0.17, 0.12, [0.23, 0.08, 0.11]);
        break;
      case 'bun':
        add(h, G.sphere, hair, 0, 0.075, -0.06, [0.285, 0.255, 0.27]);
        add(h, G.sphere, hair, 0, 0.3, -0.08, [0.11, 0.11, 0.11]);
        break;
      case 'curly':
        for (let i = 0; i < 9; i++) {
          const a = Math.PI * 0.15 + (i / 8) * Math.PI * 1.7;
          add(h, G.sphere, hair, Math.cos(a) * 0.21, 0.13 + Math.sin(i * 1.7) * 0.03, -Math.sin(a) * 0.17 - 0.03, [0.11, 0.11, 0.11]);
        }
        add(h, G.sphere, hair, 0, 0.17, -0.04, [0.22, 0.13, 0.2]);
        add(h, G.sphere, hair, 0, 0.2, 0.12, [0.18, 0.08, 0.1]);
        break;
      case 'tuft':
        add(h, G.sphere, hair, 0, 0.1, -0.07, [0.27, 0.2, 0.24]);
        for (const [x, rz] of [[-0.05, 0.4], [0.02, 0], [0.08, -0.4]]) {
          const t = add(h, G.sphere, hair, x, 0.29, 0.06, [0.04, 0.09, 0.04]);
          t.rotation.z = rz;
        }
        break;
      case 'none':
        break;
    }
  }

  wave() { this.waveT = 1.8; }

  /** Height just above the head, for speech bubbles. */
  topY() { return this.bob.position.y + 1.18; }

  setSit(y: number | null) {
    if (y === null) { this.state = this.state === 'sit' ? 'stand' : this.state; return; }
    this.state = 'sit';
    this.sitY = y;
  }

  /** Advance animation. `speed` is tiles/second of current movement. */
  update(dt: number, t: number) {
    const walking = this.walking;
    if (walking) this.phase += dt * 11;
    const swing = walking ? Math.sin(this.phase) : 0;
    const sitting = this.state === 'sit' && !walking;
    this.sitBlend += ((sitting ? 1 : 0) - this.sitBlend) * Math.min(1, dt * 10);

    // legs and arms
    const legSwing = swing * 0.7;
    this.legL.rotation.x = legSwing * (1 - this.sitBlend) - 1.45 * this.sitBlend;
    this.legR.rotation.x = -legSwing * (1 - this.sitBlend) - 1.45 * this.sitBlend;
    this.armL.rotation.x = -swing * 0.6;
    this.armR.rotation.x = swing * 0.6;
    this.armL.rotation.z = 0;
    this.armR.rotation.z = 0;

    let bobY = walking ? Math.abs(Math.sin(this.phase)) * 0.07 : Math.sin(t * 2.2) * 0.008;
    let squash = walking ? 1 - Math.abs(Math.cos(this.phase)) * 0.05 : 1 + Math.sin(t * 2.2) * 0.012;
    this.body.rotation.y = 0;
    this.body.rotation.z = walking ? Math.sin(this.phase) * 0.05 : 0;
    this.head.rotation.z = 0;

    if (this.state === 'dance' && !walking) {
      const d = t * 7;
      bobY = Math.abs(Math.sin(d)) * 0.12;
      squash = 1 - Math.abs(Math.cos(d)) * 0.08;
      this.body.rotation.y = Math.sin(d * 0.5) * 0.6;
      this.body.rotation.z = Math.sin(d) * 0.12;
      this.armL.rotation.z = -2.4 + Math.sin(d) * 0.4;
      this.armR.rotation.z = 2.4 + Math.sin(d) * 0.4;
      this.legL.rotation.x = Math.max(0, Math.sin(d)) * -0.5;
      this.legR.rotation.x = Math.max(0, -Math.sin(d)) * -0.5;
      this.head.rotation.z = Math.sin(d) * 0.15;
    }
    if (this.waveT > 0) {
      this.waveT -= dt;
      const k = Math.min(1, this.waveT * 3, (1.8 - this.waveT) * 6);
      this.armR.rotation.z = (2.7 + Math.sin(t * 14) * 0.35) * k;
      this.armR.rotation.x = 0;
    }
    if (this.sitBlend > 0.01) {
      this.armL.rotation.x = -0.5 * this.sitBlend;
      this.armR.rotation.x = this.waveT > 0 ? 0 : -0.5 * this.sitBlend;
    }
    // A little pop when the avatar appears or changes clothes.
    let pop = 1;
    if (this.popT > 0) {
      this.popT = Math.max(0, this.popT - dt * 3);
      pop = 1 + Math.sin((1 - this.popT) * Math.PI) * 0.18;
    }
    this.bob.position.y = bobY * (1 - this.sitBlend) + (this.sitY - 0.22) * this.sitBlend;
    this.bob.position.z = -0.08 * this.sitBlend;
    this.body.scale.set(pop * (2 - squash), pop * squash, pop * (2 - squash));
  }
}

// Turns catalogue part lists into three.js groups. Geometries and materials are
// cached and shared, which keeps draw setup cheap on modest laptops.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FURNITURE } from '../../../shared/catalogue';
import type { FurnitureDef, Part } from '../../../shared/types';
import { blobTexture, glowTexture, partTexture } from './textures';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();
const DEG = Math.PI / 180;
export const SMALL_SCALE = 1.3;

function roundedCylinder(rb: number, rt: number, h: number, bevel: number, seg: number): THREE.BufferGeometry {
  const b = Math.min(bevel, rb * 0.5, rt * 0.5, h * 0.45);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + ((a1 - a0) * i) / 4;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * b, cy + Math.sin(a) * b));
    }
  };
  if (b > 0.001) {
    arc(rb - b, b, -Math.PI / 2, 0);
    arc(rt - b, h - b, 0, Math.PI / 2);
  } else {
    pts.push(new THREE.Vector2(rb, 0), new THREE.Vector2(rt, h));
  }
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, seg);
  g.translate(0, -h / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Geometry for a part, built at its real size where bevels matter, unit size otherwise. */
function geometryFor(p: Part): { geo: THREE.BufferGeometry; scale: THREE.Vector3 } {
  const [w, h, d] = p.size;
  const seg = p.seg ?? 0;
  switch (p.s) {
    case 'box': {
      const r = Math.max(0.001, Math.min(p.r ?? 0.06, Math.min(w, h, d) / 2 - 0.001));
      const key = `box|${w}|${h}|${d}|${r}`;
      let geo = geoCache.get(key);
      if (!geo) { geo = new RoundedBoxGeometry(w, h, d, 2, r); geoCache.set(key, geo); }
      return { geo, scale: new THREE.Vector3(1, 1, 1) };
    }
    case 'cyl': {
      const taper = p.taper ?? 1;
      const key = `cyl|${w}|${h}|${taper}|${p.r ?? 0.03}|${seg}`;
      let geo = geoCache.get(key);
      if (!geo) { geo = roundedCylinder(w / 2, (w / 2) * taper, h, p.r ?? 0.03, seg || 22); geoCache.set(key, geo); }
      return { geo, scale: new THREE.Vector3(1, 1, d / w) };
    }
    case 'sphere': {
      const key = `sph|${seg}`;
      let geo = geoCache.get(key);
      if (!geo) { geo = new THREE.SphereGeometry(0.5, seg || 20, Math.max(8, Math.round((seg || 20) * 0.7))); geoCache.set(key, geo); }
      return { geo, scale: new THREE.Vector3(w, h, d) };
    }
    case 'cone': {
      const key = `cone|${seg}`;
      let geo = geoCache.get(key);
      if (!geo) { geo = new THREE.ConeGeometry(0.5, 1, seg || 20); geoCache.set(key, geo); }
      return { geo, scale: new THREE.Vector3(w, h, d) };
    }
    case 'torus': {
      const tube = h / 2;
      const R = w / 2 - tube;
      const key = `tor|${R}|${tube}|${seg}`;
      let geo = geoCache.get(key);
      if (!geo) { geo = new THREE.TorusGeometry(R, tube, 10, seg || 24); geo.rotateX(-Math.PI / 2); geoCache.set(key, geo); }
      return { geo, scale: new THREE.Vector3(1, 1, d / w) };
    }
    case 'capsule': {
      const key = `cap|${seg}`;
      let geo = geoCache.get(key);
      if (!geo) { geo = new THREE.CapsuleGeometry(0.5, 1, 6, seg || 14); geoCache.set(key, geo); }
      return { geo, scale: new THREE.Vector3(w, h / 2, d) };
    }
  }
}

export function materialFor(p: Pick<Part, 'c' | 'c2' | 't'>): THREE.Material {
  const key = `${p.c}|${p.c2 ?? ''}|${p.t ?? 'plain'}`;
  let m = matCache.get(key);
  if (m) return m;
  if (p.t === 'glow') {
    m = new THREE.MeshStandardMaterial({ color: p.c, emissive: p.c, emissiveIntensity: 0.85, roughness: 0.6 });
  } else {
    const tex = p.t ? partTexture(p.t, p.c, p.c2) : null;
    m = new THREE.MeshStandardMaterial({
      color: tex && !tex.tinted ? '#ffffff' : p.c,
      map: tex?.map ?? null,
      roughness: 0.82,
      metalness: 0,
    });
  }
  matCache.set(key, m);
  return m;
}

export function buildPart(p: Part, override?: THREE.Material): THREE.Mesh {
  const { geo, scale } = geometryFor(p);
  const mesh = new THREE.Mesh(geo, override ?? materialFor(p));
  mesh.scale.copy(scale);
  mesh.position.set(p.at[0], p.at[1] + p.size[1] / 2, p.at[2]);
  if (p.rot) {
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG);
  }
  return mesh;
}

export interface BuildOptions {
  ghost?: THREE.Material;
  shadows?: boolean;
  /** Add a soft contact shadow under floor items. */
  contact?: boolean;
  /** Skip glow halos (for thumbnails). */
  noHalo?: boolean;
}

const blobMat = new THREE.MeshBasicMaterial({ color: '#5a3a28', transparent: true, opacity: 0.22, depthWrite: false, alphaMap: null as any });

/** Model centred on its footprint, front facing +z, sitting on y = 0. */
export function buildFurniture(def: FurnitureDef, opts: BuildOptions = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = def.id;
  // Small table-top things are drawn a touch oversized so they stay chunky and readable.
  const body = new THREE.Group();
  if (def.small) body.scale.setScalar(SMALL_SCALE);
  g.add(body);
  for (const p of def.parts) {
    const mesh = buildPart(p, opts.ghost);
    if (opts.shadows && !opts.ghost) {
      mesh.castShadow = !def.rug && p.t !== 'glow';
      mesh.receiveShadow = true;
    }
    body.add(mesh);
  }
  if (opts.contact && def.kind === 'floor' && !def.rug && !opts.ghost) {
    if (!blobMat.alphaMap) { blobMat.alphaMap = blobTexture(); blobMat.needsUpdate = true; }
    // Size the shadow to the model's own footprint, not the grid footprint.
    let ex = 0, ez = 0;
    for (const p of def.parts) {
      ex = Math.max(ex, Math.abs(p.at[0]) + p.size[0] / 2);
      ez = Math.max(ez, Math.abs(p.at[2]) + p.size[2] / 2);
    }
    const k = def.small ? SMALL_SCALE : 1;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(ex * 2.3 * k + 0.1, ez * 2.3 * k + 0.1), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    blob.userData.noPick = true;
    g.add(blob);
  }
  if (def.light && !opts.ghost && !opts.noHalo) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    const glowPart = def.parts.find((p) => p.t === 'glow');
    if (glowPart) {
      halo.position.set(glowPart.at[0], glowPart.at[1] + glowPart.size[1] / 2, glowPart.at[2] + (def.kind === 'wall' ? 0.1 : 0));
      if (def.small) halo.position.multiplyScalar(SMALL_SCALE);
      const s = def.kind === 'wall' ? 2.2 : 1.4;
      halo.scale.set(s, s, s);
      halo.userData.noPick = true;
      g.add(halo);
    }
  }
  return g;
}

export function buildById(id: string, opts?: BuildOptions) {
  const def = FURNITURE[id];
  return def ? buildFurniture(def, opts) : new THREE.Group();
}

export function ghostMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#7fd68a', transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.7, emissive: '#2a5a30', emissiveIntensity: 0.3 });
}

// Catalogue and inventory thumbnails, rendered once per item with a small
// offscreen renderer and cached as data URLs.

import * as THREE from 'three';
import { FURNITURE } from '../../../shared/catalogue';
import { buildFurniture } from './models';
import { materialCanvas } from './textures';

let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
const cache = new Map<string, string>();
const queue: { id: string; resolve: (url: string) => void }[] = [];
let busy = false;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 160);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  scene.add(new THREE.HemisphereLight('#fff6e8', '#d9bfa3', 2.2));
  const sun = new THREE.DirectionalLight('#fff0d6', 1.8);
  sun.position.set(3, 6, 5);
  scene.add(sun);
}

function render(id: string): string {
  if (!renderer) setup();
  const def = FURNITURE[id];
  if (!def) return '';
  const model = buildFurniture(def, { noHalo: true });
  if (def.kind === 'wall') model.rotation.y = -Math.PI / 5;
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.72 + 0.05;
  camera.left = -r; camera.right = r; camera.top = r; camera.bottom = -r;
  const dir = def.kind === 'wall' ? new THREE.Vector3(0.2, 0.25, 1) : new THREE.Vector3(1, 0.85, 1);
  camera.position.copy(centre).addScaledVector(dir.normalize(), 20);
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  renderer!.render(scene, camera);
  const url = renderer!.domElement.toDataURL('image/png');
  scene.remove(model);
  return url;
}

function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const start = performance.now();
    while (queue.length && performance.now() - start < 12) {
      const job = queue.shift()!;
      let url = cache.get(job.id);
      if (!url) { url = render(job.id); cache.set(job.id, url); }
      job.resolve(url);
    }
    if (queue.length) requestAnimationFrame(step); else busy = false;
  };
  requestAnimationFrame(step);
}

export function thumbnail(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => { queue.push({ id, resolve }); pump(); });
}

/** Fill an <img> with an item thumbnail as soon as it's ready. */
export function thumbInto(img: HTMLImageElement, id: string) {
  img.alt = FURNITURE[id]?.name ?? id;
  thumbnail(id).then((url) => { img.src = url; img.classList.add('ready'); });
}

const swatches = new Map<string, string>();
export function swatch(materialId: string): string {
  let s = swatches.get(materialId);
  if (!s) { s = materialCanvas(materialId).toDataURL('image/png'); swatches.set(materialId, s); }
  return s;
}

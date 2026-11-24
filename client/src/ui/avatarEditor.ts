// Avatar editor with a live, slowly turning 3D preview.

import * as THREE from 'three';
import { BOTTOM_STYLES, CLOTH_COLOURS, HAIR_COLOURS, HAIR_STYLES, SKIN_TONES, STYLE_LABELS, TOP_STYLES } from '../../../shared/avatar';
import type { AvatarLook } from '../../../shared/types';
import { sfx } from '../audio';
import { net } from '../net';
import { AvatarModel } from '../render/avatar';
import { state } from '../state';
import { btn, h, modal, toast } from './dom';

export function openAvatarEditor(firstTime = false) {
  const look: AvatarLook = { ...state.profile!.avatar };
  const canvasHost = h('div', { class: 'avatar-preview' });
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(220, 260);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  canvasHost.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#d9bfa3', 2.2));
  const sun = new THREE.DirectionalLight('#fff0d6', 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-0.75, 0.75, 1.0, -0.78, 0.1, 20);
  cam.position.set(0, 1.2, 5);
  cam.lookAt(0, 0.55, 0);
  const model = new AvatarModel(look);
  scene.add(model.root);
  const clock = new THREE.Clock();
  let wavedOnce = false;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    model.root.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.6;
    if (!wavedOnce && clock.elapsedTime > 0.6) { model.wave(); wavedOnce = true; }
    model.update(dt, clock.elapsedTime);
    renderer.render(scene, cam);
  });

  const refresh = () => { model.setLook({ ...look }); draw(); };
  const opts = h('div', { class: 'stack avatar-opts' });
  const row = (label: string, items: HTMLElement[]) => h('div', { class: 'field' }, h('span', null, label), h('div', { class: 'row wrap tight' }, ...items));
  const swatches = (key: keyof AvatarLook, colours: string[]) => colours.map((c) => h('button', {
    class: `swatch-btn ${look[key] === c ? 'on' : ''}`, style: { background: c }, 'aria-label': c,
    onclick: () => { sfx.click(); (look as any)[key] = c; refresh(); },
  }));
  const chips = (key: keyof AvatarLook, values: string[]) => values.map((v) => h('button', {
    class: `chip-btn ${look[key] === v ? 'on' : ''}`, onclick: () => { sfx.click(); (look as any)[key] = v; refresh(); },
  }, STYLE_LABELS[v] ?? v));
  const draw = () => opts.replaceChildren(
    row('Skin', swatches('skin', SKIN_TONES)),
    row('Hair', chips('hair', HAIR_STYLES)), row('', swatches('hairColor', HAIR_COLOURS)),
    row('Top', chips('top', TOP_STYLES)), row('', swatches('topColor', CLOTH_COLOURS)),
    row('Bottoms', chips('bottom', BOTTOM_STYLES)), row('', swatches('bottomColor', CLOTH_COLOURS)),
  );
  draw();
  const body = h('div', { class: 'avatar-editor' },
    firstTime ? h('p', { class: 'muted-text full' }, 'Welcome to Pebble Court! Pick a look — you can change it any time from the shirt button.') : null,
    canvasHost, opts);
  const m = modal(firstTime ? 'Make yourself at home' : 'Your look', body, { wide: true, onClose: () => { renderer.setAnimationLoop(null); renderer.dispose(); } });
  body.append(h('div', { class: 'row end full' },
    btn('Surprise me', () => {
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      Object.assign(look, { skin: pick(SKIN_TONES), hair: pick(HAIR_STYLES), hairColor: pick(HAIR_COLOURS), top: pick(TOP_STYLES), topColor: pick(CLOTH_COLOURS), bottom: pick(BOTTOM_STYLES), bottomColor: pick(CLOTH_COLOURS) });
      refresh();
    }, 'ghost'),
    btn('Save look', async () => {
      try { await net.request('avatar.update', { avatar: look }); sfx.chime(); m.close(); }
      catch (e) { toast((e as Error).message, 'warn'); }
    }, 'primary')));
}

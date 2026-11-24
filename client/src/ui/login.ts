// Sign in / create account screen.

import { USERNAME_RE } from '../../../shared/filter';
import { authRequest } from '../net';
import { btn, h } from './dom';

export function showLogin(root: HTMLElement, onToken: (token: string) => void, message?: string) {
  let mode: 'login' | 'register' = 'register';
  const name = h('input', { autocomplete: 'username', maxLength: 16, placeholder: 'e.g. Marigold', 'aria-label': 'Name' }) as HTMLInputElement;
  const pass = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'At least 6 characters', 'aria-label': 'Password' }) as HTMLInputElement;
  const err = h('p', { class: 'form-error', role: 'alert' }, message ?? '');
  const submit = btn('Move in', () => go(), 'primary big');
  const switcher = h('button', { class: 'link', type: 'button', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; sync(); } });
  const title = h('h2');
  const sync = () => {
    title.textContent = mode === 'register' ? 'Get the keys to your flat' : 'Welcome back';
    submit.textContent = mode === 'register' ? 'Move in' : 'Come in';
    switcher.textContent = mode === 'register' ? 'Already live here? Sign in' : 'New here? Create an account';
    pass.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    err.textContent = '';
  };
  const go = async () => {
    err.textContent = '';
    if (mode === 'register' && !USERNAME_RE.test(name.value.trim())) { err.textContent = 'Names are 3–16 letters, numbers or underscores, starting with a letter.'; return; }
    submit.disabled = true;
    try { onToken(await authRequest(mode, name.value.trim(), pass.value)); }
    catch (e) { err.textContent = (e as Error).message; }
    finally { submit.disabled = false; }
  };
  for (const i of [name, pass]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  sync();
  const screen = h('div', { class: 'login' },
    h('div', { class: 'login-card card' },
      h('div', { class: 'logo' }, h('span', { class: 'logo-pebble' }), h('h1', null, 'Pebble Court')),
      h('p', { class: 'tagline' }, 'A cosy block of tiny flats. Decorate yours, drop in on the neighbours, leave a note on the way out.'),
      title,
      h('label', { class: 'field' }, h('span', null, 'Name'), name),
      h('label', { class: 'field' }, h('span', null, 'Password'), pass),
      err, submit, switcher,
      h('p', { class: 'small-print' }, 'Be kind. Chat is filtered, and every player can mute, block and report.')));
  root.replaceChildren(screen);
  setTimeout(() => name.focus(), 50);
}

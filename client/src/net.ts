// WebSocket client: typed request/response plus pushed events, with reconnect.

import type { Op, Params, Result, ServerEvent, ServerMessage } from '../../shared/protocol';

type Listener = (ev: ServerEvent) => void;

export class Net {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();
  private token = '';
  private retry = 0;
  private closedByUs = false;
  onStatus: (s: 'open' | 'closed' | 'reconnecting' | 'replaced' | 'unauthorised') => void = () => {};

  connect(token: string): Promise<void> {
    this.token = token;
    this.closedByUs = false;
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => { opened = true; this.retry = 0; this.onStatus('open'); resolve(); };
      ws.onmessage = (e) => this.handle(JSON.parse(e.data) as ServerMessage);
      ws.onclose = (e) => {
        for (const p of this.pending.values()) p.reject(new Error('Connection lost'));
        this.pending.clear();
        if (!opened) { this.onStatus('unauthorised'); reject(new Error('Could not connect')); return; }
        if (e.code === 4000) { this.onStatus('replaced'); return; }
        if (this.closedByUs) return;
        this.onStatus('reconnecting');
        const delay = Math.min(8000, 500 * 2 ** this.retry++);
        setTimeout(() => this.connect(this.token).catch(() => {}), delay);
      };
    });
  }

  close() { this.closedByUs = true; this.ws?.close(); }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  request<O extends Op>(op: O, p: Params<O>): Promise<Result<O>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new Error('Not connected'));
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, op, p }));
    });
  }

  private handle(msg: ServerMessage) {
    if (msg.t === 'res') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data); else p.reject(new Error(msg.error));
      return;
    }
    for (const l of this.listeners) l(msg);
  }
}

export const net = new Net();

export async function authRequest(path: 'register' | 'login', username: string, password: string): Promise<string> {
  const res = await fetch(`/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const data = await res.json().catch(() => ({ error: 'The server did not answer' }));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
  return data.token;
}

// Shared handles for the running game: the world view, the controller, and navigation.

import { net } from './net';
import type { Controller } from './controller';
import type { World } from './render/world';
import { state } from './state';
import { toast } from './ui/dom';

export const app = {
  world: null as unknown as World,
  ctrl: null as unknown as Controller,
  serverOffset: 0,
  entering: false,

  async goTo(roomId: string): Promise<boolean> {
    if (this.entering) return false;
    this.entering = true;
    try {
      const snap = await net.request('room.enter', { roomId });
      this.serverOffset = snap.serverTime - Date.now();
      state.setRoom(snap.room, snap.occupants);
      return true;
    } catch (e) {
      toast((e as Error).message, 'warn');
      return false;
    } finally {
      this.entering = false;
    }
  },

  goHome() {
    if (state.profile) return this.goTo(state.profile.apartmentId);
    return Promise.resolve(false);
  },
};

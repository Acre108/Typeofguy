// Token-bucket rate limiter keyed by user and action.

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private capacity: number, private refillPerSec: number) {}

  /** Returns true if the action is allowed (and spends a token). */
  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    if (b.tokens < 1) { this.buckets.set(key, b); return false; }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }
}

export const limits = {
  chat: new RateLimiter(5, 0.6),        // bursts of 5, then one every ~1.7 s
  guestbook: new RateLimiter(2, 1 / 30), // two notes, then one every 30 s
  move: new RateLimiter(12, 6),
  edit: new RateLimiter(30, 8),
  social: new RateLimiter(6, 0.2),      // friend requests, reports, blocks
  any: new RateLimiter(60, 25),         // overall per-connection message cap
  auth: new RateLimiter(8, 0.1),        // per IP
};

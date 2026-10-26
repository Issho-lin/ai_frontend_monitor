/**
 * Minimal fixed-window rate limiter (in-memory).
 * Default: 120 requests / 60s per key (projectId + client IP).
 */
export class SimpleRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = Number(process.env.INGEST_RATE_LIMIT ?? 120),
    private readonly windowMs = Number(process.env.INGEST_RATE_WINDOW_MS ?? 60_000),
  ) {}

  /** Returns true when the request is allowed. */
  allow(key: string): boolean {
    const now = Date.now();
    let entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }

    entry.count += 1;

    // Opportunistic prune to avoid unbounded growth.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.resetAt <= now) this.hits.delete(k);
      }
    }

    return entry.count <= this.limit;
  }
}

/**
 * In-memory fixed-window rate limiter. Single-process only, which is fine for a
 * self-hosted single-container portal. Resets on restart by design.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  existing.count += 1;
  return { ok: existing.count <= limit, remaining: Math.max(0, limit - existing.count) };
}

/**
 * Best-effort client IP. Behind Pangolin the real address arrives in
 * x-forwarded-for; the left-most entry is the original client.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Opportunistic cleanup so the map can't grow without bound over long uptimes. */
setInterval(
  () => {
    const now = Date.now();
    for (const [key, w] of windows) {
      if (now >= w.resetAt) windows.delete(key);
    }
  },
  10 * 60_000
).unref?.();

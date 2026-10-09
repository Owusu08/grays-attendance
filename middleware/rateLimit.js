// middleware/rateLimit.js — tiny in-memory limiter (single process; no dependency).
function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60 * 1000);
  sweep.unref();

  const live = (key) => {
    const e = hits.get(key);
    if (e && e.resetAt > Date.now()) return e;
    hits.delete(key);
    return null;
  };

  return {
    isBlocked: (key) => { const e = live(key); return !!e && e.count >= max; },
    hit(key) {
      const e = live(key);
      if (e) e.count += 1;
      else hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    clear: (key) => hits.delete(key)
  };
}

// Express middleware that counts EVERY request. keyFn(req) -> string.
function limitRequests({ windowMs, max, keyFn, message }) {
  const limiter = createLimiter({ windowMs, max });
  return (req, res, next) => {
    const key = keyFn(req);
    if (limiter.isBlocked(key)) {
      return res.status(429).json({ error: message || 'Too many attempts. Please wait a few minutes and try again.' });
    }
    limiter.hit(key);
    next();
  };
}

module.exports = { createLimiter, limitRequests };

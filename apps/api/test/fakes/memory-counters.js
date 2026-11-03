/**
 * In-memory stand-in for the Redis commands the login throttle uses.
 *
 * @returns {import('../../src/features/auth/login-throttle.js').CounterStore}
 */
export function createMemoryCounters() {
  /** @type {Map<string, { value: number, expiresAt: number | null }>} */
  const entries = new Map();
  /** @param {string} key */
  const live = (key) => {
    const entry = entries.get(key);
    if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async incr(key) {
      const entry = live(key) ?? { value: 0, expiresAt: null };
      entry.value += 1;
      entries.set(key, entry);
      return entry.value;
    },
    async expire(key, seconds) {
      const entry = live(key);
      if (entry) entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    async get(key) {
      const entry = live(key);
      return entry ? String(entry.value) : null;
    },
    async ttl(key) {
      const entry = live(key);
      if (!entry) return -2;
      return entry.expiresAt ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : -1;
    },
    async del(key) {
      return entries.delete(key) ? 1 : 0;
    },
  };
}

import { LOCKOUT_SECONDS, MAX_FAILED_ATTEMPTS } from './auth.constants.js';

/**
 * @typedef {object} CounterStore Subset of the ioredis API used here (also easy to fake in tests).
 * @property {(key: string) => Promise<number>} incr
 * @property {(key: string, seconds: number) => Promise<unknown>} expire
 * @property {(key: string) => Promise<string | null>} get
 * @property {(key: string) => Promise<number>} ttl
 * @property {(key: string) => Promise<unknown>} del
 */

/**
 * Counts consecutive failures per subject (a username or an approver) and locks it after
 * MAX_FAILED_ATTEMPTS for LOCKOUT_SECONDS. The window starts at the first failure.
 *
 * @param {CounterStore} store
 * @param {string} prefix e.g. `auth:login`
 * @returns The throttle.
 */
export function createLoginThrottle(store, prefix) {
  /**
   * @param {string} subject
   * @returns {string}
   */
  const keyFor = (subject) => `${prefix}:${subject.toLowerCase()}`;

  return {
    /**
     * @param {string} subject
     * @returns {Promise<number | null>} Seconds until unlocked, or null when not locked.
     */
    async lockedFor(subject) {
      const key = keyFor(subject);
      const failures = Number((await store.get(key)) ?? 0);
      if (failures < MAX_FAILED_ATTEMPTS) return null;
      const ttl = await store.ttl(key);
      return ttl > 0 ? ttl : LOCKOUT_SECONDS;
    },

    /**
     * @param {string} subject
     * @returns {Promise<number>} Failures so far in the window.
     */
    async recordFailure(subject) {
      const key = keyFor(subject);
      const failures = await store.incr(key);
      if (failures === 1) await store.expire(key, LOCKOUT_SECONDS);
      return failures;
    },

    /** @param {string} subject */
    async reset(subject) {
      await store.del(keyFor(subject));
    },
  };
}

/** @typedef {ReturnType<typeof createLoginThrottle>} LoginThrottle */

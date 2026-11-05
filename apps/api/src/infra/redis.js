import { Redis } from 'ioredis';

/**
 * @param {string} url
 * @param {import('pino').Logger} logger
 * @returns {Redis}
 */
export function createRedis(url, logger) {
  const redis = new Redis(url, {
    lazyConnect: true,
    // Fail commands quickly while Redis is down instead of queueing them forever.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  redis.on('error', (error) => logger.warn({ err: error }, 'Redis connection error'));
  return redis;
}

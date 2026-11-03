import { Queue, Worker } from 'bullmq';

/**
 * Background jobs run on BullMQ. Nothing is enqueued yet: features add their queue names here when they need one.
 */
export const QUEUE_NAMES = Object.freeze({});

/**
 * BullMQ needs its own connection settings (it blocks on commands), so it gets the URL rather than a shared client.
 *
 * @param {string} name
 * @param {string} redisUrl
 * @returns {Queue}
 */
export function createQueue(name, redisUrl) {
  return new Queue(name, { connection: { url: redisUrl } });
}

/**
 * @param {string} name
 * @param {import('bullmq').Processor} processor
 * @param {string} redisUrl
 * @returns {Worker}
 */
export function createWorker(name, processor, redisUrl) {
  return new Worker(name, processor, { connection: { url: redisUrl, maxRetriesPerRequest: null } });
}

import { createPrismaClient } from '@ihealth/db';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createRedis } from './infra/redis.js';
import { createLogger } from './lib/logger.js';
import { routes } from './routes.js';

const SHUTDOWN_GRACE_MS = 10_000;

const config = loadConfig(process.env);
const logger = createLogger({ level: config.logLevel, pretty: config.env === 'development' });
const prisma = createPrismaClient({ url: config.databaseUrl });
const redis = createRedis(config.redisUrl, logger);

try {
  await redis.connect();
} catch (error) {
  // The API can still start: /health/ready reports Redis as down until it reconnects.
  logger.warn({ err: error }, 'Redis is not reachable at startup');
}

const app = createApp({ config, logger, prisma, redis, routes });
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'API listening');
});

/**
 * @param {string} signal
 */
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
  forceExit.unref();
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

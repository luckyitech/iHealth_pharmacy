import { createPrismaClient } from '#db';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createMailer } from './infra/mailer.js';
import { createRedis } from './infra/redis.js';
import { createLogger } from './lib/logger.js';
import { createAppInfoRoutes } from './features/app-info/app-info.routes.js';
import { createAuditLog } from './features/audit/audit-log.js';
import { createAuthModule } from './features/auth/auth.module.js';
import { createLookupRoutes } from './features/lookups/lookup-routes.js';
import { createItemLookupRoutes } from './features/masters/item-lookups.js';
import { createHospitalRoutes } from './features/masters/hospitals.js';
import { createManufacturerRoutes } from './features/masters/manufacturers.js';
import { createPharmacyProfileRoutes } from './features/masters/pharmacy-profile.js';
import { createProviderRoutes } from './features/masters/providers.js';
import { createTermsRoutes } from './features/masters/terms.js';
import { collectRoutes } from './routes.js';

const SHUTDOWN_GRACE_MS = 10_000;

const config = loadConfig(process.env);
const logger = createLogger({ level: config.logLevel, pretty: config.env === 'development' });
const prisma = createPrismaClient({ url: config.databaseUrl, timezone: config.region.dbTimeZone });
const redis = createRedis(config.redisUrl, logger);

try {
  await redis.connect();
} catch (error) {
  // The API can still start: /health/ready reports Redis as down until it reconnects.
  logger.warn({ err: error }, 'Redis is not reachable at startup');
}

const audit = createAuditLog(prisma, logger);
const auth = createAuthModule({
  audit,
  config,
  prisma,
  counters: redis,
  redis,
  logger,
  mailer: createMailer(config.mail),
});
const app = createApp({
  config,
  logger,
  prisma,
  redis,
  routes: collectRoutes({
    auth,
    appInfo: { routes: createAppInfoRoutes({ prisma, config }) },
    lookups: { routes: createLookupRoutes({ prisma }) },
    masters: {
      routes: [
        ...createPharmacyProfileRoutes({ prisma, audit, config }),
        ...createItemLookupRoutes({ prisma, audit }),
        ...createManufacturerRoutes({ prisma, audit }),
        ...createHospitalRoutes({ prisma, audit }),
        ...createProviderRoutes({ prisma, audit }),
        ...createTermsRoutes({ prisma, audit }),
      ],
    },
  }),
  guards: auth.guards,
  apiRateLimit: auth.apiRateLimit,
});
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

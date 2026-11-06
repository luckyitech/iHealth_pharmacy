import { createPrismaClient, missingAdditiveTables } from '#db';

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
import { createCustomerRoutes } from './features/masters/customers.js';
import { createEmployeeAccessRoutes } from './features/masters/employee-access.js';
import { createEmployeeRoutes } from './features/masters/employees.js';
import { createHospitalRoutes } from './features/masters/hospitals.js';
import { createItemSupplierRoutes } from './features/masters/item-suppliers.js';
import { createItemRoutes } from './features/masters/items.js';
import { createMedicineTypeRoutes } from './features/masters/medicine-types.js';
import { createSalesSettingsRoutes } from './features/masters/sales-settings.routes.js';
import { createManufacturerRoutes } from './features/masters/manufacturers.js';
import { createPharmacyProfileRoutes } from './features/masters/pharmacy-profile.js';
import { createProviderRoutes } from './features/masters/providers.js';
import { createSupplierRoutes } from './features/masters/suppliers.js';
import { createTermsRoutes } from './features/masters/terms.js';
import { createSalesBillRoutes } from './features/sales/bills.routes.js';
import { createControlledRegisterRoutes } from './features/sales/controlled-register.routes.js';
import { createLabelRoutes } from './features/sales/labels.routes.js';
import { createReturnRoutes } from './features/sales/returns.routes.js';
import { createCreditNoteRoutes } from './features/sales/credit-notes.routes.js';
import { createPrescriberRoutes } from './features/sales/prescribers.js';
import { createSaleQuoteRoutes } from './features/sales/quote.routes.js';
import { createTillRoutes } from './features/sales/till.routes.js';
import { createApprovalRoutes } from './features/sales/approvals.routes.js';
import { collectRoutes } from './routes.js';

const SHUTDOWN_GRACE_MS = 10_000;

const config = loadConfig(process.env);
const logger = createLogger({ level: config.logLevel, pretty: config.env === 'development' });
const prisma = createPrismaClient({ url: config.databaseUrl, timezone: config.region.dbTimeZone });
const redis = createRedis(config.redisUrl, logger);

const missingTables = await missingAdditiveTables(prisma);
if (missingTables.length) {
  // Without them sign-in and other features fail on every request; say so once, clearly.
  logger.fatal(
    { missingTables },
    'Database tables are missing. Apply the additive SQL first (development: npm run db:additive)',
  );
  process.exit(1);
}

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
    lookups: { routes: createLookupRoutes({ prisma, config }) },
    masters: {
      routes: [
        ...createPharmacyProfileRoutes({ prisma, audit, config }),
        ...createItemLookupRoutes({ prisma, audit }),
        ...createMedicineTypeRoutes({ prisma, audit }),
        ...createSalesSettingsRoutes({ prisma, audit, config }),
        ...createItemRoutes({ prisma, audit, config }),
        ...createManufacturerRoutes({ prisma, audit }),
        ...createSupplierRoutes({ prisma, audit }),
        ...createItemSupplierRoutes({ prisma, audit }),
        ...createCustomerRoutes({ prisma, audit, config }),
        ...createEmployeeRoutes({ prisma, audit, config }),
        ...createEmployeeAccessRoutes({ prisma, accountAdmin: auth.accountAdmin, config }),
        ...createHospitalRoutes({ prisma, audit }),
        ...createProviderRoutes({ prisma, audit }),
        ...createTermsRoutes({ prisma, audit }),
      ],
    },
    sales: {
      routes: [
        ...createSalesBillRoutes({ prisma, audit, config }),
        ...createSaleQuoteRoutes({ prisma, config }),
        ...createTillRoutes({ prisma, audit, config }),
        ...createPrescriberRoutes({ prisma, audit, config }),
        ...createControlledRegisterRoutes({ prisma, audit, config }),
        ...createLabelRoutes({ prisma, audit, config }),
        ...createReturnRoutes({ prisma, audit, config }),
        ...createCreditNoteRoutes({ prisma, config }),
        ...createApprovalRoutes({ prisma, audit, config }),
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

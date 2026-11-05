import { apiReference } from '@scalar/express-api-reference';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { createHealthRouter } from './features/health/health.router.js';
import { mountRoutes } from './http/mount-routes.js';
import { API_PREFIX, buildOpenApiDocument } from './http/openapi.js';
import { getRequestId, requestContext } from './lib/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const JSON_BODY_LIMIT = '1mb';
const DOCS_PATH = '/api/docs';
const DOCS_CDN_ORIGIN = 'https://cdn.jsdelivr.net'; // hardcode-ok: where the Scalar docs UI is published
const CLIENT_ERROR_STATUS = 400;
const SERVER_ERROR_STATUS = 500;

/**
 * @typedef {object} AppDependencies
 * @property {Readonly<import('./config/env.js').Config>} config
 * @property {import('pino').Logger} logger
 * @property {import('#db').PrismaClient} prisma
 * @property {{ ping: () => Promise<unknown> }} redis
 * @property {readonly ReturnType<typeof import('./http/define-route.js').defineRoute>[]} [routes]
 * @property {import('./http/mount-routes.js').MountOptions['guards']} [guards]
 * @property {import('express').RequestHandler} [apiRateLimit] Applied to every /api/v1 request.
 */

/**
 * @param {readonly string[]} allowList
 * @returns {import('cors').CorsOptions}
 */
function corsOptions(allowList) {
  return {
    credentials: true,
    origin(origin, callback) {
      // Requests without an Origin header (curl, server-to-server, same-origin GET) are not CORS requests.
      callback(null, !origin || allowList.includes(origin));
    },
  };
}

/**
 * Builds the Express app. Every dependency is passed in, so tests can run it without real services.
 *
 * @param {AppDependencies} deps
 * @returns {import('express').Express}
 */
export function createApp({ config, logger, prisma, redis, routes = [], guards, apiRateLimit }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestContext());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => getRequestId() ?? String(req.id),
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= SERVER_ERROR_STATUS) return 'error';
        if (res.statusCode >= CLIENT_ERROR_STATUS) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    }),
  );

  if (!config.isProduction) {
    // The docs page loads its UI from a CDN, so it gets its own, looser CSP and is mounted before the strict one.
    app.use(
      DOCS_PATH,
      helmet({
        contentSecurityPolicy: {
          directives: {
            scriptSrc: ["'self'", "'unsafe-inline'", DOCS_CDN_ORIGIN],
            connectSrc: ["'self'", DOCS_CDN_ORIGIN],
          },
        },
      }),
      apiReference({ url: `${API_PREFIX}/openapi.json`, pageTitle: 'iHealth Pharmacy API' }),
    );
  }

  app.use(helmet());
  app.use(cors(corsOptions(config.corsOrigins)));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/health', createHealthRouter({ prisma, redis }));

  const openApiDocument = buildOpenApiDocument(routes);
  app.get(`${API_PREFIX}/openapi.json`, (_req, res) => {
    res.json(openApiDocument);
  });
  if (apiRateLimit) app.use(API_PREFIX, apiRateLimit);
  app.use(API_PREFIX, mountRoutes(routes, { guards, validateResponses: !config.isProduction }));

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}

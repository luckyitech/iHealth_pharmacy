import { toErrorDetails } from '@ihealth/shared/errors';
import { Router } from 'express';

import { validationFailed } from '../lib/errors.js';

/** @typedef {ReturnType<typeof import('./define-route.js').defineRoute>} Route */

const NO_CONTENT = 204;

/**
 * @param {import('zod').ZodType | undefined} schema
 * @param {unknown} value
 * @param {string} location
 * @returns {unknown}
 */
function parsePart(schema, value, location) {
  if (!schema) return value;
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  throw validationFailed(
    toErrorDetails(result.error).map((detail) => ({
      ...detail,
      path: detail.path ? `${location}.${detail.path}` : location,
    })),
  );
}

/**
 * @param {Route} route
 * @returns {import('express').RequestHandler}
 */
function validateRequest(route) {
  return (req, res, next) => {
    // Express 5 makes req.query read-only, so validated input lives on res.locals.input.
    res.locals.input = {
      params: parsePart(route.request?.params, req.params, 'params'),
      query: parsePart(route.request?.query, req.query, 'query'),
      body: parsePart(route.request?.body, req.body, 'body'),
    };
    next();
  };
}

/**
 * @param {Route} route
 * @param {boolean} validateResponses
 * @returns {import('express').RequestHandler}
 */
function runHandler(route, validateResponses) {
  return async (req, res) => {
    const body = await route.handler({ req, res, input: res.locals.input });
    if (res.headersSent) return;
    if (route.successStatus === NO_CONTENT || body === undefined) {
      res.status(route.successStatus).end();
      return;
    }
    const schema = route.responses[route.successStatus]?.schema;
    if (validateResponses && schema) {
      // Outside production, a handler returning something its documented schema does not allow is a bug.
      const check = schema.safeParse(body);
      if (!check.success) {
        throw new Error(
          `Response of ${route.method.toUpperCase()} ${route.path} does not match its schema`,
          {
            cause: check.error,
          },
        );
      }
    }
    res.status(route.successStatus).json(body);
  };
}

/**
 * @typedef {object} MountOptions
 * @property {(route: Route) => import('express').RequestHandler[]} [guards] Auth, CSRF and permission middleware per route.
 * @property {boolean} [validateResponses]
 */

/**
 * @param {readonly Route[]} routes
 * @param {MountOptions} [options]
 * @returns {import('express').Router}
 */
export function mountRoutes(routes, { guards = () => [], validateResponses = false } = {}) {
  const router = Router();
  for (const route of routes) {
    router[route.method](
      route.path,
      ...guards(route),
      validateRequest(route),
      runHandler(route, validateResponses),
    );
  }
  return router;
}

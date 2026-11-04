/**
 * @typedef {'get' | 'post' | 'put' | 'patch' | 'delete'} HttpMethod
 * @typedef {'public' | 'authenticated'} RouteAccess
 */

/* eslint-disable jsdoc/reject-any-type -- each route's Zod schemas give its input its real shape */
/**
 * @typedef {object} RouteInput
 * @property {any} params
 * @property {any} query
 * @property {any} body
 */
/* eslint-enable jsdoc/reject-any-type */

/**
 * @typedef {object} RouteContext
 * @property {import('express').Request} req
 * @property {import('express').Response} res
 * @property {RouteInput} input Validated (and transformed) params, query and body.
 */

/**
 * @typedef {object} RouteResponse
 * @property {string} description
 * @property {import('zod').ZodType} [schema] Response body schema. Omit for empty responses (204).
 */

/**
 * @typedef {object} RouteDefinition
 * @property {HttpMethod} method
 * @property {string} path Express path relative to /api/v1, e.g. `/employees/:id`.
 * @property {string} summary One line for the API docs.
 * @property {string} [description]
 * @property {string[]} tags
 * @property {RouteAccess} [access] Defaults to `authenticated`: routes are private unless opened explicitly.
 * @property {ReadonlyArray<import('@ihealth/shared/permissions').PermissionDefinition>} [permissions] Any one of them is enough (see POLICIES in the shared package).
 * @property {boolean} [csrf] Set to false only for endpoints that cannot carry a CSRF token (e.g. login).
 * @property {import('express').RequestHandler[]} [before] Extra middleware run after the guards (e.g. rate limits).
 * @property {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} [request]
 * @property {Record<number, RouteResponse>} responses The first 2xx entry is the success status.
 * @property {(context: RouteContext) => Promise<unknown> | unknown} handler Returns the response body.
 */

const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;

/**
 * Declares an API route once: validation, access rules, OpenAPI documentation and handler.
 * The route is only data; `mountRoutes()` turns it into Express middleware.
 *
 * @param {RouteDefinition} definition
 * @returns {Readonly<RouteDefinition & { successStatus: number }>}
 */
export function defineRoute(definition) {
  const successStatus = Object.keys(definition.responses)
    .map(Number)
    .find((status) => status >= SUCCESS_MIN && status <= SUCCESS_MAX);
  if (!successStatus)
    throw new Error(`Route ${definition.method} ${definition.path} declares no 2xx response`);
  return Object.freeze({
    access: 'authenticated',
    csrf: true,
    permissions: [],
    before: [],
    ...definition,
    successStatus,
  });
}

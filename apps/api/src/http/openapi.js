import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { errorResponseSchema } from '@ihealth/shared/errors';

/** @typedef {ReturnType<typeof import('./define-route.js').defineRoute>} Route */

export const API_PREFIX = '/api/v1';

/**
 * `/employees/:id` -> `/employees/{id}`
 *
 * @param {string} path
 * @returns {string}
 */
const toOpenApiPath = (path) => path.replace(/:(\w+)/g, '{$1}');

/**
 * Builds the OpenAPI 3.1 document from the route definitions, so docs and code cannot drift apart.
 *
 * @param {readonly Route[]} routes
 * @returns {ReturnType<OpenApiGeneratorV31['generateDocument']>}
 */
export function buildOpenApiDocument(routes) {
  const registry = new OpenAPIRegistry();
  // Schemas are inlined rather than registered as named components: registering needs Zod's `.openapi()`
  // extension, which Zod 4 only adds to schemas created after it runs (shared schemas exist before that).
  registry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: 'ihealth_access',
    description: 'Short-lived access token, set by POST /auth/login.',
  });

  for (const route of routes) {
    /** @type {Record<string, import('@asteasolutions/zod-to-openapi').ResponseConfig>} */
    const responses = {};
    for (const [status, response] of Object.entries(route.responses)) {
      responses[status] = response.schema
        ? {
            description: response.description,
            content: { 'application/json': { schema: response.schema } },
          }
        : { description: response.description };
    }
    responses.default = {
      description: 'Error',
      content: { 'application/json': { schema: errorResponseSchema } },
    };
    registry.registerPath({
      method: route.method,
      path: `${API_PREFIX}${toOpenApiPath(route.path)}`,
      summary: route.summary,
      description: [
        route.description,
        route.permissions?.length
          ? `Requires permission: ${route.permissions.map((permission) => `${permission.group} / ${permission.name}`).join(', ')}.`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n'),
      tags: route.tags,
      security: route.access === 'public' ? [] : [{ sessionCookie: [] }],
      request: {
        ...(route.request?.params
          ? { params: /** @type {import('zod').ZodObject} */ (route.request.params) }
          : {}),
        ...(route.request?.query
          ? { query: /** @type {import('zod').ZodObject} */ (route.request.query) }
          : {}),
        ...(route.request?.body
          ? { body: { content: { 'application/json': { schema: route.request.body } } } }
          : {}),
      },
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'iHealth Pharmacy API',
      version: '1.0.0',
      description:
        'REST API of the iHealth Pharmacy system. Amounts are decimal strings in the currency and times in the time zone given by GET /api/v1/app-info.',
    },
    servers: [{ url: '/' }],
  });
}

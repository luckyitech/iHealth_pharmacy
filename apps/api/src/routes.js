/** @typedef {ReturnType<typeof import('./http/define-route.js').defineRoute>} Route */

/**
 * Every API route, in one place. Each feature module contributes its route list.
 *
 * @param {Record<string, { routes: readonly Route[] }>} modules
 * @returns {readonly Route[]}
 */
export function collectRoutes(modules) {
  return Object.freeze(Object.values(modules).flatMap((module) => module.routes));
}

/** @typedef {ReturnType<typeof import('./http/define-route.js').defineRoute>} Route */

/**
 * Every API route, in one place. Each feature module contributes its route list.
 *
 * @param {{ auth: { routes: readonly Route[] } }} modules
 * @returns {readonly Route[]}
 */
export function collectRoutes({ auth }) {
  return Object.freeze([...auth.routes]);
}

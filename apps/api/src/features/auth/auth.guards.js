import { ERROR_CODES } from '@ihealth/shared/errors';

import { AppError } from '../../lib/errors.js';
import { getRequestContext } from '../../lib/request-context.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { AUDIT_ACTIONS, COOKIES } from './auth.constants.js';
import { isExpiredTokenError } from './tokens.js';

/**
 * @typedef {object} AuthState Set on `res.locals.auth` for authenticated requests.
 * @property {number} employeeId
 * @property {number} credentialsId
 * @property {string} familyId
 * @property {ReadonlySet<number>} permissionIds Effective permissions, loaded for this request.
 */

/**
 * @param {import('express').Response} res
 * @returns {AuthState}
 */
export function getAuth(res) {
  const auth = res.locals.auth;
  if (!auth) throw new AppError(ERROR_CODES.UNAUTHENTICATED);
  return auth;
}

/**
 * Builds the per-route middleware chain: authentication, CSRF check, permission check.
 * Permissions are re-read from the database on every request, so revoking access applies immediately.
 *
 * @param {object} deps
 * @param {ReturnType<typeof import('./tokens.js').createAccessTokens>} deps.accessTokens
 * @param {import('./auth.repository.js').AuthRepository} deps.repository
 * @param {import('./csrf.js').Csrf} deps.csrf
 * @param {import('../audit/audit-log.js').AuditLog} deps.audit
 * @returns {(route: ReturnType<typeof import('../../http/define-route.js').defineRoute>) => import('express').RequestHandler[]}
 */
export function createAuthGuards({ accessTokens, repository, csrf, audit }) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {Promise<void>}
   */
  const authenticate = async (req, res, next) => {
    const token = req.cookies?.[COOKIES.ACCESS];
    if (!token) throw new AppError(ERROR_CODES.UNAUTHENTICATED);
    let claims;
    try {
      claims = await accessTokens.verify(token);
    } catch (error) {
      throw new AppError(
        isExpiredTokenError(error) ? ERROR_CODES.SESSION_EXPIRED : ERROR_CODES.UNAUTHENTICATED,
        {
          cause: error,
        },
      );
    }
    const permissionIds = new Set(await repository.findEffectivePermissionIds(claims.employeeId));
    /** @type {AuthState} */
    const auth = { ...claims, permissionIds };
    res.locals.auth = auth;
    const context = getRequestContext();
    if (context) context.employeeId = claims.employeeId;
    next();
  };

  /**
   * @param {readonly import('@ihealth/shared/permissions').PermissionDefinition[]} required
   * @returns {import('express').RequestHandler}
   */
  const requirePermissions = (required) => async (req, res, next) => {
    const auth = getAuth(res);
    if (required.some((permission) => auth.permissionIds.has(permission.id))) {
      next();
      return;
    }
    await audit.record({
      action: AUDIT_ACTIONS.PERMISSION_DENIED,
      outcome: AUDIT_OUTCOMES.DENIED,
      resourceType: 'route',
      resourceId: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
      details: { anyOf: required.map((permission) => permission.id) },
      ipAddress: req.ip,
    });
    throw new AppError(ERROR_CODES.FORBIDDEN);
  };

  return (route) => {
    if (route.access === 'public') return [];
    /** @type {import('express').RequestHandler[]} */
    const chain = [authenticate];
    if (route.csrf !== false) chain.push(csrf.protect);
    if (route.permissions?.length) chain.push(requirePermissions(route.permissions));
    return chain;
  };
}

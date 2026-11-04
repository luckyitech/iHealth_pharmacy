import { changePasswordBodySchema } from '@ihealth/shared/schemas';

import { defineRoute } from '../../http/define-route.js';
import { COOKIES } from './auth.constants.js';
import { getAuth } from './auth.guards.js';
import {
  approvalPinBodySchema,
  approvalPinResponseSchema,
  csrfResponseSchema,
  currentUserResponseSchema,
  forgotPasswordBodySchema,
  forgotPasswordResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  resetPasswordBodySchema,
} from './auth.schemas.js';
import { clearSessionCookies, setSessionCookies } from './session-cookies.js';

const TAGS = ['Auth'];

export const FORGOT_PASSWORD_MESSAGE =
  'If that account exists and has a work email, we have sent it a reset link. It expires in 30 minutes.';

/**
 * @param {import('express').Request} req
 * @returns {import('./auth.service.js').ClientInfo}
 */
const clientInfo = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

/**
 * @param {object} deps
 * @param {import('./auth.service.js').AuthService} deps.service
 * @param {import('./csrf.js').Csrf} deps.csrf
 * @param {boolean} deps.secureCookies
 * @param {{ login: import('express').RequestHandler, approvalPin: import('express').RequestHandler, passwordReset: import('express').RequestHandler }} deps.limiters
 * @returns The auth route definitions.
 */
export function createAuthRoutes({ service, csrf, secureCookies, limiters }) {
  /**
   * Binds a fresh CSRF token to the sign-in the response is creating or renewing.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} familyId
   * @returns {string}
   */
  const issueCsrf = (req, res, familyId) => {
    // The session cookie is only set on this response, so the request does not carry it yet.
    req.cookies = { ...req.cookies, [COOKIES.SESSION]: familyId };
    return csrf.issue(req, res);
  };

  return [
    defineRoute({
      method: 'post',
      path: '/auth/login',
      summary: 'Sign in with username or work email, and password',
      description:
        'Sets the session cookies and returns the signed-in user with a CSRF token. Five failed attempts lock the username for 15 minutes.',
      tags: TAGS,
      access: 'public',
      // There is no session yet to bind a token to. SameSite=Strict cookies and the CORS allow-list cover login.
      csrf: false,
      before: [limiters.login],
      request: { body: loginBodySchema },
      responses: { 200: { description: 'Signed in', schema: loginResponseSchema } },
      handler: async ({ req, res, input }) => {
        const session = await service.login(input.body, clientInfo(req));
        setSessionCookies(res, session, secureCookies);
        const user = await service.currentUser(session.employeeId, session.credentialsId);
        return { data: { user, csrfToken: issueCsrf(req, res, session.familyId) } };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/forgot-password',
      summary: 'Email a password reset link',
      description:
        'Always answers the same way, whether or not the account exists or has a work email, so it cannot be used to discover accounts. The link expires in 30 minutes.',
      tags: TAGS,
      access: 'public',
      csrf: false,
      before: [limiters.passwordReset],
      request: { body: forgotPasswordBodySchema },
      responses: { 200: { description: 'Request accepted', schema: forgotPasswordResponseSchema } },
      handler: async ({ req, input }) => {
        await service.requestPasswordReset(input.body, clientInfo(req));
        return { data: { message: FORGOT_PASSWORD_MESSAGE } };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/reset-password',
      summary: 'Choose a new password with an emailed reset link',
      description: 'Ends every existing sign-in of the account. The link cannot be used twice.',
      tags: TAGS,
      access: 'public',
      csrf: false,
      before: [limiters.passwordReset],
      request: { body: resetPasswordBodySchema },
      responses: { 204: { description: 'Password changed' } },
      handler: async ({ req, input }) => {
        await service.resetPassword(input.body, clientInfo(req));
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/refresh',
      summary: 'Renew the session',
      description:
        'Rotates the refresh token cookie and issues a new access token. Reusing an old refresh token ends the session.',
      tags: TAGS,
      access: 'public',
      // Authenticated by the refresh cookie, which is SameSite=Strict and only sent to /api/v1/auth.
      csrf: false,
      before: [limiters.login],
      responses: { 200: { description: 'Session renewed', schema: csrfResponseSchema } },
      handler: async ({ req, res }) => {
        try {
          const session = await service.refresh(req.cookies?.[COOKIES.REFRESH], clientInfo(req));
          setSessionCookies(res, session, secureCookies);
          return { data: { csrfToken: issueCsrf(req, res, session.familyId) } };
        } catch (error) {
          clearSessionCookies(res, secureCookies);
          throw error;
        }
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/logout',
      allowWhilePasswordChangeRequired: true,
      summary: 'Sign out',
      description: 'Revokes every refresh token of this sign-in and clears the cookies.',
      tags: TAGS,
      responses: { 204: { description: 'Signed out' } },
      handler: async ({ req, res }) => {
        await service.logout(getAuth(res), clientInfo(req));
        clearSessionCookies(res, secureCookies);
      },
    }),

    defineRoute({
      method: 'get',
      path: '/auth/me',
      allowWhilePasswordChangeRequired: true,
      summary: 'The signed-in user, with roles and effective permissions',
      tags: TAGS,
      responses: { 200: { description: 'Current user', schema: currentUserResponseSchema } },
      handler: async ({ res }) => {
        const auth = getAuth(res);
        return { data: await service.currentUser(auth.employeeId, auth.credentialsId) };
      },
    }),

    defineRoute({
      method: 'get',
      path: '/auth/csrf',
      allowWhilePasswordChangeRequired: true,
      summary: 'A fresh CSRF token for this session',
      description:
        'For a page reload: the token is kept in memory only, so the app asks for a new one.',
      tags: TAGS,
      responses: { 200: { description: 'CSRF token', schema: csrfResponseSchema } },
      handler: ({ req, res }) => ({
        data: { csrfToken: issueCsrf(req, res, getAuth(res).familyId) },
      }),
    }),

    defineRoute({
      method: 'post',
      path: '/auth/change-password',
      summary: 'Change your own password',
      description:
        'Needs the current password. Signs out every other session of the account and renews this one. Also how a password change required by an administrator is done.',
      tags: TAGS,
      allowWhilePasswordChangeRequired: true,
      before: [limiters.login],
      request: { body: changePasswordBodySchema },
      responses: { 200: { description: 'Password changed', schema: csrfResponseSchema } },
      handler: async ({ req, res, input }) => {
        const auth = getAuth(res);
        const session = await service.changePassword(
          { employeeId: auth.employeeId, credentialsId: auth.credentialsId, ...input.body },
          clientInfo(req),
        );
        setSessionCookies(res, session, secureCookies);
        return { data: { csrfToken: issueCsrf(req, res, session.familyId) } };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/auth/approval-pin/verify',
      summary: "Verify an approver's PIN",
      description:
        'Used before actions that need a supervisor (sales returns, credit notes, ...). Five wrong PINs lock the approver for 15 minutes. Every attempt is audited.',
      tags: TAGS,
      before: [limiters.approvalPin],
      request: { body: approvalPinBodySchema },
      responses: { 200: { description: 'PIN accepted', schema: approvalPinResponseSchema } },
      handler: async ({ req, input }) => ({
        data: await service.verifyApprovalPin(input.body, clientInfo(req)),
      }),
    }),
  ];
}

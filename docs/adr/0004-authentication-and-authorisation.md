# 0004. Authentication and authorisation

- Status: Accepted
- Date: 2026-11-03

## Context

The system handles sensitive health data. Legacy passwords are stored as BCrypt hashes and, for some accounts, in plain text.
Permissions are modelled by the legacy roles, `employee_pharmacy_role`, `pharma_access` and `employee_access` tables.

## Decision

- **Tokens:** short-lived JWT access tokens (15 minutes) and rotating refresh tokens, both in `httpOnly`, `Secure`, `SameSite` cookies, signed with `jose`.
  Refresh tokens are stored hashed in an additive table. When a refresh token is reused, its whole token family is revoked.
- **Passwords:** argon2id (`@node-rs/argon2`). At login, legacy BCrypt (`bcryptjs`) or plain-text credentials are verified once, re-hashed with argon2id and stored in an additive table. Legacy password columns are never written.
- **CSRF:** a double-submit token (`csrf-csrf`) on every state-changing request, because auth uses cookies.
- **Brute force:** rate limiting (`express-rate-limit` with a Redis store), plus account lockout after 5 failed attempts for 15 minutes.
- **Permissions:** permission constants in `packages/shared` map one-to-one to the legacy `pharma_access` names.
  A user's effective permissions are the permissions of their roles (legacy roles and `employee_pharmacy_role`, plus the additive `role_permissions` table), combined with their individual `employee_access` grants.
  Every endpoint enforces them on the server with `requirePermission()`. The UI only hides what the user cannot use.
- **Approvals:** sensitive actions can require an approval PIN, verified by a dedicated endpoint.
- **Audit:** logins, permission denials and access to patient or medical records are written to an additive audit table.

## Consequences

- Users keep their passwords. Hashes are upgraded silently as people sign in.
- Accounts still on plain-text or BCrypt credentials can be reported and, if needed, forced to reset.
- The browser never sees tokens directly, which removes token theft through XSS.

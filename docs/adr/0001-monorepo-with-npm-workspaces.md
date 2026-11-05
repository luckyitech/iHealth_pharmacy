# 0001. Monorepo with npm workspaces and Turborepo

- Status: Accepted
- Date: 2026-11-03

## Context

The legacy system keeps its frontend and backend in separate projects that share no code, so validation rules and constants drift apart.
The rebuild has a web app, an API and code that both need (validation schemas, permission names, error codes, money helpers).

## Decision

- One repository with npm workspaces: `apps/web`, `apps/api`, `packages/shared`, `packages/db` and `packages/config`.
- Turborepo orchestrates `build`, `test` and `dev` across workspaces, with caching.
- npm is the only package manager. pnpm and yarn are not used.
- The runtime is Node.js 24 LTS, pinned in `.nvmrc`, in `engines` and in CI.
  The original plan named Node 22. We moved to 24 because it is the current Active LTS line and is already installed on the development machine.

## Consequences

- One install, one lockfile, one CI pipeline. A shared change and its consumers land in the same pull request.
- Lint, format and typecheck run once at the root, from a single shared config in `packages/config`.
- Contributors need Node 24 and npm 11. `engine-strict` in `.npmrc` stops installs on other versions.

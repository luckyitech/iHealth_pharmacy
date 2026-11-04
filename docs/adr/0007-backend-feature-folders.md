# 0007. Backend organised by feature folders

- Status: Accepted
- Date: 2026-11-04

## Context

On 2026-11-04 the project owner compared two ways to organise the API code:

- **layer-first**: top-level `controllers/`, `services/`, `repositories/`, `models/` folders, each holding every feature;
- **feature-first**: one folder per feature, holding that feature's controller, service and repository together.

They chose to keep the feature-first layout already in use.

## Decision

- The API code lives in `apps/api/src/features/<feature>/`. Each folder holds the feature's routes (the
  controller, `*.routes.js`), its business rules (`*.service.js`) and its data access (`*.repository.js`),
  plus anything only that feature uses.
- The models stay in one place, `apps/api/db/prisma/schema.prisma`, because they mirror the legacy database as a whole.
- Master-data resources that only differ by table and columns are one descriptive file each in
  `features/masters/`, built by the shared `src/http/crud/create-crud-routes.js` instead of three copied files.
- Code used by several features stays outside them: `src/http/`, `src/middleware/`, `src/infra/`, `src/lib/`.
- The web app follows the same rule (`apps/web/src/features/<feature>/`, see ADR 0006).

## Consequences

Everything about one area is found and changed in one folder, and a feature can be removed or reviewed as a unit.
The layers still exist inside each folder, and `docs/ARCHITECTURE.md` explains where each one is.

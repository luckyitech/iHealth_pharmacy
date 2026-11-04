# How the code is organised

A short guide to where things are, and the path one request takes through the system.
The README has the setup steps; `docs/DEVIATIONS.md` lists where behaviour differs from the legacy app.

## The three parts

| Folder            | What it is                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web`        | The React app people use in the browser. Only frontend code.                                                 |
| `apps/api`        | The Node.js (Express) API. Only backend code, including everything about the database.                       |
| `packages/shared` | Code both sides need: validation schemas, permission definitions, error codes. No React, no database access. |

Both apps are organised **by feature**. All the code for one area (sign-in, masters, and later sales or stock)
sits together in one folder, `features/<area>`, instead of being spread across folders by type.

## Backend layers (apps/api)

> **Decision (2026-11-04):** the backend keeps this feature-first layout. Each feature folder holds its own
> routes (controller), service and repository. See [ADR 0007](adr/0007-backend-feature-folders.md).

The usual MVC names map onto the code like this:

| Layer                    | Where                                                                      | What it does                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Models**               | `apps/api/db/prisma/schema.prisma`                                         | One `model` per legacy table, read from the production schema. The tables are never changed. New tables are added only as SQL files in `apps/api/db/sql/additive/`.        |
| **Validation**           | `packages/shared/src/schemas/`                                             | Zod schemas: what a request may contain and what a response looks like. The web app uses the same schemas for its forms, so the browser and the API apply identical rules. |
| **Controllers** (routes) | `features/<area>/*.routes.js`, and the master files in `features/masters/` | Each route says its method, path, permissions and schemas, and has a small `handler`. The handler takes the validated input, calls the service and returns the result.     |
| **Services**             | `features/<area>/*.service.js`                                             | The business rules: for example "lock the account after 5 failed sign-ins", or "an item with stock cannot be deactivated".                                                 |
| **Repositories**         | `features/<area>/*.repository.js`                                          | The only code that queries the database (through Prisma). They hide the legacy column names, so the rest of the code uses clear names (`name`, not `ITEM_NM`).             |
| **Shared HTTP plumbing** | `src/http/`, `src/middleware/`                                             | Turns route definitions into Express routes: input validation, sign-in and permission checks, the API docs, and one error handler for every error.                         |
| **Infrastructure**       | `src/infra/`, `src/config/`, `src/lib/`                                    | Redis, email, settings read from `.env` (checked at startup), the logger and the error classes.                                                                            |

`features/auth` shows all the layers as separate files (`auth.routes.js` → `auth.service.js` → `auth.repository.js`).

The master-data screens (manufacturers, items, hospitals, ...) are mostly the same: list, view, create, edit,
deactivate. Repeating three files for each of them would be copy-paste. So each master is **one file** in
`features/masters/` that only _describes_ itself: its table, its columns, its rules. One shared builder,
`src/http/crud/create-crud-routes.js`, turns that description into the routes, the queries and the audit log
entries. When a master needs a rule of its own, the file adds it as a small function. For example,
`items.js` refuses to deactivate an item that still has stock, and generates the item code.

## Frontend structure (apps/web/src)

| Folder                                       | What it holds                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `app/`                                       | Start-up: the router (every screen is loaded only when opened), the providers.                   |
| `features/<area>/`                           | The screens of one area, e.g. `features/masters/items/items-page.jsx`.                           |
| `components/ui/`                             | Basic building blocks: buttons, inputs, dialogs, menus.                                          |
| `components/form/`, `components/data-table/` | Form fields wired to validation, and the table with sorting and paging.                          |
| `lib/`                                       | Talking to the API (`api-client.js`, `resource-api.js`), and the reference lists (`lookups.js`). |
| `hooks/`, `stores/`                          | Reusable React hooks, and the little state that lives only in the browser.                       |

Data from the API is fetched and cached with TanStack Query. Forms use React Hook Form with the shared Zod schema,
so a mistake is shown next to the field before anything is sent.

## The path of one request

What happens when someone saves a new item on the **Items** screen:

1. **Screen**: the item's edit dialog (`/masters/items?edit=new`, from `features/masters/items/items-page.jsx` and the shared `record-dialog.jsx`) shows the form. When the user clicks _Create item_, the form
   checks the values with `itemInputSchema` (from `packages/shared`). If, for example, no manufacturer was chosen,
   the message appears under that field and nothing is sent.
2. **API call**: `lib/resource-api.js` (`useSaveResource`) sends `POST /api/v1/masters/items` with the values.
   `lib/api-client.js` adds the security token (CSRF) and sends the sign-in cookie with the request.
3. **Route**: in the API, `src/http/mount-routes.js` finds the route defined by
   `src/features/masters/items.js`. Before the handler runs:
   - the guards in `features/auth` (`auth.guards.js`, `csrf.js`) check that the user is signed in, that the CSRF
     token is valid, and that they
     have a permission allowed by `POLICIES.masters.write` (for example _Masters Entry_);
   - the body is checked again with the same `itemInputSchema`. The API never trusts what the browser sent.
4. **Rules and database**: the handler (built by `create-crud-routes.js`) opens a transaction. Inside it, it checks
   that the code and barcode are not in use, maps the clear field names to the legacy columns (`name` → `ITEM_NM`),
   adds this pharmacy's id and who made the change, and inserts the row with Prisma. If no code was given, it fills
   `IC0000123` from the new id.
5. **Audit**: `features/audit/audit-log.js` records who created which item, and from which address.
6. **Response**: the new item comes back with the names of its group, manufacturer and so on, as
   `{ "data": { ... } }` with status `201`. Any error, at any step, goes through `src/middleware/error-handler.js`
   and comes back in one shape: `{ "error": { "code", "message", "details" } }`. Stack traces are never sent.
7. **Screen again**: TanStack Query refreshes the items list, the dialog closes over the same list (same search and page), and an "Item created" message
   appears.

## Where to add things

- **A new screen for an existing table**: a schema in `packages/shared/src/schemas/`, an API file in
  `apps/api/src/features/<area>/`, registered in `apps/api/src/server.js`, a page in
  `apps/web/src/features/<area>/`, and a route in `apps/web/src/app/router.jsx`.
- **A new table**: a numbered SQL file in `apps/api/db/sql/additive/` (never change a legacy table), then
  `npm run db:pull -w @ihealth/api` to refresh the models.
- **A new permission rule**: `packages/shared/src/permissions/policies.js`.
- **A setting**: `apps/api/src/config/env.js` (validated at startup) and `.env.example`. Values are never
  hardcoded in the code.

## How records are edited (web)

- Every record opens in a centred dialog over its list: `features/masters/record-dialog.jsx`.
- Small records (lookups, manufacturers, terms) get a narrow dialog. Large records (items,
  suppliers, customers, employees, hospitals, providers) set `dialogSize: 'large'`: a wide dialog
  with their `sections` as cards and a row of section links. On phones the dialog fills the screen.
- The open record is in the URL (`?edit=48`, `?edit=new`), beside the list's search, filters and page.
- `record-form.js` holds saving, Ctrl+S and focus; `record-actions.jsx` the "More" menu with
  deactivate or restore. Closing with unsaved changes asks first.

## Asking before saving, and notifications (web)

- **Every change asks first.** Saving an edited record shows "Save these changes?" with each change as
  "Field: before → after" (passwords are never shown). A new record gets a short "Create this …?". The
  sign-in and access actions, and deactivate or restore, ask the same way. "Go back" has the focus, so
  Enter never confirms by accident, and Ctrl+S opens the question rather than saving. Save stays off
  until something has changed. The question is `components/feedback/save-confirm-dialog.jsx`, asked
  with `hooks/use-confirm.jsx`; `lib/form-changes.js` reads the changes from the form.
- **Notifications** use [Sonner](https://sonner.emilkowal.ski), through one helper, `lib/notify.js`
  (`notify.success`, `notify.error`, `notify.info`, `notify.promise`), and one styled `Toaster`
  (`components/ui/sonner.jsx`): bottom right (top centre on phones), with a close button. Successes go after
  4 seconds and errors after 8. Messages name the record ("Supplier "Dawa Ltd" saved"), and a deactivation
  offers Undo. The API client reports a lost connection once, and an ended session says so.
- Errors about a field stay under that field. A page's main result, like the forgot-password answer,
  stays on the page. Neither is a notification.

## Navigation (web)

- **One sidebar:** `app/navigation.js` lists the modules. A module with pages of its own (Masters) has `children`, which the sidebar shows as a group that opens in place, under the headings from `features/masters/sections.js`. A user sees only the pages their permissions allow.
- **Group state:** the group opens by itself on its own pages. When the user opens or closes it, that choice is remembered (`stores/sidebar-store.js`, in local storage).
- **Icon rail:** on desktop the sidebar can collapse to icons. A group's pages then open in a menu beside its icon. Phones use the drawer, with the same groups.
- **Content width:** pages start right after the sidebar, with a 16px gutter on phones and 24px from the `sm` breakpoint. They are not centred in a fixed width, so wide screens show more of a table instead of an empty margin.

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

The factory's options, for when a master needs more than columns and a schema:

| Option                            | What it does                                                                                                       | Used by                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `unique` (with `fields`)          | Refuses a duplicate, checked only when the value changes, so old duplicates stay editable; several fields together | names, codes, item-supplier pair |
| `enrich`                          | Adds names of linked records, legacy dates (`legacyDates`) or flags, with one query per page                       | most masters                     |
| `search`, `filters`               | Text search and list filters; either may query other tables first                                                  | item suppliers (search by names) |
| `createDefaults`, `afterCreate`   | Columns set only on create; work after the insert (e.g. a code from the new id)                                    | items, employees                 |
| `beforeWrite`, `beforeDeactivate` | Refuse a write (a linked record is missing) or a deactivation (stock on hand)                                      | item suppliers, items            |
| `nullsLast`                       | Sort fields whose empty values go last                                                                             | item-supplier priority           |

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
  hardcoded in the code: `npm run check:hardcodes` (also in CI) refuses place and pharmacy names,
  currencies, dialling codes, time zones, locales, hosts and till numbers outside the config. Unit
  conversions use `@ihealth/shared/units` (`MS_PER_MINUTE`, `BYTES_PER_KB`, `localToday`).

## How records are edited (web)

- Every record opens in a centred dialog over its list: `features/masters/record-dialog.jsx`.
- Small records (lookups, manufacturers, terms) get a narrow dialog. Large records (items,
  suppliers, customers, employees, hospitals, providers) set `dialogSize: 'large'`: a wide dialog
  with their `sections` as cards and a row of section links. On phones the dialog fills the screen.
- The open record is in the URL (`?edit=48`, `?edit=new`), beside the list's search, filters and page.
- `record-form.js` holds saving, Ctrl+S and focus; `record-actions.jsx` the "More" menu with
  deactivate or restore. Closing with unsaved changes asks first.
- A master page is one config for `MasterResourcePage` (`master-resource-page.jsx`): columns, fields,
  schema, and optionally `listFilters`, `tabs` (e.g. an item's Suppliers), `ListContext` (a line above the
  list, e.g. "Showing the links of item …") and `newRecordDefaults` (a new record takes the list's filter,
  e.g. the item it was opened from).

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

The layout follows the old system's pattern (`components/layout/app-shell.jsx`):

- **Left column:** from the top of the screen, as in the old system. Its top cell holds the pharmacy's logo and is as tall as the two bars, so the column and the bars meet on one vertical and one horizontal line; the bars start to its right.
- **Account bar:** the pharmacy's logo and name from its profile (`pharmacy-brand.jsx`, from `/app-info` and the public logo), the theme and the account menu.
- **Menu bar** (`bg-nav`, a deeper teal in dark mode so white text stays readable): the main sections from `app/navigation.js`, only those the user may open, the current one highlighted (`SectionTabs`).
- **Side panel:** for a section with pages of its own (`children`, e.g. Masters from `features/masters/sections.js`), its pages under small group headings (`side-panel.jsx`, `SectionNav`).
  - It is an icon rail (64px) with a tooltip on each icon, and slides out to 240px on hover or keyboard focus, moving the page along as when it is pinned. It opens after 150ms and closes 250ms after the mouse leaves. On a touch screen the first tap opens it and a tap outside closes it.
  - "Keep the panel open" pins it (remembered in `stores/sidebar-store.js`); the page then starts after it.
- **Phones:** one bar with a menu button; the drawer lists the sections with the current section's pages (`MobileNav`).
- **Find a page:** Ctrl+K (⌘K on a Mac), or the search button in the account bar, opens a quick search over every page the user may open (`command-palette.jsx`, built on [cmdk](https://cmdk.paco.me)).
- **Reduce effects:** a switch in the account menu turns off animations, slides and see-through blur, remembered per person on this device (`stores/effects-store.js`, the `data-reduce-effects` rule in `styles/globals.css`). The system's reduce-motion setting is respected anyway.
- **Content width:** pages start right after the rail or panel, with a 16px gutter on phones and 24px from the `sm` breakpoint, and use the full width.

## Sales (phase 2)

- **Sales history** (`apps/api/src/features/sales/`, `apps/web/src/features/sales/history/`): read-only. The list, one bill, and its receipt reprint read the legacy `sales` and `sales_items` tables with parameterised raw SQL, because some legacy timestamps are zero dates and the list needs joins and a line count per bill.
- **Statuses and payments**: the legacy `PAYMENT_STATUS` text (any case) maps to `BILL_STATUSES`; each payment method is its own legacy amount column (`PAYMENT_METHODS`). Old-data problems are flagged, never changed: no items, payments that don't add up, short M-Pesa codes.
- **Receipt**: `receipt-pdf.js` draws the 80 mm receipt with pdfkit, from the pharmacy profile and the installation's locale and currency. A reprint is marked "COPY".
- **Privacy**: opening or reprinting a bill is written to the audit log; card numbers show only their last digits.
- **Errors**: every failed action shows a notification through `notify.failure(action, error)`: what failed, why, and the request's reference for support. Field errors still show under their field.
- **Pricing** (`@ihealth/shared/pricing`): one engine for the till and the API. The label price includes VAT; the unit price is label / (1 + VAT%); the discount is taken before VAT; a line is rounded to cents; the bill's net is the sum of its lines rounded to `SALES_ROUNDING_STEP` (whole shillings by default), and the difference is "rounded off". Exact decimal arithmetic. Profit per line is (price after discount − cost after supplier discount) × quantity, before VAT, and never leaves the server.
- **Quote** (`POST /sales/quote`): the till sends batches, quantities and discounts; the server takes prices, VAT and costs from the batches and answers with priced lines, warnings (expired, not enough stock) and totals. Nothing is saved.
- **Checking against old bills**: `npm run db:verify-sales-pricing` recalculates past bills on the Docker copy and prints how many match (counts only). On the dev copy, last 12 months: every line amount and every VAT figure; 99.8% of bill nets (the rest differ by one shilling, from the legacy floating point); 99.4% of discounts.
- **Completing a sale** (`POST /sales/bills`, `complete-sale.js`): one transaction. The batches are locked (`SELECT … FOR UPDATE`), checked (not gone, not expired, enough units across lines, discount within `SALES_SELF_DISCOUNT_LIMIT`), priced with the engine, and the payments settled (cash and M-Pesa in this phase; M-Pesa needs the full 10-character code, never used before, and may not exceed the bill; cash may, and the change is returned). Then the bill number (`nextDocumentCode`, the legacy `SB` counter), the bill, its lines with profit, and the request key are saved together.
- **The legacy triggers still do their part**: each saved line takes its quantity off the batch, and the cash kept goes to the "Sales Till" account. The new code therefore checks stock under the lock but never changes it, so stock moves exactly once.
- **No double sales**: the till makes a random `requestKey` per sale; `ih_sale_request` (additive SQL 0005) maps it to the bill, so a double click or a retry returns the bill already saved.

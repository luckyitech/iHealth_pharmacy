# @ihealth/web

React 19 + Vite single-page app. Run it with `npm run dev -w @ihealth/web` (http://localhost:5180), with the API on port 4000.
The dev server proxies `/api` to the API, so the `SameSite=Strict` session cookies work as in production.

## Stack

React Router 7 (one lazy chunk per page) · TanStack Query 5 (all server state) · Zustand (client-only state: theme, mobile menu) · React Hook Form + Zod (schemas shared with the API) · ky · Tailwind CSS v4 + shadcn/ui components (JavaScript) · Lucide icons · Sonner toasts · react-error-boundary.

## Layout

```
src/
  app/            providers, router, navigation (modules and the permissions that gate them)
  components/ui/  shadcn/ui-style primitives (button, input, card, dropdown-menu, sheet, ...)
  components/layout/    app shell: sidebar, mobile drawer, top bar, theme and user menus
  components/feedback/  PageState (loading / empty / error), error fallbacks, 403/404 pages
  features/<feature>/   pages, hooks and API calls of one feature
  lib/            api client, errors, CSRF token, query client
  stores/         Zustand stores
```

## Conventions

- **Server state lives in TanStack Query only.** Zustand holds UI state that the server does not know about.
- **Every screen uses `PageState`** for loading, empty and error states. Errors show a safe message and the request id.
- **Permissions:** the menu and the routes use `usePermissions()` with the shared `PERMISSIONS`. This is for usability only: the API enforces every permission itself.
- **Session:** tokens never reach JavaScript (httpOnly cookies). The CSRF token is held in memory and sent as `x-csrf-token` on writes. When the access token expires, the client refreshes it once and replays the request. If that fails, the user returns to sign-in.
- **Accessibility (WCAG 2.1 AA):** semantic landmarks, a skip link, labelled controls, visible focus rings, `aria-invalid` and described-by on form errors, reduced-motion support. `eslint-plugin-jsx-a11y` runs in CI.

## Tests

- `npm run test -w @ihealth/web`: Vitest + React Testing Library.
- `npm run test:e2e -w @ihealth/web`: Playwright smoke test of sign-in, permission-driven navigation, the 403 page, sign-out and theme switching, on desktop and mobile viewports. It runs against the production build with the auth API mocked (`e2e/api-mock.js`), so it needs no database. Run `npx playwright install chromium` once first.

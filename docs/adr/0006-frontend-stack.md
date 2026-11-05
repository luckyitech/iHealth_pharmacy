# 0006. Frontend stack

- Status: Accepted
- Date: 2026-11-03

## Decision

- React 19 with Vite. React Router 7 with a lazy-loaded route per feature.
- TanStack Query 5 for all server state. Zustand only for real client state (UI preferences, session flags).
- React Hook Form with the Zod resolver, using the same schemas as the API.
- `ky` as a thin API client that handles CSRF headers, refresh-on-401 and error mapping.
- Tailwind CSS v4 and shadcn/ui (the JavaScript variant) as the design system, with Lucide icons, TanStack Table for data grids and Sonner for toasts.
- `react-error-boundary` at the app and route level. A shared `PageState` component gives every screen the same loading, empty and error states.
- Feature-based folders (`features/<feature>/`). Accessible by default (WCAG 2.1 AA), mobile-first, light and dark themes.
- Tests: Vitest and React Testing Library for components, Playwright for end-to-end smoke tests of critical flows.

## Consequences

The UI is consistent and accessible, with less hand-written state management than the legacy frontend.

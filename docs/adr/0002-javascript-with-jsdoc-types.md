# 0002. Plain JavaScript with JSDoc types

- Status: Accepted
- Date: 2026-11-03

## Context

The team wants plain JavaScript and no TypeScript, but health and stock data needs the safety that static checking gives.

## Decision

- All source is modern JavaScript (ES2022+, ES modules, `"type": "module"`). No `.ts` or `.tsx` files.
- Types, parameters, return values and data shapes are written as JSDoc.
  ESLint (`eslint-plugin-jsdoc`) requires JSDoc on exported functions.
- `tsc -p jsconfig.json` (with `checkJs`, `strict` and `noEmit`) type-checks the JavaScript. It runs locally (`npm run typecheck`) and in CI. TypeScript is a dev-only tool and never a runtime or build step.
- Where runtime validation is needed, Zod schemas are the single source of truth, and JSDoc types are inferred from them (`@typedef {import('zod').infer<typeof schema>}`).

## Consequences

- No compile step for the API, and editors still get type hints.
- JSDoc is more verbose than TypeScript syntax. We accept that in exchange for the team's language preference.

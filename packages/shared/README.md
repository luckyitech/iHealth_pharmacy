# @ihealth/shared

Plain JavaScript shared by `apps/api` and `apps/web`. No Node-only or browser-only APIs.

| Import                        | Contents                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@ihealth/shared/schemas`     | Base Zod schemas (ids, text, email, Kenyan phone, dates, Y/N flags) and list query, meta and envelope helpers |
| `@ihealth/shared/permissions` | `PERMISSIONS` constants mirroring the legacy `pharma_access` table, plus helpers                              |
| `@ihealth/shared/errors`      | Error codes, their HTTP statuses and safe messages, the error response schema                                 |
| `@ihealth/shared/money`       | `decimal.js` money helpers (half-up rounding to cents), KES formatting, `moneySchema`                         |
| `@ihealth/shared/locale`      | `Africa/Nairobi`, `KES`, `en-KE`                                                                              |

## Permissions

`PERMISSIONS` is generated from the legacy `pharma_access` table (`npm run permissions:generate -w @ihealth/db`).
Keys are `GROUP_NAME` in upper snake case, e.g. `SALES_SALES_BILLING_SUBMISSION`. Ids, groups and names are copied exactly, typos included.
Two legacy rows have unusual ids (`424324345` and `424324346`: Credit Settlement and its reversal). They are kept as they are.

**Change from the legacy system:** the legacy Angular guards check permissions by their **position** in the list returned by the API (for example, `permissions[25].activeS === 'Y'`), and only in the browser.
Here, permissions are checked by their stable `PHARMA_ACCESS_ID`, on the server, for every request. The UI only uses them to hide what a user cannot use.

## Money

Money never uses JavaScript floating-point numbers. Use `toMoney()`, then the helpers. The API sends money as strings with two decimals (`"1250.50"`).
Legacy `DOUBLE` columns are read through `toMoney()` and rounded half-up to cents at the boundary.

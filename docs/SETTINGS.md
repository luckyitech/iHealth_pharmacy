# Settings and permissions

What a pharmacy can set, and who can do what, as of the end of phase 2. Settings are environment
variables, validated when the API starts (`apps/api/src/config/env.js`, copied with their defaults into
`.env.example`), except the ones a pharmacy changes itself on a Masters screen. Permissions live in the
legacy `pharma_access` table; the ones the new system added have ids from 900001.

## Permissions added by the new system

| Id     | Name                     | What it allows                                                                  | Given by default to                                                                                                                                | Added by          |
| ------ | ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 900001 | Masters View             | Seeing the master screens without changing them                                 | Nobody (granted on the employee's access tab)                                                                                                      | additive SQL 0003 |
| 900002 | Accept cheque payments   | Taking a cheque at the till                                                     | Once, to the roles and people holding "Sales Billing Bonus Items Approval" (7) or "Sales Return Approval" (8): 22 active people on the Docker copy | additive SQL 0007 |
| 900003 | Sales approval           | Approving a big discount, a changed price, a sale below cost, or a cancellation | Once, to the roles named Pharmacy Manager (spelt "PARMACY MANAGER" in the data) and Super Admin: 13 active people on the Docker copy               | additive SQL 0008 |
| 900004 | Controlled-drug register | Reading and printing the controlled-drug register                               | Once, to the Pharmacist, Pharmacy Manager and Super Admin roles: 28 active people on the Docker copy                                               | additive SQL 0011 |

Each is granted only the first time its row is added; after that it is managed per employee, and the
SQL never grants it again.

## Legacy permissions now enforced

| Id  | Name                     | Before                      | Now                                                                                                                                                                                                                         |
| --- | ------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Sales Return Approval    | A checkbox nothing checked  | Required of the second person who approves a return. 21 active people hold it (10 pharmacists, 5 super admins, 3 pharmacy managers, 1 admin, 1 receptionist, 1 with no role). Trimming it is waiting for the user's answer. |
| 6   | Sales Billing Submission | Checked in the browser only | Required to sell, return, print labels and add a doctor at the till; checked on the server                                                                                                                                  |

## Settings a pharmacy changes itself

| Where                                       | Setting                | Default                     | Meaning                                                                                                                                                  |
| ------------------------------------------- | ---------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Masters → Pharmacy profile → Sales settings | Controlled-drug rules  | On                          | On: a controlled drug can't be paid for until the register's details are in. Off: as in the legacy app, asked for but not required. Changes are audited. |
| Masters → Banks                             | Banks                  | 10 Kenyan banks, added once | The banks a cheque can be drawn on                                                                                                                       |
| Masters → Medicine types                    | Medicine type per item | As in the legacy data       | Prescription-only, controlled, antibiotic or none                                                                                                        |

The default of the controlled-drug rules comes from `SALES_CONTROLLED_DRUG_RULES` until a pharmacy
saves its own choice.

## Deployment settings for sales

| Setting                                                       | Default                                                                                              | Meaning                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DOCUMENT_CODE_PREFIX`                                        | `DP`                                                                                                 | First letters of every document number (bills, returns, credit notes)                      |
| `SALES_ROUNDING_STEP`                                         | `1`                                                                                                  | A bill's net is rounded to this step (whole shillings); 0 keeps cents                      |
| `SALES_SELF_DISCOUNT_LIMIT`                                   | `25`                                                                                                 | Highest line discount, in percent, a cashier may give without approval                     |
| `SALES_DEFAULT_PROVIDER_ID`                                   | empty (set it to the legacy "N/A" doctor; 512 on the Docker copy)                                    | Doctor saved on bills without one, so the legacy reports list them; shown as "No doctor"   |
| `SALES_MAX_HELD`                                              | `30`                                                                                                 | Most sales on hold at once                                                                 |
| `SALES_SEARCH_LIMIT`                                          | `30`                                                                                                 | Most batches one till search returns                                                       |
| `SALES_LOOKUP_LIMIT`                                          | `10`                                                                                                 | Most customers, doctors or hospitals one type-ahead lists                                  |
| `HISTORY_LIMIT`                                               | `200`                                                                                                | Most lines one History list shows (a bill's, an employee's, today's held sales ...)        |
| `SALES_QUICK_CASH_NOTES`                                      | `50,100,200,500,1000`                                                                                | Bank notes offered as quick cash amounts                                                   |
| `SALES_CHEQUE_MAX_AGE_MONTHS`                                 | `6`                                                                                                  | Older cheques are refused                                                                  |
| `SALES_CANCEL_ALONE_MINUTES`                                  | `10`                                                                                                 | Minutes in which a cashier may cancel their own bill alone                                 |
| `SALES_APPROVAL_PIN_TRIES`, `SALES_APPROVAL_LOCK_MINUTES`     | `3`, `15`                                                                                            | Wrong approval PINs allowed, and how long the approver is then locked out                  |
| `SALES_APPROVAL_VALID_MINUTES`                                | `15`                                                                                                 | How long an approval stays usable for its sale                                             |
| `SALES_APPROVAL_REASONS`                                      | Regular customer, Price match, Near expiry, Staff purchase                                           | Quick reasons in the approval window                                                       |
| `SALES_CANCEL_REASONS`                                        | Wrong item, Customer changed mind, Payment failed                                                    | Quick reasons when cancelling a bill                                                       |
| `SALES_RETURN_DAYS`                                           | `30`                                                                                                 | Most days after a sale that its goods can be returned                                      |
| `SALES_RETURN_REASONS`                                        | Treatment changed, Medicine changed, Wrong medicine, Not required any more, Customer did not turn up | Quick reasons when goods come back (the legacy app's five)                                 |
| `CREDIT_NOTE_VALID_MONTHS`                                    | `12`                                                                                                 | Months a new credit note can be spent for; 0 = never expires                               |
| `SALES_CONTROLLED_DRUG_RULES`                                 | `true`                                                                                               | Default of the pharmacy's controlled-drug rules                                            |
| `MEDICINE_CODE_PRESCRIPTION`, `_CONTROLLED`, `_ANTIBIOTIC`    | `H`, `X`, `H1`                                                                                       | Legacy schedule codes treated as each kind of medicine                                     |
| `MEDICINE_NAME_PRESCRIPTION`, `_CONTROLLED`, `_ANTIBIOTIC`    | Prescription only, Controlled, Antibiotic                                                            | The names shown for them                                                                   |
| `PRESCRIPTION_PHOTO_MAX_KB`                                   | `500`                                                                                                | Largest prescription photo kept                                                            |
| `CONTROLLED_REGISTER_MAX_DAYS`                                | `366`                                                                                                | Longest period one register page covers                                                    |
| `LABEL_MAX_COPIES`                                            | `20`                                                                                                 | Most copies of one dosing sticker per print                                                |
| `LABEL_WARNING`                                               | Keep out of reach and sight of children                                                              | Printed on stickers when the legacy label setting has no closing line                      |
| `RECEIPT_RETURN_NOTE`                                         | Returns within {days} days with this receipt                                                         | The line under the receipt's totals; `{days}` is `SALES_RETURN_DAYS`. Empty prints nothing |
| `RECEIPT_EXEMPT_TAX_CODES`                                    | `E`                                                                                                  | Tax codes printed as "Exempt"                                                              |
| `APP_LOCALE`, `APP_CURRENCY`, `APP_TIME_ZONE`, `DB_TIME_ZONE` | `en-KE`, `KES`, `Africa/Nairobi`, `+03:00`                                                           | Regional settings; the legacy data is stored in the pharmacy's wall clock                  |

Read from the legacy database rather than set here: the receipt's header (Pharmacy profile) and closing
lines, and the dosing sticker's header and closing line (`reports_mapping`); the tax codes in force on a
date (`taxcategory`); the payment types (`payment_types`).

## Limits that are not settings

Column lengths and input bounds that protect the server (longest text, most lines on a sale, largest
quantity, page size) are constants in `packages/shared/src/schemas`, because they follow the legacy
columns or guard against abuse rather than express a pharmacy's choice. `npm run check:hardcodes` fails
on place names, currencies, time zones, locales, hosts, account numbers, legacy row ids written as
numbers, and result limits written as numbers.

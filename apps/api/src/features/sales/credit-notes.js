/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import { compareMoney, moneyToString, roundMoney, subtractMoney } from '@ihealth/shared/money';

import { Prisma } from '#db';

/** The legacy note's status while it can still be spent, and once it is used up. */
const LEGACY_OPEN = 'pending';
const LEGACY_USED = 'Paid';
const LEGACY_ACTIVE = 'y';
/** Notes the legacy app gave to suppliers are not spent at the till. */
const LEGACY_PURCHASE = 'purchase';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteLookupSchema>} CreditNoteLookup
 */

/**
 * Credit notes as a way of paying: finding one by its number with what is left on it, and using
 * part or all of it on a bill. What is left stays on the same note (the legacy app made a new note
 * instead). A legacy note the new app has not used yet still has its whole amount and no expiry.
 *
 * @param {{ timeZone: string }} options
 * @returns The store.
 */
export function createCreditNotes({ timeZone }) {
  /**
   * @param {any} client
   * @param {string} code
   * @param {{ lock?: boolean }} [options]
   * @returns {Promise<CreditNoteLookup | null>}
   */
  const find = async (client, code, { lock = false } = {}) => {
    /** @type {Record<string, any>[]} */
    const [row] = await client.$queryRaw`
      SELECT c.credit_note_id AS id, c.credit_note_no AS code, c.amount AS amount, c.STATUS AS status,
        c.PAYMENT_STATUS AS paymentStatus, c.ACTIVE_S AS active, c.return_type AS returnType,
        c.bill_id AS billCode, TRIM(CONCAT_WS(' ', cu.FIRST_NM, cu.LAST_NM)) AS customerName,
        n.BALANCE AS balance, CAST(n.EXPIRES_ON AS CHAR) AS expiresOn
      FROM credit_note c
        LEFT JOIN customer cu ON cu.CUSTOMER_ID = c.CUSTOMER_ID
        LEFT JOIN ih_credit_note n ON n.CREDIT_NOTE_ID = c.credit_note_id
      WHERE c.credit_note_no = ${code.trim().toUpperCase()}
      LIMIT 1
      ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
    if (!row) return null;
    const balance = roundMoney(Number(row.balance ?? row.amount ?? 0));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); // hardcode-ok: a locale that formats dates as YYYY-MM-DD, used only to build text
    const open =
      String(row.paymentStatus ?? '')
        .trim()
        .toLowerCase() === LEGACY_OPEN;
    let problem = null;
    if (
      String(row.returnType ?? '')
        .trim()
        .toLowerCase() === LEGACY_PURCHASE
    )
      problem = 'This is a supplier credit note, not a customer one';
    else if (
      String(row.active ?? '')
        .trim()
        .toLowerCase() !== LEGACY_ACTIVE
    )
      problem = 'This credit note was cancelled';
    else if (!open || compareMoney(balance, 0) <= 0) problem = 'This credit note has been used up';
    else if (row.expiresOn && String(row.expiresOn) < today)
      problem = `This credit note expired on ${row.expiresOn}`;
    return {
      id: Number(row.id),
      code: String(row.code),
      customerName: String(row.customerName ?? '').trim() || null,
      amount: moneyToString(roundMoney(Number(row.amount ?? 0))),
      balance: moneyToString(balance),
      expiresOn: row.expiresOn ? String(row.expiresOn) : null,
      originalBillCode: String(row.billCode ?? '').trim() || null,
      problem,
    };
  };

  return {
    find,

    /**
     * Takes an amount off a note for a bill. The note was found and locked in this transaction.
     *
     * @param {any} tx
     * @param {CreditNoteLookup} note
     * @param {{ billId: number, amount: string, employeeId: number }} use
     * @returns {Promise<void>}
     */
    async spend(tx, note, { billId, amount, employeeId }) {
      const after = moneyToString(subtractMoney(note.balance, amount));
      await tx.$executeRaw`
        INSERT INTO ih_credit_note (CREDIT_NOTE_ID, BALANCE) VALUES (${note.id}, ${after})
        ON DUPLICATE KEY UPDATE BALANCE = VALUES(BALANCE)`;
      await tx.$executeRaw`
        INSERT INTO ih_credit_note_use (CREDIT_NOTE_ID, BILL_ID, AMOUNT, BALANCE_AFTER, USED_BY)
        VALUES (${note.id}, ${billId}, ${amount}, ${after}, ${employeeId})`;
      // A note used up is closed for the legacy app too.
      if (compareMoney(after, 0) <= 0)
        await tx.$executeRaw`
          UPDATE credit_note SET PAYMENT_STATUS = ${LEGACY_USED} WHERE credit_note_id = ${note.id}`;
    },
  };
}

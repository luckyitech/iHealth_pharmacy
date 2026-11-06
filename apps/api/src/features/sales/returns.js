/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import {
  addMoney,
  compareMoney,
  moneyToString,
  multiplyMoney,
  roundMoney,
  subtractMoney,
  toMoney,
} from '@ihealth/shared/money';
import { ERROR_CODES } from '@ihealth/shared/errors';
import { POLICIES } from '@ihealth/shared/permissions';
import { REFUND_METHODS, RETURN_CONDITIONS } from '@ihealth/shared/schemas';

import { toDbTime } from '#db';

import { AppError, conflict, notFound, validationFailed } from '../../lib/errors.js';
import { DOCUMENT_KINDS, nextDocumentCode } from '../document-codes/document-codes.js';
import { toLegacyDate } from '../masters/legacy-mapping.js';
import { createApprovalService } from './approvals.js';
import { todayIn } from './batches.repository.js';

/** The legacy status of a cancelled bill. */
const LEGACY_CANCEL = 'cancel';
/** How the legacy tables name an approved return and its refund. */
const LEGACY_APPROVED = 'Approved';
/** The legacy payment type (`payment_types.TYPE`) and bill type of each way of refunding. */
export const LEGACY_REFUNDS = Object.freeze({
  [REFUND_METHODS.CASH]: { paymentType: 'CASH', billType: 'Cash Back', paymentStatus: 'paid' },
  [REFUND_METHODS.MPESA]: { paymentType: 'M-PESA', billType: 'Cash Back', paymentStatus: 'paid' },
  [REFUND_METHODS.CREDIT_NOTE]: {
    paymentType: 'CREDIT',
    billType: 'Credit Note',
    paymentStatus: 'Pending',
  },
});
/** What the stock history calls each change a return makes. */
const ENTRY_TYPES = Object.freeze({ RETURN: 'Sales Return', WRITE_OFF: 'Return Write-off' });
const LEGACY_RETURN_TYPE = 'Sales Returns';
const YES = 'Y';
const NO = 'N';
const MS_PER_DAY = 86_400_000;

/**
 * @typedef {object} ReturnDetail
 * @property {number} id
 * @property {string} code
 * @property {string} at When it was made, the pharmacy's wall clock.
 * @property {number} billId
 * @property {string | null} billCode
 * @property {string | null} customerName
 * @property {string} reason
 * @property {'cash' | 'mpesa' | 'creditNote'} refundMethod
 * @property {string} refund
 * @property {string | null} mpesaCode
 * @property {string | null} requestedBy
 * @property {string} approvedBy
 * @property {{ itemName: string | null, quantity: number, restocked: boolean, amount: string }[]} lines
 * @property {import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteSchema> | null} creditNote
 */

/**
 * @param {string} date `YYYY-MM-DD`
 * @param {number} months
 * @returns {string} The same day that many months later.
 */
function monthsAfter(date, months) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() + months);
  return day.toISOString().slice(0, 10);
}

/**
 * Sales returns: what a bill still has to return, and returning part or all of it with a second
 * person's approval. The money goes back as cash, M-Pesa or a credit note.
 *
 * The legacy tables are still written, so the legacy reports and the till see the return: the
 * legacy trigger on sales_return_item puts the units back into the newest batch of the item on the
 * bill, so they are then moved to the batch they were sold from, or written off; and the legacy
 * trigger on credit_note takes a cash refund out of the till. The returned bill itself is never
 * changed (a legacy trigger moves till cash whenever a cancelled bill is touched).
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The service.
 */
export function createReturnService({ prisma, config }) {
  const approvals = createApprovalService({ prisma, config });

  /**
   * @param {any} client
   * @param {number} billId
   * @param {number} pharmacyId
   * @returns {Promise<{ bill: Record<string, any>, lines: Record<string, any>[], refunded: string } | null>}
   */
  const readBill = async (client, billId, pharmacyId) => {
    /** @type {Record<string, any>[]} */
    const [bill] = await client.$queryRaw`
      SELECT BILL_ID AS id, BILL_CODE AS code, CAST(BILL_DATE AS CHAR) AS billDate,
        CUSTOMER_ID AS customerId, CUSTOMER_NM AS customerName, PAYMENT_STATUS AS status,
        NET_AMOUNT AS net
      FROM sales WHERE BILL_ID = ${billId} AND PHARMACY_ID = ${pharmacyId}`;
    if (!bill) return null;
    /** @type {Record<string, any>[]} */
    const lines = await client.$queryRaw`
      SELECT i.SALES_ITEMS_ID AS lineId, i.ITEM_ID AS itemId, i.STOCK_ID AS stockId,
        it.ITEM_NM AS itemName, COALESCE(i.BATCH_NO, st.BATCH_NO) AS batchNo,
        i.SALE_QTY AS sold, i.SALE_AMOUNT AS amount,
        COALESCE((SELECT SUM(ri.RETURN_QUANTITY) FROM sales_return_item ri
          JOIN sales_return r ON r.SALES_RETURN_ID = ri.SALES_RETURN_ID
          WHERE r.BILL_ID = i.BILL_ID AND (ri.SALES_ITEM_ID = i.SALES_ITEMS_ID
            OR (ri.SALES_ITEM_ID IS NULL AND ri.ITEM_ID = i.ITEM_ID))), 0) AS returned
      FROM sales_items i
        LEFT JOIN items it ON it.ITEM_ID = i.ITEM_ID
        LEFT JOIN stock st ON st.STOCK_ID = i.STOCK_ID
      WHERE i.BILL_ID = ${billId}
      ORDER BY i.SALES_ITEMS_ID`;
    /** @type {{ total: unknown }[]} */
    const [refunded] = await client.$queryRaw`
      SELECT COALESCE(SUM(TOTAL_AMOUNT), 0) AS total FROM sales_return WHERE BILL_ID = ${billId}`;
    return { bill, lines, refunded: moneyToString(roundMoney(Number(refunded?.total ?? 0))) };
  };

  /**
   * @param {Record<string, any>} bill
   * @param {string} today
   * @returns {{ daysSince: number, blocked: string | null }}
   */
  const limitsOf = (bill, today) => {
    const daysSince = Math.round(
      (Date.parse(today) - Date.parse(String(bill.billDate))) / MS_PER_DAY,
    );
    if (
      String(bill.status ?? '')
        .trim()
        .toLowerCase() === LEGACY_CANCEL
    )
      return { daysSince, blocked: 'This bill was cancelled, so nothing on it can be returned' };
    if (daysSince > config.sales.returnDays)
      return {
        daysSince,
        blocked: `This bill is ${daysSince} days old; goods can be returned for ${config.sales.returnDays} days`,
      };
    return { daysSince, blocked: null };
  };

  /**
   * @param {Record<string, any>} line
   * @param {number} quantity
   * @returns {ReturnType<typeof toMoney>} What the customer paid for that many units, to the cent.
   */
  const paidFor = (line, quantity) =>
    Number(line.sold) > 0
      ? roundMoney(multiplyMoney(String(line.amount ?? 0), quantity).div(Number(line.sold)))
      : toMoney(0);

  return {
    /**
     * A return made in the new app, as its receipt shows it.
     *
     * @param {number} returnId
     * @param {number} pharmacyId
     * @returns {Promise<ReturnDetail | null>}
     */
    async read(returnId, pharmacyId) {
      /** @type {Record<string, any>[]} */
      const [row] = await prisma.$queryRaw`
        SELECT r.SALES_RETURN_ID AS id, r.SALES_RETURN_NO AS code, CAST(x.CREATED_AT AS CHAR) AS at,
          r.BILL_ID AS billId, s.BILL_CODE AS billCode, s.CUSTOMER_NM AS customerName,
          x.REASON AS reason, x.REFUND_METHOD AS refundMethod, x.REFUND_AMOUNT AS refund,
          x.MPESA_CODE AS mpesaCode,
          TRIM(CONCAT_WS(' ', rq.FIRST_NM, rq.LAST_NM)) AS requestedBy,
          TRIM(CONCAT_WS(' ', ap.FIRST_NM, ap.LAST_NM)) AS approvedBy,
          c.credit_note_id AS noteId, c.credit_note_no AS noteCode, c.amount AS noteAmount,
          n.BALANCE AS noteBalance, CAST(n.EXPIRES_ON AS CHAR) AS noteExpires
        FROM sales_return r
          JOIN ih_sale_return x ON x.SALES_RETURN_ID = r.SALES_RETURN_ID
          JOIN sales s ON s.BILL_ID = r.BILL_ID
          LEFT JOIN employee rq ON rq.EMPLOYEE_ID = x.REQUESTED_BY
          LEFT JOIN employee ap ON ap.EMPLOYEE_ID = x.APPROVED_BY
          LEFT JOIN credit_note c ON c.credit_note_id = x.CREDIT_NOTE_ID
          LEFT JOIN ih_credit_note n ON n.CREDIT_NOTE_ID = x.CREDIT_NOTE_ID
        WHERE r.SALES_RETURN_ID = ${returnId} AND x.PHARMACY_ID = ${pharmacyId}`;
      if (!row) return null;
      /** @type {Record<string, any>[]} */
      const lines = await prisma.$queryRaw`
        SELECT it.ITEM_NM AS itemName, l.QUANTITY AS quantity, l.RESTOCKED AS restocked,
          l.REFUND_AMOUNT AS amount
        FROM ih_sale_return_line l
          JOIN sales_items i ON i.SALES_ITEMS_ID = l.SALES_ITEMS_ID
          LEFT JOIN items it ON it.ITEM_ID = i.ITEM_ID
        WHERE l.SALES_RETURN_ID = ${returnId}
        ORDER BY l.SALES_ITEMS_ID`;
      const text = (/** @type {unknown} */ value) => String(value ?? '').trim() || null;
      return {
        id: Number(row.id),
        code: String(row.code),
        at: String(row.at),
        billId: Number(row.billId),
        billCode: text(row.billCode),
        customerName: text(row.customerName),
        reason: String(row.reason),
        refundMethod: /** @type {any} */ (row.refundMethod),
        refund: moneyToString(roundMoney(Number(row.refund))),
        mpesaCode: text(row.mpesaCode),
        requestedBy: text(row.requestedBy),
        approvedBy: text(row.approvedBy) ?? '',
        lines: lines.map((line) => ({
          itemName: text(line.itemName),
          quantity: Number(line.quantity),
          restocked: line.restocked === YES,
          amount: moneyToString(roundMoney(Number(line.amount))),
        })),
        creditNote: row.noteId
          ? {
              id: Number(row.noteId),
              code: String(row.noteCode),
              customerName: text(row.customerName),
              amount: moneyToString(roundMoney(Number(row.noteAmount))),
              balance: moneyToString(roundMoney(Number(row.noteBalance ?? row.noteAmount))),
              expiresOn: text(row.noteExpires),
              originalBillCode: text(row.billCode),
            }
          : null,
      };
    },

    /**
     * @param {number} billId
     * @param {number} pharmacyId
     * @returns {Promise<import('zod').infer<typeof import('@ihealth/shared/schemas').returnableBillSchema>>}
     */
    async returnable(billId, pharmacyId) {
      const found = await readBill(prisma, billId, pharmacyId);
      if (!found) throw notFound('Bill not found');
      const { bill, lines } = found;
      const { daysSince, blocked } = limitsOf(bill, todayIn(config.region.timeZone));
      return {
        billId: Number(bill.id),
        billCode: String(bill.code ?? '').trim() || null,
        billDate: bill.billDate ? String(bill.billDate) : null,
        customerName: String(bill.customerName ?? '').trim() || null,
        customerId: bill.customerId === null ? null : Number(bill.customerId),
        daysSince,
        returnDays: config.sales.returnDays,
        blocked,
        lines: lines.map((line) => ({
          lineId: Number(line.lineId),
          itemName: String(line.itemName ?? '').trim() || null,
          batchNo: String(line.batchNo ?? '').trim() || null,
          sold: Number(line.sold),
          returned: Number(line.returned),
          returnable: Math.max(Number(line.sold) - Number(line.returned), 0),
          unitRefund: moneyToString(paidFor(line, 1)),
        })),
      };
    },

    /**
     * @param {number} billId
     * @param {{ lines: { lineId: number, quantity: number, condition: string }[], reason: string, refund: string, mpesaCode?: string, approver: string, pin: string }} input
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<{ returnId: number }>}
     */
    async create(billId, input, actor) {
      const first = await readBill(prisma, billId, actor.pharmacyId);
      if (!first) throw notFound('Bill not found');
      const today = todayIn(config.region.timeZone);
      const { blocked } = limitsOf(first.bill, today);
      if (blocked) throw conflict(blocked);
      const approver = await approvals.verifyApprover(
        { approver: input.approver, pin: input.pin },
        {
          requesterId: actor.employeeId,
          own: 'return',
          policy: POLICIES.sales.approveReturn,
          refused: 'This person may not approve returns',
        },
      );

      return prisma.$transaction(async (tx) => {
        // Read again under lock: another till may have returned the same units a moment ago.
        await tx.$queryRaw`SELECT BILL_ID FROM sales WHERE BILL_ID = ${billId} FOR UPDATE`;
        const { bill, lines, refunded } =
          /** @type {NonNullable<Awaited<ReturnType<typeof readBill>>>} */ (
            await readBill(tx, billId, actor.pharmacyId)
          );
        const byId = new Map(lines.map((line) => [Number(line.lineId), line]));
        /** @type {{ path: string, message: string }[]} */
        const details = [];
        input.lines.forEach((wanted, index) => {
          const line = byId.get(wanted.lineId);
          if (!line) {
            details.push({
              path: `body.lines.${index}.lineId`,
              message: 'This line is not on the bill',
            });
            return;
          }
          const left = Number(line.sold) - Number(line.returned);
          if (wanted.quantity > left)
            details.push({
              path: `body.lines.${index}.quantity`,
              message: left > 0 ? `Only ${left} left to return` : 'This line was returned already',
            });
        });
        if (details.length) throw validationFailed(details);

        // Each line gives back what was paid for those units; returning all that is left gives
        // back exactly what is left of the bill, so rounding never adds up to more.
        const priced = input.lines.map((wanted) => {
          const line = /** @type {Record<string, any>} */ (byId.get(wanted.lineId));
          return { wanted, line, amount: paidFor(line, wanted.quantity) };
        });
        const everything = lines.every((line) => {
          const wanted = input.lines.find((entry) => entry.lineId === Number(line.lineId));
          return Number(line.sold) - Number(line.returned) - (wanted?.quantity ?? 0) <= 0;
        });
        const left = subtractMoney(toMoney(Number(bill.net ?? 0)), refunded);
        let refund = addMoney(...priced.map((entry) => entry.amount));
        if (everything || compareMoney(refund, left) > 0)
          refund = left.isNegative() ? toMoney(0) : left;
        const refundText = moneyToString(refund);

        const by = String(actor.employeeId);
        const now = new Date();
        const stamp = toDbTime(now);
        const legacy = LEGACY_REFUNDS[/** @type {keyof typeof LEGACY_REFUNDS} */ (input.refund)];
        /** @type {{ id: number }[]} */
        const [paymentType] = await tx.$queryRaw`
          SELECT PAYMENT_TYPE_ID AS id FROM payment_types WHERE UPPER(TYPE) = ${legacy.paymentType}`;
        if (!paymentType)
          throw new AppError(ERROR_CODES.INTERNAL_ERROR, {
            message: `The legacy payment type ${legacy.paymentType} is missing`,
          });
        const paymentTypeId = Number(paymentType.id);
        const codeOptions = {
          prefix: config.documentCodePrefix,
          timeZone: config.region.timeZone,
          now,
        };
        const returnCode = await nextDocumentCode(tx, DOCUMENT_KINDS.SALES_RETURN, codeOptions);
        const noteCode = await nextDocumentCode(tx, DOCUMENT_KINDS.CREDIT_NOTE, codeOptions);

        await tx.$executeRaw`
          INSERT INTO sales_return (SALES_RETURN_NO, SALES_RETURN_DATE, STATUS, BILL_ID, TOTAL_AMOUNT,
            CREATION_TS, CREATION_USER_ID, LAST_UPDATE_TS, LAST_UPDATE_USER_ID, ACTIVE_S,
            PAYMENT_TYPE_ID, PHARMACY_ID, REMARKS, BILL_TYPE, PAYMENT_STATUS)
          VALUES (${returnCode}, ${toLegacyDate(today)}, ${LEGACY_APPROVED}, ${billId}, ${Number(refundText)},
            ${stamp}, ${by}, ${stamp}, ${by}, ${YES}, ${paymentTypeId}, ${actor.pharmacyId},
            ${input.reason}, ${legacy.billType}, ${legacy.paymentStatus})`;
        /** @type {{ id: bigint | number }[]} */
        const [{ id: returnIdRaw }] = await tx.$queryRaw`SELECT LAST_INSERT_ID() AS id`;
        const returnId = Number(returnIdRaw);

        // Every legacy return has a credit note; for a cash refund its trigger takes the cash out of the till.
        await tx.$executeRaw`
          INSERT INTO credit_note (credit_note_no, credit_date, bill_id, amount, remarks, CREATION_TS,
            CREATION_USER_ID, LAST_UPDATE_TS, LAST_UPDATE_USER_ID, PHARMACY_ID, ACTIVE_S, return_type,
            return_type_reason, CUSTOMER_ID, APPROVED_BY, APPROVED_DATE, STATUS, PAYMENT_TYPE_ID,
            NET_AMOUNT, bill_type_id, PAYMENT_STATUS, SOURCE_REF)
          VALUES (${noteCode}, ${toLegacyDate(today)}, ${bill.code}, ${Number(refundText)}, ${input.reason},
            ${stamp}, ${by}, ${stamp}, ${by}, ${actor.pharmacyId}, ${YES}, ${LEGACY_RETURN_TYPE},
            ${LEGACY_RETURN_TYPE}, ${bill.customerId}, ${approver.employeeId}, ${toLegacyDate(today)},
            ${LEGACY_APPROVED}, ${paymentTypeId}, ${Number(refundText)}, ${legacy.billType},
            ${legacy.paymentStatus}, ${returnCode})`;
        /** @type {{ id: bigint | number }[]} */
        const [{ id: noteIdRaw }] = await tx.$queryRaw`SELECT LAST_INSERT_ID() AS id`;
        const noteId = Number(noteIdRaw);
        const isCreditNote = input.refund === REFUND_METHODS.CREDIT_NOTE;
        if (isCreditNote) {
          const expiresOn = config.sales.creditNoteValidMonths
            ? monthsAfter(today, config.sales.creditNoteValidMonths)
            : null;
          await tx.$executeRaw`
            INSERT INTO ih_credit_note (CREDIT_NOTE_ID, BALANCE, EXPIRES_ON, ORIGINAL_BILL_ID, REASON)
            VALUES (${noteId}, ${refundText}, ${toLegacyDate(expiresOn)}, ${billId}, ${input.reason})`;
        }

        await tx.$executeRaw`
          INSERT INTO ih_sale_return (SALES_RETURN_ID, PHARMACY_ID, BILL_ID, REQUESTED_BY, APPROVED_BY,
            REASON, REFUND_METHOD, REFUND_AMOUNT, MPESA_CODE, CREDIT_NOTE_ID)
          VALUES (${returnId}, ${actor.pharmacyId}, ${billId}, ${actor.employeeId}, ${approver.employeeId},
            ${input.reason}, ${input.refund}, ${refundText}, ${input.mpesaCode ?? null},
            ${isCreditNote ? noteId : null})`;
        await approvals.recordReturn(
          tx,
          { billId, reason: input.reason, approverId: approver.employeeId, refund: refundText },
          actor,
        );

        for (const { wanted, line, amount } of priced) {
          await returnStock(tx, { billId, line, wanted, by });
          await tx.$executeRaw`
            INSERT INTO ih_sale_return_line (SALES_RETURN_ID, SALES_ITEMS_ID, STOCK_ID, QUANTITY,
              RESTOCKED, REFUND_AMOUNT)
            VALUES (${returnId}, ${Number(line.lineId)}, ${Number(line.stockId)}, ${wanted.quantity},
              ${wanted.condition === RETURN_CONDITIONS.RESTOCK ? YES : NO}, ${moneyToString(amount)})`;
        }
        for (const { wanted, line, amount } of priced) {
          await legacyReturnLine(tx, {
            returnId,
            line,
            wanted,
            amount: moneyToString(amount),
            reason: input.reason,
            paymentStatus: legacy.paymentStatus,
            stamp,
            by,
          });
        }
        return { returnId };
      });
    },
  };

  /**
   * Prepares the batches for a returned line. The legacy trigger on sales_return_item will add the
   * units to the newest batch of the item on the bill; this marks that change in the stock history
   * as a return.
   *
   * @param {any} tx
   * @param {{ billId: number, line: Record<string, any>, wanted: { quantity: number, condition: string }, by: string }} move
   * @returns {Promise<void>}
   */
  async function returnStock(tx, { billId, line }) {
    await tx.$executeRaw`
      UPDATE stock SET ENTRY_TYPE = ${ENTRY_TYPES.RETURN}, BILL_ID = ${billId}
      WHERE STOCK_ID = (SELECT MAX(i.STOCK_ID) FROM sales_items i
        WHERE i.BILL_ID = ${billId} AND i.ITEM_ID = ${line.itemId})`;
  }

  /**
   * Writes the legacy return line (its trigger restocks the newest batch of the item on the bill),
   * then moves the units to the batch they were sold from, or writes them off.
   *
   * @param {any} tx
   * @param {{ returnId: number, line: Record<string, any>, wanted: { quantity: number, condition: string }, amount: string, reason: string, paymentStatus: string, stamp: Date, by: string }} entry
   * @returns {Promise<void>}
   */
  async function legacyReturnLine(
    tx,
    { returnId, line, wanted, amount, reason, paymentStatus, stamp, by },
  ) {
    /** @type {{ stockId: number | null }[]} */
    const [target] = await tx.$queryRaw`
      SELECT MAX(i.STOCK_ID) AS stockId FROM sales_items i
      WHERE i.BILL_ID = (SELECT BILL_ID FROM sales_items WHERE SALES_ITEMS_ID = ${Number(line.lineId)})
        AND i.ITEM_ID = ${line.itemId}`;
    await tx.$executeRaw`
      INSERT INTO sales_return_item (SALES_RETURN_ID, SALES_RETURN_TYPE, ITEM_ID, PURCHASE_QUANTITY,
        RETURN_QUANTITY, BONUS_QUANTITY, AMOUNT, CHARGES, CREATION_TS, CREATION_USER_ID, LAST_UPDATE_TS,
        LAST_UPDATE_USER_ID, ACTIVE_S, SALES_ITEM_ID, PAYMENT_STATUS)
      VALUES (${returnId}, ${reason}, ${line.itemId}, ${Number(line.sold)}, ${wanted.quantity}, 0,
        ${Number(amount)}, 0, ${stamp}, ${by}, ${stamp}, ${by}, ${YES}, ${Number(line.lineId)},
        ${paymentStatus})`;
    const landed = Number(target?.stockId);
    const sold = Number(line.stockId);
    const restock = wanted.condition === RETURN_CONDITIONS.RESTOCK;
    if (landed !== sold) {
      await moveStock(tx, landed, -wanted.quantity, ENTRY_TYPES.RETURN);
      if (restock) await moveStock(tx, sold, wanted.quantity, ENTRY_TYPES.RETURN);
    } else if (!restock) {
      await moveStock(tx, sold, -wanted.quantity, ENTRY_TYPES.WRITE_OFF);
    }
  }

  /**
   * @param {any} tx
   * @param {number} stockId
   * @param {number} change
   * @param {string} entryType How the stock history names the change.
   * @returns {Promise<void>}
   */
  async function moveStock(tx, stockId, change, entryType) {
    await tx.$executeRaw`
      UPDATE stock SET QUANTITY = QUANTITY + ${change}, ENTRY_TYPE = ${entryType}
      WHERE STOCK_ID = ${stockId}`;
  }
}

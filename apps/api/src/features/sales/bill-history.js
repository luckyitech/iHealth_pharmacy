/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import { ACTIVITY_ACTIONS, ACTIVITY_SUBJECTS, APPROVAL_KINDS } from '@ihealth/shared/schemas';

import { Prisma } from '#db';

import { createActivityLog, toActivityEntry } from '../activity/activity-log.js';

/**
 * @param {string} alias
 * @returns {import('#db').Prisma.Sql} The employee's full name.
 */
const nameOf = (alias) => Prisma.raw(`TRIM(CONCAT_WS(' ', ${alias}.FIRST_NM, ${alias}.LAST_NM))`);

/**
 * Everything done to one bill, oldest first, with who did it and when: the sale, its prescription
 * photo, dosing labels and receipts printed, approvals, a cancellation, returns and credit notes
 * spent on it. Most steps are read from the tables that already keep them; prints and reprints
 * come from the history lines.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The bill history.
 */
export function createBillHistory({ prisma, config }) {
  const activity = createActivityLog(prisma);

  return {
    /**
     * @param {number} billId
     * @param {number} pharmacyId
     * @returns {Promise<import('@ihealth/shared/schemas').ActivityEntry[] | null>} Null when the
     *   bill is not this pharmacy's.
     */
    async of(billId, pharmacyId) {
      /** @type {Record<string, any>[]} */
      const [bill] = await prisma.$queryRaw`
        SELECT s.BILL_ID AS id, s.BILL_CODE AS code, s.CREATION_TS AS at, ${nameOf('e')} AS byName
        FROM sales s LEFT JOIN employee e ON e.EMPLOYEE_ID = s.EMPLOYEE_ID
        WHERE s.BILL_ID = ${billId} AND s.PHARMACY_ID = ${pharmacyId}`;
      if (!bill) return null;

      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT CONCAT('photo-', p.BILL_ID) AS id, ${ACTIVITY_ACTIONS.PHOTO_TAKEN} AS action,
          p.CREATED_AT AS at, ${nameOf('e')} AS byName, NULL AS details
        FROM ih_prescription_photo p LEFT JOIN employee e ON e.EMPLOYEE_ID = p.CREATED_BY
        WHERE p.BILL_ID = ${billId}
        UNION ALL
        SELECT CONCAT('labels-', l.PRINT_ID), ${ACTIVITY_ACTIONS.LABELS_PRINTED}, MIN(l.PRINTED_AT),
          ANY_VALUE(${nameOf('e')}), JSON_OBJECT('stickers', SUM(l.COPIES))
        FROM ih_dispense_label l LEFT JOIN employee e ON e.EMPLOYEE_ID = l.PRINTED_BY
        WHERE l.BILL_ID = ${billId} GROUP BY l.PRINT_ID
        UNION ALL
        SELECT CONCAT('approval-', a.APPROVAL_ID), CONCAT('approval.', a.KIND), a.CREATED_AT,
          COALESCE(NULLIF(${nameOf('ap')}, ''), ${nameOf('rq')}),
          JSON_OBJECT('requestedBy', ${nameOf('rq')}, 'reason', a.REASON, 'amount', a.GIVEN_AWAY,
            'alone', a.APPROVED_BY IS NULL)
        FROM ih_sale_approval a
          LEFT JOIN employee rq ON rq.EMPLOYEE_ID = a.REQUESTED_BY
          LEFT JOIN employee ap ON ap.EMPLOYEE_ID = a.APPROVED_BY
        WHERE a.BILL_ID = ${billId} AND a.USED_AT IS NOT NULL AND a.KIND <> ${APPROVAL_KINDS.RETURN}
        UNION ALL
        SELECT CONCAT('return-', x.SALES_RETURN_ID), ${ACTIVITY_ACTIONS.RETURN_MADE}, x.CREATED_AT,
          ${nameOf('rq')},
          JSON_OBJECT('code', r.SALES_RETURN_NO, 'approvedBy', ${nameOf('ap')},
            'amount', x.REFUND_AMOUNT, 'method', x.REFUND_METHOD, 'mpesaCode', x.MPESA_CODE,
            'creditNote', c.credit_note_no)
        FROM ih_sale_return x
          JOIN sales_return r ON r.SALES_RETURN_ID = x.SALES_RETURN_ID
          LEFT JOIN employee rq ON rq.EMPLOYEE_ID = x.REQUESTED_BY
          LEFT JOIN employee ap ON ap.EMPLOYEE_ID = x.APPROVED_BY
          LEFT JOIN credit_note c ON c.credit_note_id = x.CREDIT_NOTE_ID
        WHERE x.BILL_ID = ${billId}
        UNION ALL
        SELECT CONCAT('note-use-', u.CREDIT_NOTE_ID), ${ACTIVITY_ACTIONS.CREDIT_NOTE_USED}, u.USED_AT,
          ${nameOf('e')}, JSON_OBJECT('code', c.credit_note_no, 'amount', u.AMOUNT,
            'left', u.BALANCE_AFTER)
        FROM ih_credit_note_use u
          LEFT JOIN credit_note c ON c.credit_note_id = u.CREDIT_NOTE_ID
          LEFT JOIN employee e ON e.EMPLOYEE_ID = u.USED_BY
        WHERE u.BILL_ID = ${billId}`;

      const subject = { subjectType: ACTIVITY_SUBJECTS.BILL, subjectId: billId };
      const sale = toActivityEntry({
        ...subject,
        id: `sale-${bill.id}`,
        action: ACTIVITY_ACTIONS.SALE_MADE,
        at: bill.at,
        byName: bill.byName,
        details: { code: bill.code },
      });
      const later = [
        ...rows.map((row) => toActivityEntry({ ...subject, ...row })),
        ...(await activity.of(ACTIVITY_SUBJECTS.BILL, billId, config.historyLimit)),
      ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      // The sale comes first: its legacy time has whole seconds only, so it can read a moment
      // after the photo saved with it.
      return [sale, ...later].slice(0, config.historyLimit);
    },
  };
}

/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy tables */
import { conflict, notFound, validationFailed } from '../../lib/errors.js';
import { createApprovalService } from './approvals.js';
import { todayIn } from './batches.repository.js';

/** The legacy status of a cancelled bill; the legacy triggers act on it. */
const LEGACY_CANCEL = 'Cancel';
const SECOND_PERSON = 'A second person must approve this: enter their username and PIN';

/**
 * Cancelling a bill. A cashier may cancel their own bill alone, with a reason, for a few minutes
 * after the sale; later, or someone else's bill, needs a second person. Bills from an earlier day
 * cannot be cancelled: that is a return.
 *
 * The legacy database triggers do the rest when the bill and its lines are updated, once each: the
 * cash comes out of the "Sales Till" account and each line's units go back to its batch.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The service.
 */
export function createCancelService({ prisma, config }) {
  const approvals = createApprovalService({ prisma, config });

  /**
   * @param {any} client
   * @param {number} billId
   * @param {number} pharmacyId
   * @param {boolean} [lock]
   * @returns {Promise<Record<string, any> | undefined>}
   */
  const readBill = async (client, billId, pharmacyId, lock = false) => {
    /** @type {Record<string, any>[]} */
    const [bill] = lock
      ? await client.$queryRaw`
          SELECT BILL_ID AS id, EMPLOYEE_ID AS cashierId, PAYMENT_STATUS AS status,
            CAST(BILL_DATE AS CHAR) AS billDate, NET_AMOUNT AS net,
            TIMESTAMPDIFF(SECOND, CREATION_TS, NOW()) AS ageSeconds
          FROM sales WHERE BILL_ID = ${billId} AND PHARMACY_ID = ${pharmacyId} FOR UPDATE`
      : await client.$queryRaw`
          SELECT BILL_ID AS id, EMPLOYEE_ID AS cashierId, PAYMENT_STATUS AS status,
            CAST(BILL_DATE AS CHAR) AS billDate, NET_AMOUNT AS net,
            TIMESTAMPDIFF(SECOND, CREATION_TS, NOW()) AS ageSeconds
          FROM sales WHERE BILL_ID = ${billId} AND PHARMACY_ID = ${pharmacyId}`;
    return bill;
  };

  /**
   * @param {Record<string, any> | undefined} bill
   * @returns {asserts bill is Record<string, any>}
   */
  const assertCancellable = (bill) => {
    if (!bill) throw notFound('Bill not found');
    if (
      String(bill.status ?? '')
        .trim()
        .toLowerCase() === LEGACY_CANCEL.toLowerCase()
    )
      throw conflict('This bill is already cancelled');
    if (bill.billDate !== todayIn(config.region.timeZone))
      throw conflict("Bills from an earlier day can't be cancelled. Make a return instead.");
  };

  return {
    /**
     * @param {number} billId
     * @param {{ reason: string, approver?: string, pin?: string }} input
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<{ approvedBy: string | null }>}
     */
    async cancel(billId, input, actor) {
      const bill = await readBill(prisma, billId, actor.pharmacyId);
      assertCancellable(bill);
      const alone =
        Number(bill.cashierId) === actor.employeeId &&
        Number(bill.ageSeconds) <= config.sales.cancelAloneMinutes * 60;
      /** @type {{ employeeId: number, name: string } | null} */
      let approver = null;
      if (!alone) {
        if (!input.approver || !input.pin) {
          throw validationFailed([
            ...(input.approver ? [] : [{ path: 'body.approver', message: SECOND_PERSON }]),
            ...(input.pin ? [] : [{ path: 'body.pin', message: SECOND_PERSON }]),
          ]);
        }
        approver = await approvals.verifyApprover(
          { approver: input.approver, pin: input.pin },
          { requesterId: actor.employeeId, own: 'cancellation' },
        );
      }

      await prisma.$transaction(async (tx) => {
        // Checked again under the lock: another till may have cancelled it a moment ago.
        assertCancellable(await readBill(tx, billId, actor.pharmacyId, true));
        const by = String(actor.employeeId);
        await tx.$executeRaw`
          UPDATE sales SET PAYMENT_STATUS = ${LEGACY_CANCEL}, LAST_UPDATE_TS = NOW(),
            LAST_UPDATE_USER_ID = ${by}
          WHERE BILL_ID = ${billId}`;
        await tx.$executeRaw`
          UPDATE sales_items SET LAST_UPDATE_TS = NOW(), LAST_UPDATE_USER_ID = ${by}
          WHERE BILL_ID = ${billId}`;
        await approvals.recordCancel(
          tx,
          {
            billId,
            reason: input.reason,
            approverId: approver?.employeeId ?? null,
            givenAway: Number(bill.net ?? 0).toFixed(2),
          },
          actor,
        );
      });
      return { approvedBy: approver?.name ?? null };
    },
  };
}

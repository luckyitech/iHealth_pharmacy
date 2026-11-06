/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import { createHash, randomUUID } from 'node:crypto';

import {
  addMoney,
  compareMoney,
  moneyToString,
  multiplyMoney,
  subtractMoney,
  toMoney,
} from '@ihealth/shared/money';
import { hasAnyPermission, POLICIES } from '@ihealth/shared/permissions';
import { APPROVAL_KINDS, APPROVAL_REASONS } from '@ihealth/shared/schemas';

import { validationFailed } from '../../lib/errors.js';
import { createAuthRepository } from '../auth/auth.repository.js';
import {
  hashPassword,
  legacyFingerprint,
  verifyAgainstDummy,
  verifyLegacySecret,
  verifyPassword,
} from '../auth/password-hasher.js';

const ACTIVE = 'Y';
const SECONDS_PER_MINUTE = 60;

/**
 * @typedef {{ stockId: number, quantity: number, discountPercent: number, labelPrice?: string | number }} LineInput
 * @typedef {{ stockId: number, itemName: string | null, reasons: string[], givenAway: string }} ApprovalItem
 */

/**
 * A fingerprint of what was approved: the same lines, quantities, discounts and prices. A sale
 * whose lines changed after approval needs a new approval.
 *
 * @param {LineInput[]} lines
 * @returns {string}
 */
export function linesHash(lines) {
  const normalized = lines.map((line) => [
    line.stockId,
    line.quantity,
    line.discountPercent ?? 0,
    line.labelPrice === undefined ? null : moneyToString(line.labelPrice),
  ]);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * What on each line needs a second person, and how much is given away below the shelf price.
 *
 * @param {LineInput[]} lines
 * @param {Map<number, Record<string, any>>} batches
 * @param {{ belowCost: boolean, amount: string }[]} priced The engine's lines, priced with the line's price.
 * @param {number} discountLimit
 * @returns {ApprovalItem[]}
 */
export function approvalsNeeded(lines, batches, priced, discountLimit) {
  return lines.map((line, index) => {
    const batch = batches.get(line.stockId) ?? {};
    const shelf = toMoney(Number(batch.labelPrice ?? 0));
    /** @type {string[]} */
    const reasons = [];
    if (line.discountPercent > discountLimit) reasons.push(APPROVAL_REASONS.DISCOUNT);
    if (line.labelPrice !== undefined && compareMoney(line.labelPrice, shelf) !== 0)
      reasons.push(APPROVAL_REASONS.PRICE);
    if (priced[index]?.belowCost) reasons.push(APPROVAL_REASONS.BELOW_COST);
    const atShelf = multiplyMoney(shelf, line.quantity);
    const given = subtractMoney(atShelf, priced[index]?.amount ?? 0);
    return {
      stockId: line.stockId,
      itemName: String(batch.itemName ?? '').trim() || null,
      reasons,
      givenAway: moneyToString(given.isNegative() ? 0 : given),
    };
  });
}

/**
 * Approvals at the till: checking the second person's PIN (with a lock after too many wrong tries),
 * recording what was approved, and tying a sale's approval to its bill.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The service.
 */
export function createApprovalService({ prisma, config }) {
  const auth = createAuthRepository(prisma);
  const { approvalPinTries, approvalLockMinutes } = config.sales;

  /**
   * @param {number} employeeId
   * @param {number} failed Wrong tries so far, this one included.
   * @returns {Promise<string>} What to tell the approver.
   */
  const recordWrongPin = async (employeeId, failed) => {
    const lock = failed >= approvalPinTries;
    // Times are the database clock's, like every comparison made against them.
    await prisma.$executeRaw`
      INSERT INTO ih_approval_pin (EMPLOYEE_ID, FAILED_COUNT, LOCKED_UNTIL)
      VALUES (${employeeId}, ${lock ? 0 : failed},
        IF(${lock}, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${approvalLockMinutes} MINUTE), NULL))
      ON DUPLICATE KEY UPDATE FAILED_COUNT = VALUES(FAILED_COUNT), LOCKED_UNTIL = VALUES(LOCKED_UNTIL)`;
    if (lock) return `Wrong PIN. It is now locked for ${approvalLockMinutes} minutes.`;
    const left = approvalPinTries - failed;
    return `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before it is locked for ${approvalLockMinutes} minutes.`;
  };

  /**
   * Checks the second person: an active user, not the one asking, allowed to approve, with the
   * right approval PIN. The legacy PIN is plain text; a hashed copy is kept from its first use.
   *
   * @param {{ approver: string, pin: string }} input
   * @param {{ requesterId: number, own: string, policy?: ReadonlyArray<import('@ihealth/shared/permissions').PermissionDefinition>, refused?: string }} rules
   *   `own` ends "You can't approve your own …"; `policy` is the permission the approver needs
   *   (sales approval unless said), and `refused` what to say when they lack it.
   * @returns {Promise<{ employeeId: number, name: string }>}
   */
  async function verifyApprover(
    { approver, pin },
    {
      requesterId,
      own,
      policy = POLICIES.sales.approve,
      refused = 'This person may not approve sales',
    },
  ) {
    const credentials = await auth.findCredentialsByUsername(approver.trim());
    /** @type {{ activeS: string | null, firstNm: string | null, lastNm: string | null } | null} */
    const employee = credentials
      ? await prisma.employee.findUnique({
          where: { employeeId: credentials.employeeId },
          select: { activeS: true, firstNm: true, lastNm: true },
        })
      : null;
    if (!credentials || !credentials.active || employee?.activeS?.toUpperCase() !== ACTIVE) {
      await verifyAgainstDummy(pin);
      throw validationFailed([
        { path: 'body.approver', message: 'No one active has this username' },
      ]);
    }
    if (credentials.employeeId === requesterId)
      throw validationFailed([
        { path: 'body.approver', message: `You can't approve your own ${own}. Ask someone else.` },
      ]);
    const permissions = new Set(await auth.findEffectivePermissionIds(credentials.employeeId));
    if (!hasAnyPermission(permissions, policy))
      throw validationFailed([{ path: 'body.approver', message: refused }]);
    if (!credentials.approvalPin)
      throw validationFailed([{ path: 'body.pin', message: 'This person has no approval PIN' }]);

    /** @type {{ hash: string | null, fingerprint: string | null, failed: number, lockedSeconds: number | null }[]} */
    const [stored] = await prisma.$queryRaw`
      SELECT PIN_HASH AS hash, LEGACY_FINGERPRINT AS fingerprint, FAILED_COUNT AS failed,
        TIMESTAMPDIFF(SECOND, CURRENT_TIMESTAMP(3), LOCKED_UNTIL) AS lockedSeconds
      FROM ih_approval_pin WHERE EMPLOYEE_ID = ${credentials.employeeId}`;
    if (Number(stored?.lockedSeconds ?? 0) > 0) {
      const minutes = Math.ceil(Number(stored.lockedSeconds) / SECONDS_PER_MINUTE);
      throw validationFailed([
        {
          path: 'body.pin',
          message: `Too many wrong PINs. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
        },
      ]);
    }

    const fingerprint = legacyFingerprint(credentials.approvalPin);
    // The hashed copy is used while the legacy PIN is unchanged; a changed PIN is checked afresh.
    const upToDate = stored?.hash && stored.fingerprint === fingerprint;
    const valid = upToDate
      ? await verifyPassword(/** @type {string} */ (stored.hash), pin)
      : await verifyLegacySecret(credentials.approvalPin, pin);
    if (!valid) {
      const message = await recordWrongPin(credentials.employeeId, Number(stored?.failed ?? 0) + 1);
      throw validationFailed([{ path: 'body.pin', message }]);
    }
    const hash = upToDate ? stored.hash : await hashPassword(pin);
    await prisma.$executeRaw`
      INSERT INTO ih_approval_pin (EMPLOYEE_ID, PIN_HASH, LEGACY_FINGERPRINT, FAILED_COUNT, LOCKED_UNTIL)
      VALUES (${credentials.employeeId}, ${hash}, ${fingerprint}, 0, NULL)
      ON DUPLICATE KEY UPDATE PIN_HASH = VALUES(PIN_HASH),
        LEGACY_FINGERPRINT = VALUES(LEGACY_FINGERPRINT), FAILED_COUNT = 0, LOCKED_UNTIL = NULL`;
    return {
      employeeId: credentials.employeeId,
      name: [employee.firstNm, employee.lastNm].filter(Boolean).join(' ').trim(),
    };
  }

  return {
    verifyApprover,

    /**
     * Records an approval of a sale's lines and returns the token the till sends with the sale.
     *
     * @param {{ items: ApprovalItem[], hash: string, reason: string, approver: { employeeId: number, name: string } }} approval
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<{ token: string, approvedBy: string, items: ApprovalItem[], givenAway: string }>}
     */
    async recordSaleApproval({ items, hash, reason, approver }, { employeeId, pharmacyId }) {
      const token = randomUUID();
      const approved = items.filter((item) => item.reasons.length);
      const givenAway = moneyToString(addMoney(...approved.map((item) => item.givenAway)));
      await prisma.$executeRaw`
        INSERT INTO ih_sale_approval (TOKEN, KIND, PHARMACY_ID, REQUESTED_BY, APPROVED_BY, REASON,
          DETAILS, LINES_HASH, GIVEN_AWAY, EXPIRES_AT)
        VALUES (${token}, ${APPROVAL_KINDS.SALE}, ${pharmacyId}, ${employeeId}, ${approver.employeeId},
          ${reason}, ${JSON.stringify(approved)}, ${hash}, ${givenAway},
          DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${config.sales.approvalValidMinutes} MINUTE))`;
      return { token, approvedBy: approver.name, items: approved, givenAway };
    },

    /**
     * Ties a sale's approval to its bill, once: the same person, the same lines, still valid.
     *
     * @param {any} tx
     * @param {{ token: string, employeeId: number, hash: string, billId: number }} use
     * @returns {Promise<boolean>} Whether the approval fits this sale.
     */
    async useSaleApproval(tx, { token, employeeId, hash, billId }) {
      const used = await tx.$executeRaw`
        UPDATE ih_sale_approval SET USED_AT = CURRENT_TIMESTAMP(3), BILL_ID = ${billId}
        WHERE TOKEN = ${token} AND KIND = ${APPROVAL_KINDS.SALE} AND REQUESTED_BY = ${employeeId}
          AND LINES_HASH = ${hash} AND USED_AT IS NULL AND EXPIRES_AT > CURRENT_TIMESTAMP(3)`;
      return Number(used) === 1;
    },

    /**
     * Records an approved return, for the day's approvals.
     *
     * @param {any} tx
     * @param {{ billId: number, reason: string, approverId: number, refund: string }} approval
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<void>}
     */
    async recordReturn(tx, { billId, reason, approverId, refund }, { employeeId, pharmacyId }) {
      await tx.$executeRaw`
        INSERT INTO ih_sale_approval (TOKEN, KIND, PHARMACY_ID, REQUESTED_BY, APPROVED_BY, REASON,
          DETAILS, GIVEN_AWAY, BILL_ID, USED_AT)
        VALUES (${randomUUID()}, ${APPROVAL_KINDS.RETURN}, ${pharmacyId}, ${employeeId}, ${approverId},
          ${reason}, ${JSON.stringify([])}, ${refund}, ${billId}, CURRENT_TIMESTAMP(3))`;
    },

    /**
     * Records a cancellation, with its approver when a second person was needed.
     *
     * @param {any} tx
     * @param {{ billId: number, reason: string, approverId: number | null, givenAway: string }} cancel
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<void>}
     */
    async recordCancel(tx, { billId, reason, approverId, givenAway }, { employeeId, pharmacyId }) {
      await tx.$executeRaw`
        INSERT INTO ih_sale_approval (TOKEN, KIND, PHARMACY_ID, REQUESTED_BY, APPROVED_BY, REASON,
          DETAILS, GIVEN_AWAY, BILL_ID, USED_AT)
        VALUES (${randomUUID()}, ${APPROVAL_KINDS.CANCEL}, ${pharmacyId}, ${employeeId}, ${approverId},
          ${reason}, ${JSON.stringify([])}, ${givenAway}, ${billId}, CURRENT_TIMESTAMP(3))`;
    },
  };
}

import { ACTIVITY_ACTIONS } from '@ihealth/shared/schemas';

import { APPROVAL_KIND_LABELS } from '../sales/approvals/approval-labels.js';
import { REFUND_LABELS } from '../sales/returns/return-labels.js';

/** @typedef {import('@ihealth/shared/schemas').ActivityEntry} ActivityEntry */
/** @typedef {ReturnType<typeof import('@/lib/format').useFormat>} Format */

/**
 * What each step is called in a History list.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ACTIVITY_TITLES = Object.freeze({
  [ACTIVITY_ACTIONS.SALE_MADE]: 'Sold',
  [ACTIVITY_ACTIONS.PHOTO_TAKEN]: 'Prescription photo taken',
  [ACTIVITY_ACTIONS.APPROVAL_SALE]: APPROVAL_KIND_LABELS.sale,
  [ACTIVITY_ACTIONS.APPROVAL_CANCEL]: APPROVAL_KIND_LABELS.cancel,
  [ACTIVITY_ACTIONS.RETURN_MADE]: 'Goods returned',
  [ACTIVITY_ACTIONS.CREDIT_NOTE_USED]: 'Paid with a credit note',
  [ACTIVITY_ACTIONS.SALE_HELD]: 'Put on hold',
  [ACTIVITY_ACTIONS.SALE_RECALLED]: 'Recalled',
  [ACTIVITY_ACTIONS.SALE_DELETED]: 'Deleted from hold',
  [ACTIVITY_ACTIONS.RECEIPT_PRINTED]: 'Receipt printed',
  [ACTIVITY_ACTIONS.RECEIPT_REPRINTED]: 'Receipt reprinted',
  [ACTIVITY_ACTIONS.LABELS_PRINTED]: 'Labels printed',
  [ACTIVITY_ACTIONS.LABELS_REPRINTED]: 'Labels reprinted',
  [ACTIVITY_ACTIONS.RETURN_RECEIPT_PRINTED]: 'Return receipt printed',
  [ACTIVITY_ACTIONS.RETURN_RECEIPT_REPRINTED]: 'Return receipt reprinted',
  [ACTIVITY_ACTIONS.REGISTER_VIEWED]: 'Register read',
  [ACTIVITY_ACTIONS.REGISTER_PRINTED]: 'Register printed',
  [ACTIVITY_ACTIONS.SETTING_CHANGED]: 'Controlled-drug rules changed',
  [ACTIVITY_ACTIONS.MEDICINE_TYPE_CHANGED]: 'Medicine type changed',
  [ACTIVITY_ACTIONS.LOGIN_CREATED]: 'Sign-in created',
  [ACTIVITY_ACTIONS.USERNAME_CHANGED]: 'Username changed',
  [ACTIVITY_ACTIONS.PASSWORD_SET]: 'Password set',
  [ACTIVITY_ACTIONS.LOGIN_ENABLED]: 'Sign-in turned on',
  [ACTIVITY_ACTIONS.LOGIN_DISABLED]: 'Sign-in turned off',
  [ACTIVITY_ACTIONS.UNLOCKED]: 'Unlocked',
  [ACTIVITY_ACTIONS.TWO_FACTOR_RESET]: 'Two-factor sign-in reset',
  [ACTIVITY_ACTIONS.ROLE_SET]: 'Role changed',
  [ACTIVITY_ACTIONS.PERMISSIONS_SET]: 'Permissions changed',
  [ACTIVITY_ACTIONS.APPROVAL_PIN_SET]: 'Approval PIN set by an administrator',
  [ACTIVITY_ACTIONS.APPROVAL_PIN_CHANGED]: 'Approval PIN changed by themselves',
});

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const text = (value) =>
  value === null || value === undefined || value === '' ? null : String(value);

/**
 * @param {unknown} value
 * @returns {string}
 */
const onOff = (value) => (value ? 'on' : 'off');

/**
 * The line's extra facts, in words: what was printed, changed or paid.
 *
 * @param {ActivityEntry} entry
 * @param {Format} format
 * @returns {string | null}
 */
export function describeActivity(entry, format) {
  const d = /** @type {Record<string, unknown>} */ (entry.details);
  const amount = text(d.amount) && format.money(/** @type {string} */ (d.amount));
  switch (entry.action) {
    case ACTIVITY_ACTIONS.SALE_MADE:
      return text(d.code) && `Bill ${d.code}`;
    case ACTIVITY_ACTIONS.LABELS_PRINTED:
      return text(d.stickers) && `${d.stickers} stickers`;
    case ACTIVITY_ACTIONS.APPROVAL_SALE:
    case ACTIVITY_ACTIONS.APPROVAL_CANCEL:
      return [
        text(d.requestedBy) && `Asked by ${d.requestedBy}`,
        d.alone && 'within the time allowed alone',
        text(d.reason) && `Reason: ${d.reason}`,
      ]
        .filter(Boolean)
        .join(' · ');
    case ACTIVITY_ACTIONS.RETURN_MADE:
      return [
        text(d.code),
        amount &&
          `${amount} by ${REFUND_LABELS[/** @type {keyof typeof REFUND_LABELS} */ (d.method)] ?? d.method}`,
        text(d.mpesaCode) && `M-Pesa ${d.mpesaCode}`,
        text(d.creditNote) && `credit note ${d.creditNote}`,
        text(d.approvedBy) && `approved by ${d.approvedBy}`,
      ]
        .filter(Boolean)
        .join(' · ');
    case ACTIVITY_ACTIONS.CREDIT_NOTE_USED:
      return [text(d.code), amount, text(d.left) && `${format.money(String(d.left))} left`]
        .filter(Boolean)
        .join(' · ');
    case ACTIVITY_ACTIONS.RETURN_RECEIPT_PRINTED:
    case ACTIVITY_ACTIONS.RETURN_RECEIPT_REPRINTED:
      return text(d.code);
    case ACTIVITY_ACTIONS.SALE_HELD:
    case ACTIVITY_ACTIONS.SALE_RECALLED:
    case ACTIVITY_ACTIONS.SALE_DELETED:
      return [
        text(d.customerName) ?? 'Walk-in',
        `${d.lineCount} ${d.lineCount === 1 ? 'item' : 'items'}`,
        text(d.net) && format.money(/** @type {string} */ (d.net)),
        entry.action !== ACTIVITY_ACTIONS.SALE_HELD &&
          text(d.heldBy) &&
          `held by ${d.heldBy} at ${format.time(/** @type {string} */ (d.heldAt))}`,
      ]
        .filter(Boolean)
        .join(' · ');
    case ACTIVITY_ACTIONS.REGISTER_VIEWED:
    case ACTIVITY_ACTIONS.REGISTER_PRINTED:
      return [text(d.itemName), text(d.from) && `${d.from} to ${d.to}`].filter(Boolean).join(' · ');
    case ACTIVITY_ACTIONS.SETTING_CHANGED:
      return `From ${onOff(d.from)} to ${onOff(d.to)}`;
    case ACTIVITY_ACTIONS.MEDICINE_TYPE_CHANGED:
      return [text(d.itemName), `${text(d.from) ?? 'none'} → ${text(d.to) ?? 'none'}`]
        .filter(Boolean)
        .join(' · ');
    case ACTIVITY_ACTIONS.USERNAME_CHANGED:
      return text(d.from) && `From ${d.from} to ${d.to}`;
    case ACTIVITY_ACTIONS.TWO_FACTOR_RESET:
      return text(d.reason) && `Reason: ${d.reason}`;
    case ACTIVITY_ACTIONS.APPROVAL_PIN_SET:
      return d.replaced ? 'Replaced the old PIN' : 'First PIN';
    default:
      return null;
  }
}

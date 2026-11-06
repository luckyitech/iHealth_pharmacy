/**
 * @typedef {import('./approval-fields.jsx').ApprovalEntry} ApprovalEntry
 * @typedef {import('./approval-fields.jsx').ApprovalErrors} ApprovalErrors
 */

/**
 * Server problems by field (`body.reason`, `body.approver`, `body.pin`); the rest stay for the toast.
 *
 * @param {unknown} error
 * @returns {ApprovalErrors}
 */
export function approvalErrorsOf(error) {
  const details =
    /** @type {{ details?: { path: string, message: string }[] }} */ (error)?.details ?? [];
  /** @type {ApprovalErrors} */
  const fields = {};
  for (const detail of details) {
    const field = /^body\.(reason|approver|pin)$/.exec(detail.path)?.[1];
    if (field) fields[/** @type {keyof ApprovalEntry} */ (field)] = detail.message;
  }
  return fields;
}

/**
 * Problems the till can see before sending.
 *
 * @param {ApprovalEntry} entry
 * @param {{ needApprover: boolean }} rules
 * @returns {ApprovalErrors}
 */
export function missingApproval(entry, { needApprover }) {
  /** @type {ApprovalErrors} */
  const errors = {};
  if (!entry.reason.trim()) errors.reason = 'Enter a reason';
  if (needApprover && !entry.approver.trim()) errors.approver = "Enter the approver's username";
  if (needApprover && !entry.pin) errors.pin = "Enter the approver's PIN";
  return errors;
}

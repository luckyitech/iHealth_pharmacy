import { z } from 'zod';

/** What a history line is about. Each record's History lists the lines of its subject. */
export const ACTIVITY_SUBJECTS = Object.freeze({
  BILL: 'bill',
  HELD_SALE: 'held-sale',
  EMPLOYEE: 'employee',
  ITEM: 'item',
  PHARMACY_SETTING: 'pharmacy-setting',
  CONTROLLED_REGISTER: 'controlled-register',
});

/** What was done. One line per step; a line is never changed afterwards. */
export const ACTIVITY_ACTIONS = Object.freeze({
  // Read from the tables that already keep them, for a bill's History.
  SALE_MADE: 'sale.made',
  PHOTO_TAKEN: 'prescription-photo.taken',
  APPROVAL_SALE: 'approval.sale',
  APPROVAL_CANCEL: 'approval.cancel',
  RETURN_MADE: 'return.made',
  CREDIT_NOTE_USED: 'credit-note.used',
  // Written as lines of their own.
  SALE_HELD: 'sale.held',
  SALE_RECALLED: 'sale.recalled',
  SALE_DELETED: 'sale.deleted',
  RECEIPT_PRINTED: 'receipt.printed',
  RECEIPT_REPRINTED: 'receipt.reprinted',
  LABELS_PRINTED: 'labels.printed',
  LABELS_REPRINTED: 'labels.reprinted',
  RETURN_RECEIPT_PRINTED: 'return-receipt.printed',
  RETURN_RECEIPT_REPRINTED: 'return-receipt.reprinted',
  REGISTER_VIEWED: 'register.viewed',
  REGISTER_PRINTED: 'register.printed',
  SETTING_CHANGED: 'setting.changed',
  MEDICINE_TYPE_CHANGED: 'medicine-type.changed',
  LOGIN_CREATED: 'access.login_created',
  USERNAME_CHANGED: 'access.username_changed',
  PASSWORD_SET: 'access.password_set',
  LOGIN_ENABLED: 'access.login_enabled',
  LOGIN_DISABLED: 'access.login_disabled',
  UNLOCKED: 'access.unlocked',
  TWO_FACTOR_RESET: 'access.two_factor_reset',
  ROLE_SET: 'access.role_set',
  PERMISSIONS_SET: 'access.permissions_set',
  APPROVAL_PIN_SET: 'access.approval_pin_set',
  APPROVAL_PIN_CHANGED: 'access.approval_pin_changed',
});

/** One line of a record's History: who did what, when (the server's clock), and what changed. */
export const activityEntrySchema = z.object({
  id: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  action: z.string(),
  by: z.string().nullable(),
  at: z.string(),
  details: z.record(z.string(), z.unknown()),
});

/** @typedef {z.infer<typeof activityEntrySchema>} ActivityEntry */

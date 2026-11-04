import { toast } from 'sonner';

import { errorMessage } from './api-error.js';

/** How long notifications stay, in milliseconds. Errors stay longer: they may need acting on. */
export const NOTIFY_DURATION = Object.freeze({ SHORT: 4000, ERROR: 8000 });

/**
 * @typedef {object} NotifyOptions
 * @property {string} [description] A second, quieter line.
 * @property {{ label: string, onClick: () => void }} [action] e.g. Undo.
 * @property {string} [id] Notifications with the same id replace each other (no repeats).
 */

/**
 * The one way the app tells people what happened. Built on Sonner (see components/ui/sonner.jsx).
 */
export const notify = Object.freeze({
  /**
   * @param {string} message e.g. `Supplier "Dawa Ltd" saved`
   * @param {NotifyOptions} [options]
   * @returns {string | number}
   */
  success: (message, options = {}) =>
    toast.success(message, { duration: NOTIFY_DURATION.SHORT, ...options }),

  /**
   * @param {string} message
   * @param {NotifyOptions} [options]
   * @returns {string | number}
   */
  info: (message, options = {}) =>
    toast.info(message, { duration: NOTIFY_DURATION.SHORT, ...options }),

  /**
   * @param {unknown} error An API error (its message is shown) or a message.
   * @param {NotifyOptions} [options]
   * @returns {string | number}
   */
  error: (error, options = {}) =>
    toast.error(typeof error === 'string' ? error : errorMessage(error), {
      duration: NOTIFY_DURATION.ERROR,
      ...options,
    }),

  /**
   * "Saving…" while the work runs, then its result.
   *
   * @template T
   * @param {Promise<T>} work
   * @param {{ loading: string, success: string | ((result: T) => string), error?: string }} messages
   * @returns {Promise<T>} The work's own promise.
   */
  promise: (work, messages) => {
    toast.promise(work, {
      loading: messages.loading,
      success: messages.success,
      error: (error) => messages.error ?? errorMessage(error),
    });
    return work;
  },
});

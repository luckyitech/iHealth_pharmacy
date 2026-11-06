/**
 * Keeps browsers and password-manager extensions (LastPass, 1Password, Bitwarden, Dashlane) from
 * putting their own buttons and suggestions in the app's boxes: staff type everything themselves,
 * and an extension's "•••" button in a till field only gets in the way.
 */
const IGNORED_BY_EXTENSIONS = Object.freeze({
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
});

/** A password the browser should not fill in or offer to save; it ignores "off" for passwords. */
const NEW_PASSWORD = 'new-password';
const OFF = 'off';

/**
 * @param {string | undefined} type The input's type.
 * @returns {Record<string, string>} Attributes for an input or text area.
 */
export const noAutofill = (type) => ({
  ...IGNORED_BY_EXTENSIONS,
  autoComplete: type === 'password' ? NEW_PASSWORD : OFF,
});

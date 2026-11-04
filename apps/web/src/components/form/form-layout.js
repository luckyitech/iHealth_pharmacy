import { createContext } from 'react';

/**
 * How form sections are drawn: as cards on a full edit page, as plain groups inside a dialog.
 *
 * @type {React.Context<'page' | 'dialog'>}
 */
export const FormLayoutContext = createContext(/** @type {'page' | 'dialog'} */ ('dialog'));

/**
 * The id of a section, for links to it (e.g. "Units and tax" -> `section-units-and-tax`).
 *
 * @param {string} title
 * @returns {string}
 */
export const sectionAnchor = (title) =>
  `section-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;

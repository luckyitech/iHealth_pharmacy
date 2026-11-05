import { createContext } from 'react';

/**
 * How form sections are drawn: as cards in the large record dialog, as plain groups in a small one.
 *
 * @type {React.Context<'card' | 'plain'>}
 */
export const FormLayoutContext = createContext(/** @type {'card' | 'plain'} */ ('plain'));

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

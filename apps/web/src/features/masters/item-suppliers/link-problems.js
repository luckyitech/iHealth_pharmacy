/**
 * @typedef {object} LinkProblem
 * @property {string} id
 * @property {string} label Short, for the list.
 * @property {string} description A sentence, for the edit dialog.
 */

/**
 * Old-data problems of one item-supplier link, as flagged by the API. They are shown, not fixed:
 * the clean-up belongs to the data migration.
 *
 * @param {{ duplicate: boolean, itemMissing: boolean, supplierMissing: boolean }} link
 * @returns {LinkProblem[]}
 */
export function linkProblems(link) {
  /** @type {LinkProblem[]} */
  const problems = [];
  if (link.duplicate) {
    problems.push({
      id: 'duplicate',
      label: 'Linked twice',
      description:
        'This item and supplier are linked more than once. Keep one link and deactivate the others.',
    });
  }
  if (link.itemMissing) {
    problems.push({
      id: 'itemMissing',
      label: 'Item gone',
      description: 'The item of this link no longer exists. Deactivate the link.',
    });
  }
  if (link.supplierMissing) {
    problems.push({
      id: 'supplierMissing',
      label: 'Supplier gone',
      description: 'The supplier of this link no longer exists. Deactivate the link.',
    });
  }
  return problems;
}

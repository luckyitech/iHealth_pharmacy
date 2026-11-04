/** Longest value shown in a change list before it is cut. */
const MAX_SHOWN = 80;
const EMPTY = '(empty)';
const MASKED = '••••••••';

/**
 * @param {string} text
 * @returns {string}
 */
const shorten = (text) => (text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1)}…` : text);

/**
 * @param {unknown} value
 * @returns {string}
 */
const plain = (value) =>
  value === null || value === undefined || value === '' ? EMPTY : shorten(String(value));

/**
 * @param {HTMLSelectElement} select
 * @param {unknown} value
 * @returns {string}
 */
function optionText(select, value) {
  if (value === null || value === undefined || value === '') return EMPTY;
  const option = [...select.options].find((candidate) => candidate.value === String(value));
  return option ? shorten(option.text) : plain(value);
}

/**
 * A field's label; when another field has the same label (two "Phone" fields), with its section
 * in front, e.g. "Contact person · Phone".
 *
 * @param {HTMLElement} container
 * @param {HTMLElement | null} field
 * @returns {string | null}
 */
function fieldLabel(container, field) {
  if (!field?.id) return null;
  const text = container.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent?.trim();
  if (!text) return null;
  const sameText = [...container.querySelectorAll('label')].filter(
    (label) => label.textContent?.trim() === text,
  );
  if (sameText.length < 2) return text;
  const section = field.closest('section')?.querySelector('h2')?.textContent?.trim();
  return section ? `${section} · ${text}` : text;
}

/**
 * What changed in a form, as "Label: before → after", read from the form itself: each field's
 * label, and the text people see (an option's name, not its id; Yes/No for a tick box).
 * Passwords are never shown.
 *
 * @param {HTMLElement | null} container The form.
 * @param {Record<string, unknown>} before Values when the form was opened.
 * @param {Record<string, unknown>} after Values about to be saved.
 * @returns {import('@/components/feedback/save-confirm-dialog').Change[]}
 */
export function describeChanges(container, before, after) {
  if (!container) return [];
  /** @type {import('@/components/feedback/save-confirm-dialog').Change[]} */
  const changes = [];
  for (const name of Object.keys(after)) {
    const from = before[name];
    const to = after[name];
    if ((from ?? '') === (to ?? '') || String(from ?? '') === String(to ?? '')) continue;

    const field = /** @type {HTMLElement | null} */ (
      container.querySelector(`[name="${CSS.escape(name)}"], [data-field="${CSS.escape(name)}"]`)
    );
    const label = fieldLabel(container, field) || name;

    if (field instanceof HTMLInputElement && field.type === 'password') {
      changes.push({ label, to: MASKED });
    } else if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      changes.push({ label, from: from ? 'Yes' : 'No', to: to ? 'Yes' : 'No' });
    } else if (field instanceof HTMLSelectElement) {
      changes.push({ label, from: optionText(field, from), to: optionText(field, to) });
    } else if (field?.dataset.field) {
      // A searchable picker: its button shows the chosen name.
      changes.push({
        label,
        from: field.dataset.initialLabel || plain(from),
        to: shorten(field.textContent?.trim() || EMPTY),
      });
    } else {
      changes.push({ label, from: plain(from), to: plain(to) });
    }
  }
  return changes;
}

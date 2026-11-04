import { MAX_PAGE_SIZE } from '@ihealth/shared/schemas';

/** Page sizes offered to the user; never more than the API allows. */
export const PAGE_SIZE_OPTIONS = Object.freeze(
  [10, 25, 50, 100].filter((size) => size <= MAX_PAGE_SIZE),
);

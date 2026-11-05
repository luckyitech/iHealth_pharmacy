/** Shared looks of the navigation rows, used by the side panel's list and the phone menu. */

export const NAV_ROW =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none';
export const NAV_ROW_ACTIVE =
  'bg-primary font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground';
export const NAV_HEADING =
  'px-3 pt-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase';

/** @typedef {import('@/app/navigation').NavSubItem} NavSubItem */

/**
 * Pages grouped under their headings, in menu order.
 *
 * @param {ReadonlyArray<NavSubItem>} pages
 * @returns {[group: string, pages: NavSubItem[]][]}
 */
export function byGroup(pages) {
  /** @type {Map<string, NavSubItem[]>} */
  const groups = new Map();
  for (const page of pages) groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  return [...groups];
}

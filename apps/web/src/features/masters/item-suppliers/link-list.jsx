/* eslint-disable jsdoc/reject-any-type -- rows come from the item-supplier API schema */
import { POLICIES } from '@ihealth/shared/permissions';
import { Plus, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/features/auth/use-permissions';
import { useResourceList } from '@/lib/resource-api';
import { cn } from '@/lib/utils';

import { linkProblems } from './link-problems.js';

const PAGE = '/masters/item-suppliers';
/** Links shown in a tab; the full list is one click away. */
const TAB_LIMIT = 50;
const RATE_DECIMALS = 2;

/**
 * @param {'itemId' | 'supplierId'} scope
 * @param {number} id
 * @param {string | number} [edit] A link id, or `new`.
 * @returns {string}
 */
const pageLink = (scope, id, edit) =>
  `${PAGE}?${new URLSearchParams({ [scope]: String(id), status: 'all', ...(edit ? { edit: String(edit) } : {}) })}`;

/**
 * One record's links, from the item's side (its suppliers) or the supplier's (its items).
 *
 * @param {{ scope: 'itemId' | 'supplierId', id: number }} props
 * @returns {React.JSX.Element}
 */
function LinkList({ scope, id }) {
  const byItem = scope === 'itemId';
  // Links are masters data: a supplier editor without "Masters Entry" may look, not add.
  const canWrite = usePermissions().hasAny(POLICIES.masters.write);
  const list = useResourceList('masters/item-suppliers', {
    page: 1,
    pageSize: TAB_LIMIT,
    sort: 'priority',
    q: '',
    filters: { [scope]: String(id), status: 'all' },
  });
  const body = /** @type {{ data?: any[], meta?: { total: number } } | undefined} */ (list.data);
  const rows = body?.data ?? [];
  const total = body?.meta?.total ?? 0;
  const otherName = (/** @type {any} */ row) =>
    byItem ? (row.supplierName ?? 'Supplier gone') : (row.itemName ?? 'Item gone');

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {byItem
            ? 'The suppliers this item is bought from, in priority order.'
            : 'The items bought from this supplier.'}
        </p>
        {canWrite && (
          <Button asChild size="sm" variant="outline">
            <Link to={pageLink(scope, id, 'new')}>
              <Plus aria-hidden="true" />
              {byItem ? 'Add a supplier' : 'Add an item'}
            </Link>
          </Button>
        )}
      </div>

      {list.isPending ? (
        <PageState state="loading" />
      ) : list.error ? (
        <PageState state="error" error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <PageState
          state="empty"
          title={byItem ? 'No suppliers linked yet' : 'No items linked yet'}
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={pageLink(scope, id, row.id)}
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  !row.active && 'text-muted-foreground',
                )}
              >
                <span className="w-6 text-center font-medium tabular-nums" title="Priority">
                  {row.priority ?? '—'}
                </span>
                <span className="min-w-40 flex-1 font-medium">{otherName(row)}</span>
                {linkProblems(row).map((problem) => (
                  <span
                    key={problem.id}
                    className="inline-flex items-center gap-1 text-xs text-destructive"
                  >
                    <TriangleAlert aria-hidden="true" className="size-3" />
                    {problem.label}
                  </span>
                ))}
                <span className="tabular-nums">{row.unitRate.toFixed(RATE_DECIMALS)} per pack</span>
                <span className="tabular-nums">{row.discountPercent}% off</span>
                {!row.active && <span className="text-xs">Inactive</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <Link
          to={pageLink(scope, id)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {total > rows.length ? `See all ${total} links` : 'Open in Item suppliers'}
        </Link>
      )}
    </div>
  );
}

/**
 * @param {{ item: any }} props
 * @returns {React.JSX.Element}
 */
export function ItemSuppliersTab({ item }) {
  return <LinkList scope="itemId" id={item.id} />;
}

/**
 * @param {{ item: any }} props
 * @returns {React.JSX.Element}
 */
export function SupplierItemsTab({ item }) {
  return <LinkList scope="supplierId" id={item.id} />;
}

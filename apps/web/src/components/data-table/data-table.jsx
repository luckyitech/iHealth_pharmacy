/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { PAGE_SIZE_OPTIONS } from './page-sizes.js';

const SKELETON_ROWS = 5;

/**
 * @typedef {object} DataTableColumn
 * @property {string} id API field name; also the sort key when `sortable`.
 * @property {string} header
 * @property {(row: any) => React.ReactNode} cell
 * @property {boolean} [sortable]
 * @property {string} [className] e.g. `text-right tabular-nums` for amounts.
 */

/**
 * @param {string} sort
 * @param {string} column
 * @returns {'ascending' | 'descending' | 'none'}
 */
function sortState(sort, column) {
  if (sort === column) return 'ascending';
  if (sort === `-${column}`) return 'descending';
  return 'none';
}

/**
 * A table whose paging and sorting happen on the server. It owns no data: it renders a page,
 * and reports what the user asked for (another page, size, sort) through callbacks.
 *
 * @param {object} props
 * @param {string} props.caption Accessible name of the table, e.g. "Manufacturers".
 * @param {readonly DataTableColumn[]} props.columns
 * @param {ReadonlyArray<any> | undefined} props.rows
 * @param {{ page: number, pageSize: number, total: number, totalPages: number } | undefined} props.meta
 * @param {string} props.sort
 * @param {(sort: string) => void} props.onSortChange
 * @param {(page: number) => void} props.onPageChange
 * @param {(pageSize: number) => void} props.onPageSizeChange
 * @param {(row: any) => string | number} props.getRowId
 * @param {(row: any) => void} [props.onRowClick] Rows become buttons (Enter/Space) when set.
 * @param {(row: any) => boolean} [props.isRowMuted] e.g. inactive records.
 * @param {boolean} props.isLoading
 * @param {unknown} [props.error]
 * @param {() => void} [props.onRetry]
 * @param {React.ReactNode} props.empty Shown when there are no rows.
 * @returns {React.JSX.Element}
 */
export function DataTable({
  caption,
  columns,
  rows,
  meta,
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  getRowId,
  onRowClick,
  isRowMuted,
  isLoading,
  error,
  onRetry,
  empty,
}) {
  // TanStack Table returns new functions each render; this component does not memoise on them.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: /** @type {any[]} */ (rows ?? []),
    columns: columns.map((column) => ({
      id: column.id,
      header: column.header,
      cell: ({ row }) => column.cell(row.original),
      meta: column,
    })),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    getRowId: (row) => String(getRowId(row)),
  });

  if (error) return <PageState state="error" error={error} onRetry={onRetry} />;

  const toggleSort = (/** @type {string} */ column) => {
    const state = sortState(sort, column);
    onSortChange(state === 'ascending' ? `-${column}` : column);
  };

  const first = meta && meta.total > 0 ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const last = meta ? Math.min(meta.page * meta.pageSize, meta.total) : 0;

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b bg-muted/40 text-left">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const column = /** @type {DataTableColumn} */ (header.column.columnDef.meta);
                  const state = sortState(sort, column.id);
                  const SortIcon =
                    state === 'ascending'
                      ? ArrowUp
                      : state === 'descending'
                        ? ArrowDown
                        : ArrowUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={column.sortable ? state : undefined}
                      className={cn(
                        'px-4 py-2.5 font-medium whitespace-nowrap text-muted-foreground',
                        column.className,
                      )}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.id)}
                          className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          {column.header}
                          <SortIcon
                            aria-hidden="true"
                            className={cn('size-3.5', state === 'none' && 'opacity-40')}
                          />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && !rows
              ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-3">
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    {...(onRowClick
                      ? {
                          tabIndex: 0,
                          role: 'button',
                          onClick: () => onRowClick(row.original),
                          onKeyDown: (/** @type {React.KeyboardEvent} */ event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row.original);
                            }
                          },
                        }
                      : {})}
                    className={cn(
                      'border-b last:border-0',
                      onRowClick &&
                        'cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
                      isRowMuted?.(row.original) && 'text-muted-foreground',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-3',
                          /** @type {DataTableColumn} */ (cell.column.columnDef.meta).className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && rows?.length === 0 && <div className="border-t">{empty}</div>}
      </div>

      {meta && meta.total > 0 && (
        <nav
          aria-label={`${caption} pages`}
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="text-muted-foreground" aria-live="polite">
            {first.toLocaleString()}–{last.toLocaleString()} of {meta.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-muted-foreground">
              Rows
              <NativeSelect
                className="h-9 w-20"
                value={meta.pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="Previous page"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="min-w-16 text-center tabular-nums">
              {meta.page} / {Math.max(meta.totalPages, 1)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="Next page"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

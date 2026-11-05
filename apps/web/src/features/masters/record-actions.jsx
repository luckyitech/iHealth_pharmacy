/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row shapes come from each master's Zod schema */
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSetResourceActive } from '@/lib/resource-api';
import { notify } from '@/lib/notify';

/**
 * The record's secondary actions (deactivate or restore), in a "More" menu so they never sit
 * next to Save.
 *
 * @param {{ config: import('./master-resource-page.jsx').MasterResourceConfig, item: any, onDone: () => void }} props
 * @returns {React.JSX.Element}
 */
export function RecordActionsMenu({ config, item, onDone }) {
  const setActive = useSetResourceActive(config.resource);
  const [confirming, setConfirming] = useState(false);
  const inactive = item.active === false;
  const name = config.recordName(item);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="More actions">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant={inactive ? 'default' : 'destructive'}
            onSelect={() => setConfirming(true)}
          >
            {inactive ? `Restore ${config.singular}` : `Deactivate ${config.singular}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive={!inactive}
        title={inactive ? `Restore ${name}?` : `Deactivate ${name}?`}
        description={
          inactive
            ? 'It will be available again everywhere it is used.'
            : 'It will no longer be offered for new transactions. Its history stays, and you can restore it later.'
        }
        confirmLabel={inactive ? 'Restore' : 'Deactivate'}
        onConfirm={async () => {
          await setActive.mutateAsync({ id: item.id, active: inactive });
          if (inactive) notify.success(`"${name}" restored`);
          else
            notify.success(`"${name}" deactivated`, {
              action: {
                label: 'Undo',
                onClick: () =>
                  setActive.mutate(
                    { id: item.id, active: true },
                    {
                      onSuccess: () => notify.success(`"${name}" restored`),
                      onError: (error) => notify.error(error),
                    },
                  ),
              },
            });
          onDone();
        }}
      />
    </>
  );
}

/**
 * "Active" or "Inactive", quiet and without colour fills.
 *
 * @param {{ active: boolean }} props
 * @returns {React.JSX.Element}
 */
export function StatusBadge({ active }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <span
        aria-hidden="true"
        className={
          active
            ? 'size-1.5 rounded-full bg-primary'
            : 'size-1.5 rounded-full bg-muted-foreground/50'
        }
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

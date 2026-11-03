import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { errorMessage, isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/**
 * @typedef {object} PageStateProps
 * @property {'loading' | 'empty' | 'error'} state
 * @property {string} [title]
 * @property {React.ReactNode} [description]
 * @property {unknown} [error] For `error`: shown in a user-safe way, with the request id when there is one.
 * @property {() => void} [onRetry] For `error`: shows a "Try again" button.
 * @property {React.ReactNode} [action] For `empty`: e.g. a "New ..." button.
 * @property {string} [className]
 */

const DEFAULT_TITLES = Object.freeze({
  loading: 'Loading…',
  empty: 'Nothing here yet',
  error: 'Something went wrong',
});

/**
 * One consistent loading, empty and error state for every screen.
 *
 * @param {PageStateProps} props
 * @returns {React.JSX.Element}
 */
export function PageState({ state, title, description, error, onRetry, action, className }) {
  const Icon = state === 'loading' ? Loader2 : state === 'error' ? AlertTriangle : Inbox;
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <div
      role={state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={state === 'loading'}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-10',
          state === 'loading' && 'animate-spin text-primary',
          state === 'error' && 'text-destructive',
          state === 'empty' && 'text-muted-foreground',
        )}
      />
      <h2 className="text-lg font-semibold">{title ?? DEFAULT_TITLES[state]}</h2>
      {(description || (state === 'error' && error !== undefined)) && (
        <p className="max-w-md text-sm text-muted-foreground">
          {description ?? errorMessage(error)}
        </p>
      )}
      {requestId && <p className="text-xs text-muted-foreground">Reference: {requestId}</p>}
      {state === 'error' && onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      )}
      {state === 'empty' && action}
    </div>
  );
}

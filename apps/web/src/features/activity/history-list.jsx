import { PageState } from '@/components/feedback/page-state';
import { useFormat } from '@/lib/format';

import { useHistory } from './activity-api.js';
import { ACTIVITY_TITLES, describeActivity } from './activity-labels.js';

/**
 * A record's History: each step with who did it and when, as the server recorded them.
 *
 * @param {object} props
 * @param {string} props.path The API's `.../history` path.
 * @param {string} [props.title]
 * @param {string} [props.empty] Said when there is nothing yet.
 * @param {(entry: import('@ihealth/shared/schemas').ActivityEntry) => boolean} [props.filter]
 * @returns {React.JSX.Element}
 */
export function HistoryList({ path, title = 'History', empty = 'Nothing recorded yet.', filter }) {
  const history = useHistory(path);
  const format = useFormat();
  const id = `history-${path.replaceAll('/', '-')}`;
  const entries = (history.data ?? []).filter((entry) => !filter || filter(entry));

  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      {history.isPending ? (
        <PageState state="loading" title="Loading the history…" />
      ) : history.isError ? (
        <PageState state="error" error={history.error} onRetry={() => void history.refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="ml-1.5 grid gap-0 border-l-2 border-border pl-4 text-sm">
          {entries.map((entry) => {
            const detail = describeActivity(entry, format);
            return (
              <li key={entry.id} className="relative grid gap-0.5 pb-3 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-primary bg-background"
                />
                <span className="font-medium">{ACTIVITY_TITLES[entry.action] ?? entry.action}</span>
                <span className="text-muted-foreground">
                  {entry.by ?? 'Unknown'} ·{' '}
                  <time dateTime={entry.at}>{format.instant(entry.at)}</time>
                </span>
                {detail && <span>{detail}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

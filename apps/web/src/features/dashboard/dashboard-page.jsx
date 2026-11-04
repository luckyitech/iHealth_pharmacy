import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

import { visibleNavItems } from '@/app/navigation';
import { useAppInfo } from '@/app/use-app-info';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/use-auth';
import { usePermissions } from '@/features/auth/use-permissions';

const NOON = 12;
const EVENING = 17;

/**
 * @param {Date} date
 * @param {{ locale: string, timeZone: string } | undefined} region Browser defaults until app info loads.
 * @returns {string}
 */
function greeting(date, region) {
  const hour = Number(
    new Intl.DateTimeFormat(region?.locale, {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: region?.timeZone,
    }).format(date),
  );
  if (hour < NOON) return 'Good morning';
  if (hour < EVENING) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Landing page after sign-in: a greeting and shortcuts to the modules this user can open.
 *
 * @returns {React.JSX.Element}
 */
export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { hasAny } = usePermissions();
  const modules = visibleNavItems(hasAny).filter((item) => item.id !== 'dashboard');
  const now = new Date();
  const region = useAppInfo().data?.region;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting(now, region)}, {user?.firstName}
        </h1>
        <p className="text-muted-foreground">
          {new Intl.DateTimeFormat(region?.locale, {
            dateStyle: 'full',
            timeZone: region?.timeZone,
          }).format(now)}
        </p>
      </div>

      {modules.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
              No modules assigned yet
            </CardTitle>
            <CardDescription>
              Ask your administrator to grant you access to the parts of the system you need.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section aria-labelledby="modules-heading" className="grid gap-3">
          <h2 id="modules-heading" className="text-sm font-medium text-muted-foreground">
            Your modules
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.path}
                  className="block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <item.icon aria-hidden="true" className="size-5 text-primary" />
                        {item.label}
                      </CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

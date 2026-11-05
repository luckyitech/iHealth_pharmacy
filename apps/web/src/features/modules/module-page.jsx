import { Construction } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermissions } from '@/features/auth/use-permissions';

/**
 * Placeholder for a module that is rebuilt in a later phase. It lists the functions the user
 * already has access to, which doubles as a check that their permissions came across correctly.
 *
 * @param {{ item: import('@/app/navigation').NavItem }} props
 * @returns {React.JSX.Element}
 */
export default function ModulePage({ item }) {
  const { has } = usePermissions();
  const granted = item.permissions.filter((permission) => has(permission));

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <item.icon aria-hidden="true" className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{item.label}</h1>
          <p className="text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction aria-hidden="true" className="size-5 text-warning" />
            Coming soon
          </CardTitle>
          <CardDescription>
            This module is being rebuilt. Until it is ready, keep using the current system for these
            tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h2 className="mb-2 text-sm font-medium">
            Your access in this module ({granted.length})
          </h2>
          <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            {granted.map((permission) => (
              <li key={permission.id}>{permission.name}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

import { KeyRound, LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CHANGE_PASSWORD_PATH } from '@/features/auth/route-guards';
import { useCurrentUser, useLogout } from '@/features/auth/use-auth';
import { notify } from '@/lib/notify';
import { REDUCE_EFFECTS_ATTRIBUTE, useEffectsStore } from '@/stores/effects-store';

/**
 * @param {{ firstName: string, lastName: string }} user
 * @returns {string}
 */
const initialsOf = ({ firstName, lastName }) =>
  `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

/**
 * @returns {React.JSX.Element | null}
 */
export function UserMenu() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const reduced = useEffectsStore((state) => (user ? state.reducedBy[user.employeeId] : false));
  const setReduced = useEffectsStore((state) => state.setReduced);

  // The signed-in person's choice applies to the whole page, and ends when they sign out.
  useEffect(() => {
    document.documentElement.toggleAttribute(REDUCE_EFFECTS_ATTRIBUTE, Boolean(reduced));
    return () => document.documentElement.removeAttribute(REDUCE_EFFECTS_ATTRIBUTE);
  }, [reduced]);

  if (!user) return null;

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
      onError: (error) => {
        notify.error(error);
        navigate('/login', { replace: true });
      },
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 px-2"
          aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initialsOf(user)}
          </span>
          <span className="hidden text-sm font-medium sm:inline">{user.firstName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-muted-foreground">{user.username}</p>
          {user.roles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {user.roles
                .map((role) => role.name)
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={Boolean(reduced)}
          onCheckedChange={(checked) => setReduced(user.employeeId, checked)}
        >
          Reduce effects
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(CHANGE_PASSWORD_PATH)}>
          <KeyRound aria-hidden="true" />
          Change password
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut} disabled={logout.isPending}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

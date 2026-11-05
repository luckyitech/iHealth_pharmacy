/* eslint-disable jsdoc/reject-any-type -- the record comes from the generic master dialog */
import { groupPermissions } from '@ihealth/shared/permissions';
import {
  employeePasswordFormSchema,
  employeeRoleBodySchema,
  MIN_NEW_PASSWORD_LENGTH,
  newLoginFormSchema,
  twoFactorResetBodySchema,
  usernameSchema,
} from '@ihealth/shared/schemas';
import { Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormLayoutContext } from '@/components/form/form-layout';
import { FormField } from '@/components/form/form-field';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { PageState } from '@/components/feedback/page-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/use-auth';
import { errorMessage } from '@/lib/api-error';

import { useAccessAction, useEmployeeAccess, useRoles } from './access-api.js';

const PERMISSION_GROUPS = [...groupPermissions()].filter(([, permissions]) =>
  permissions.some((permission) => permission.active),
);

const PASSWORD_HINT = `At least ${MIN_NEW_PASSWORD_LENGTH} characters, not their username or email.`;

/**
 * Shows a failed action next to its fields when it is about them, as a message otherwise.
 *
 * @param {unknown} error
 * @param {import('react-hook-form').UseFormSetError<any>} [setError]
 * @returns {void}
 */
function reportError(error, setError) {
  if (setError && applyServerErrors(error, setError)) return;
  toast.error(errorMessage(error));
}

/**
 * @param {{ label: string, tone?: 'default' | 'warning' }} props
 * @returns {React.JSX.Element}
 */
function Status({ label, tone = 'default' }) {
  return (
    <span
      className={
        tone === 'warning'
          ? 'rounded-full border border-destructive/40 px-2 py-0.5 text-xs font-medium text-destructive'
          : 'rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {label}
    </span>
  );
}

/**
 * An employee's sign-in and access, edited action by action (each saves on its own): the sign-in,
 * a new password, two-factor reset, the role and the individual permissions.
 *
 * @param {{ item: any, canWrite: boolean }} props
 * @returns {React.JSX.Element}
 */
export function EmployeeAccessPanel({ item, canWrite }) {
  const access = useEmployeeAccess(item.id);
  const { data: user } = useCurrentUser();
  const self = user?.employeeId === item.id;
  const editable = canWrite && !self;

  if (access.isPending) return <PageState state="loading" title="Loading sign-in and access…" />;
  if (access.isError)
    return <PageState state="error" error={access.error} onRetry={() => void access.refetch()} />;

  const data = access.data;
  return (
    <FormLayoutContext.Provider value="card">
      <div className="grid gap-5">
        {self && (
          <Alert>
            <AlertDescription>
              This is your own account. Another administrator has to change your sign-in, role or
              permissions; you can change your password from your profile.
            </AlertDescription>
          </Alert>
        )}
        <SignInSection employeeId={item.id} access={data} editable={editable} />
        {data.hasLogin && <PasswordSection employeeId={item.id} editable={editable} />}
        {data.twoFactorEnabled && <TwoFactorSection employeeId={item.id} editable={editable} />}
        <RoleSection employeeId={item.id} access={data} editable={editable} />
        <PermissionsSection employeeId={item.id} access={data} editable={editable} />
      </div>
    </FormLayoutContext.Provider>
  );
}

/**
 * @param {{ employeeId: number, access: import('./access-api.js').EmployeeAccess, editable: boolean }} props
 * @returns {React.JSX.Element}
 */
function SignInSection({ employeeId, access, editable }) {
  const saveLogin = useAccessAction(employeeId, 'put', 'login');
  const setStatus = useAccessAction(employeeId, 'put', 'status');
  const unlock = useAccessAction(employeeId, 'post', 'unlock');
  const [confirmingOff, setConfirmingOff] = useState(false);
  const renameForm = useZodForm(z.object({ username: usernameSchema }), {
    defaultValues: { username: access.username ?? '' },
  });
  const createForm = useZodForm(newLoginFormSchema, {
    defaultValues: { username: '', password: '', confirmPassword: '', mustChangePassword: true },
  });

  if (!access.hasLogin) {
    const onCreate = createForm.handleSubmit(({ username, password, mustChangePassword }) =>
      saveLogin.mutate(
        { username, password, mustChangePassword },
        {
          onSuccess: () => toast.success('Sign-in created'),
          onError: (error) => reportError(error, createForm.setError),
        },
      ),
    );
    return (
      <FormSection
        title="Sign-in"
        description="This employee cannot sign in yet. Give them a username and a first password."
      >
        <form noValidate onSubmit={onCreate} className="grid gap-4">
          <fieldset disabled={!editable || saveLogin.isPending} className="grid gap-4">
            <TextField form={createForm} name="username" label="Username" autoComplete="off" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                form={createForm}
                name="password"
                label="First password"
                type="password"
                autoComplete="new-password"
                hint={PASSWORD_HINT}
              />
              <TextField
                form={createForm}
                name="confirmPassword"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
              />
            </div>
            <CheckboxField
              label="Must choose their own password at first sign-in"
              {...createForm.register('mustChangePassword')}
            />
            <div>
              <Button type="submit">
                {saveLogin.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                Create sign-in
              </Button>
            </div>
          </fieldset>
        </form>
      </FormSection>
    );
  }

  const onRename = renameForm.handleSubmit(({ username }) =>
    saveLogin.mutate(
      { username },
      {
        onSuccess: () => toast.success('Username changed'),
        onError: (error) => reportError(error, renameForm.setError),
      },
    ),
  );
  const lockedUntil = access.lockedUntil ? new Date(access.lockedUntil) : null;

  return (
    <FormSection title="Sign-in">
      <div className="flex flex-wrap items-center gap-2">
        <Status label={access.loginEnabled ? 'Sign-in on' : 'Sign-in off'} />
        {access.mustChangePassword && <Status label="Must change password at next sign-in" />}
        {lockedUntil && (
          <Status
            tone="warning"
            label={`Locked after wrong passwords, until ${lockedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          />
        )}
      </div>
      <form noValidate onSubmit={onRename} className="flex flex-wrap items-end gap-3">
        <fieldset disabled={!editable || saveLogin.isPending} className="contents">
          <TextField
            form={renameForm}
            name="username"
            label="Username"
            autoComplete="off"
            className="min-w-56 flex-1"
          />
          <Button type="submit" variant="outline">
            Save username
          </Button>
        </fieldset>
      </form>
      {editable && (
        <div className="flex flex-wrap gap-2">
          {lockedUntil && (
            <Button
              type="button"
              variant="outline"
              disabled={unlock.isPending}
              onClick={() =>
                unlock.mutate(undefined, {
                  onSuccess: () => toast.success('Unlocked'),
                  onError: (error) => reportError(error),
                })
              }
            >
              Unlock now
            </Button>
          )}
          {access.loginEnabled ? (
            <Button type="button" variant="outline" onClick={() => setConfirmingOff(true)}>
              Turn sign-in off
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate(
                  { enabled: true },
                  {
                    onSuccess: () => toast.success('Sign-in turned on'),
                    onError: (error) => reportError(error),
                  },
                )
              }
            >
              Turn sign-in on
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmingOff}
        onOpenChange={setConfirmingOff}
        destructive
        title="Turn sign-in off?"
        description="They are signed out everywhere at once and cannot sign in until it is turned on again. Their records stay."
        confirmLabel="Turn sign-in off"
        onConfirm={async () => {
          await setStatus.mutateAsync({ enabled: false });
          toast.success('Sign-in turned off');
        }}
      />
    </FormSection>
  );
}

/**
 * @param {{ employeeId: number, editable: boolean }} props
 * @returns {React.JSX.Element}
 */
function PasswordSection({ employeeId, editable }) {
  const setPassword = useAccessAction(employeeId, 'put', 'password');
  const form = useZodForm(employeePasswordFormSchema, {
    defaultValues: { password: '', confirmPassword: '', mustChangePassword: true },
  });
  const onSubmit = form.handleSubmit(({ password, mustChangePassword }) =>
    setPassword.mutate(
      { password, mustChangePassword },
      {
        onSuccess: () => {
          toast.success('Password set. They have been signed out everywhere.');
          form.reset();
        },
        onError: (error) => reportError(error, form.setError),
      },
    ),
  );
  return (
    <FormSection
      title="Password"
      description="Set a new password, for example when they have forgotten theirs. Tell it to them in person."
    >
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <fieldset disabled={!editable || setPassword.isPending} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              name="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              hint={PASSWORD_HINT}
            />
            <TextField
              form={form}
              name="confirmPassword"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
            />
          </div>
          <CheckboxField
            label="Must choose their own password at next sign-in"
            {...form.register('mustChangePassword')}
          />
          <div>
            <Button type="submit" variant="outline">
              {setPassword.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              Set password
            </Button>
          </div>
        </fieldset>
      </form>
    </FormSection>
  );
}

/**
 * @param {{ employeeId: number, editable: boolean }} props
 * @returns {React.JSX.Element}
 */
function TwoFactorSection({ employeeId, editable }) {
  const reset = useAccessAction(employeeId, 'post', 'reset-two-factor');
  const form = useZodForm(twoFactorResetBodySchema, { defaultValues: { reason: '' } });
  const onSubmit = form.handleSubmit((values) =>
    reset.mutate(values, {
      onSuccess: () => toast.success('Two-factor sign-in turned off'),
      onError: (error) => reportError(error, form.setError),
    }),
  );
  return (
    <FormSection
      title="Two-factor sign-in"
      description="On for this employee. Reset it when they can no longer receive their codes; their trusted devices are forgotten."
    >
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <fieldset disabled={!editable || reset.isPending} className="grid gap-4">
          <FormField
            form={/** @type {any} */ (form)}
            name="reason"
            label="Reason"
            error={form.formState.errors.reason?.message}
          >
            {(control) => <Textarea {...control} rows={2} {...form.register('reason')} />}
          </FormField>
          <div>
            <Button type="submit" variant="outline">
              Reset two-factor sign-in
            </Button>
          </div>
        </fieldset>
      </form>
    </FormSection>
  );
}

/**
 * @param {{ employeeId: number, access: import('./access-api.js').EmployeeAccess, editable: boolean }} props
 * @returns {React.JSX.Element}
 */
function RoleSection({ employeeId, access, editable }) {
  const roles = useRoles();
  const setRole = useAccessAction(employeeId, 'put', 'role');
  const form = useZodForm(employeeRoleBodySchema, {
    defaultValues: { roleId: /** @type {any} */ (access.roleId ?? '') },
  });
  const onSubmit = form.handleSubmit((values) =>
    setRole.mutate(values, {
      onSuccess: () => toast.success('Role saved'),
      onError: (error) => reportError(error, form.setError),
    }),
  );
  return (
    <FormSection
      title="Role"
      description="The role gives a set of permissions. Individual permissions below are added to it."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <fieldset disabled={!editable || setRole.isPending} className="contents">
          <div className="min-w-56 flex-1">
            <SelectField
              form={form}
              name="roleId"
              label="Role"
              emptyLabel="Choose a role"
              loading={roles.isPending}
              options={(roles.data ?? []).map((role) => ({ value: role.id, label: role.name }))}
              selectedLabel={access.roleName}
            />
          </div>
          <Button type="submit" variant="outline">
            Save role
          </Button>
        </fieldset>
      </form>
    </FormSection>
  );
}

/**
 * @param {{ employeeId: number, access: import('./access-api.js').EmployeeAccess, editable: boolean }} props
 * @returns {React.JSX.Element}
 */
function PermissionsSection({ employeeId, access, editable }) {
  const save = useAccessAction(employeeId, 'put', 'permissions');
  const [selected, setSelected] = useState(() => new Set(access.permissionIds));
  const [filter, setFilter] = useState('');
  const fromRole = useMemo(() => new Set(access.rolePermissionIds), [access.rolePermissionIds]);
  const saved = new Set(access.permissionIds);
  const changed = selected.size !== saved.size || [...selected].some((id) => !saved.has(id));
  const query = filter.trim().toLowerCase();

  /**
   * @param {number} id
   * @returns {void}
   */
  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <FormSection
      title="Permissions"
      description="What this employee may do besides their role. Permissions that come with the role are ticked and greyed."
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Find a permission"
          placeholder="Find a permission"
          className="pl-9"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {PERMISSION_GROUPS.map(([group, permissions]) => {
          const shown = permissions.filter(
            (permission) =>
              permission.active &&
              (!query || `${group} ${permission.name}`.toLowerCase().includes(query)),
          );
          if (!shown.length) return null;
          return (
            <fieldset key={group} className="grid content-start gap-2">
              <legend className="mb-1 text-sm font-semibold">{group}</legend>
              {shown.map((permission) => {
                const viaRole = fromRole.has(permission.id);
                return (
                  <CheckboxField
                    key={permission.id}
                    label={permission.name}
                    description={viaRole ? 'Comes with the role' : undefined}
                    checked={viaRole || selected.has(permission.id)}
                    disabled={!editable || viaRole}
                    onChange={() => toggle(permission.id)}
                  />
                );
              })}
            </fieldset>
          );
        })}
      </div>
      {editable && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          {changed && <p className="mr-auto text-sm text-muted-foreground">Unsaved changes</p>}
          <Button
            type="button"
            variant="outline"
            disabled={!changed || save.isPending}
            onClick={() => setSelected(new Set(access.permissionIds))}
          >
            Undo
          </Button>
          <Button
            type="button"
            disabled={!changed || save.isPending}
            onClick={() =>
              save.mutate(
                { permissionIds: [...selected] },
                {
                  onSuccess: () => toast.success('Permissions saved'),
                  onError: (error) => reportError(error),
                },
              )
            }
          >
            {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            Save permissions
          </Button>
        </div>
      )}
    </FormSection>
  );
}

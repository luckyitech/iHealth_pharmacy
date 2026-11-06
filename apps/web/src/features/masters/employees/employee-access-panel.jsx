/* eslint-disable jsdoc/reject-any-type -- the record comes from the generic master dialog */
import { getPermissionById, groupPermissions } from '@ihealth/shared/permissions';
import {
  employeePasswordFormSchema,
  employeeRoleBodySchema,
  MIN_NEW_PASSWORD_LENGTH,
  newLoginFormSchema,
  twoFactorResetBodySchema,
  usernameSchema,
} from '@ihealth/shared/schemas';
import { Loader2, Search } from 'lucide-react';
import { createContext, useContext, useMemo, useState } from 'react';
import { z } from 'zod';

import { FormLayoutContext } from '@/components/form/form-layout';
import { FormField } from '@/components/form/form-field';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { PageState } from '@/components/feedback/page-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/use-auth';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/notify';

import { useAccessAction, useEmployeeAccess, useRoles } from './access-api.js';

const PERMISSION_GROUPS = [...groupPermissions()].filter(([, permissions]) =>
  permissions.some((permission) => permission.active),
);

/**
 * @param {number[]} ids
 * @returns {string} e.g. "Masters View, Sales Billing Submission"
 */
const permissionNames = (ids) =>
  ids.map((id) => getPermissionById(id)?.name ?? `#${id}`).join(', ');

const PASSWORD_HINT = `At least ${MIN_NEW_PASSWORD_LENGTH} characters, not their username or email.`;

/**
 * Every access action asks first (it can be clicked by mistake); the panel provides the question.
 *
 * @type {React.Context<(request: import('@/components/feedback/save-confirm-dialog').ConfirmRequest) => void>}
 */
const AskContext = createContext(
  /** @type {(request: import('@/components/feedback/save-confirm-dialog').ConfirmRequest) => void} */ (
    () => {}
  ),
);

/**
 * The confirmation's action: runs the request, puts a field error on its field (and closes the
 * question), and lets any other error show in the question.
 *
 * @param {ReturnType<typeof useAccessAction>} action
 * @param {Record<string, unknown> | void} body
 * @param {{ success: string, setError?: import('react-hook-form').UseFormSetError<any>, after?: () => void }} options
 * @returns {() => Promise<void>}
 */
const run =
  (action, body, { success, setError, after }) =>
  async () => {
    try {
      await action.mutateAsync(body);
    } catch (error) {
      if (setError && applyServerErrors(error, setError)) return;
      throw error;
    }
    notify.success(success);
    after?.();
  };

/** How a password appears in a confirmation. */
const MASKED_PASSWORD = '••••••••';

/**
 * @param {boolean} value
 * @returns {string}
 */
const yesNo = (value) => (value ? 'Yes' : 'No');

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
  const confirmation = useConfirm();

  if (access.isPending) return <PageState state="loading" title="Loading sign-in and access…" />;
  if (access.isError)
    return <PageState state="error" error={access.error} onRetry={() => void access.refetch()} />;

  const data = access.data;
  return (
    <FormLayoutContext.Provider value="card">
      <AskContext.Provider value={confirmation.ask}>
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
        {confirmation.dialog}
      </AskContext.Provider>
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
  const ask = useContext(AskContext);
  const renameForm = useZodForm(z.object({ username: usernameSchema }), {
    defaultValues: { username: access.username ?? '' },
  });
  const createForm = useZodForm(newLoginFormSchema, {
    defaultValues: { username: '', password: '', confirmPassword: '', mustChangePassword: true },
  });

  if (!access.hasLogin) {
    const onCreate = createForm.handleSubmit(({ username, password, mustChangePassword }) =>
      ask({
        title: 'Create this sign-in?',
        changes: [
          { label: 'Username', to: username },
          { label: 'First password', to: MASKED_PASSWORD },
          { label: 'Must choose their own password', to: yesNo(mustChangePassword) },
        ],
        confirmLabel: 'Create sign-in',
        onConfirm: run(
          saveLogin,
          { username, password, mustChangePassword },
          { success: 'Sign-in created', setError: createForm.setError },
        ),
      }),
    );
    return (
      <FormSection
        title="Sign-in"
        description="This employee cannot sign in yet. Give them a username and a first password."
      >
        <form noValidate onSubmit={onCreate} className="grid gap-4">
          <fieldset disabled={!editable || saveLogin.isPending} className="grid gap-4">
            <TextField form={createForm} name="username" label="Username" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                form={createForm}
                name="password"
                label="First password"
                type="password"
                hint={PASSWORD_HINT}
              />
              <TextField
                form={createForm}
                name="confirmPassword"
                label="Confirm password"
                type="password"
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
    ask({
      title: 'Change the username?',
      description: 'They sign in with the new username from now on.',
      changes: [{ label: 'Username', from: access.username ?? '', to: username }],
      confirmLabel: 'Change username',
      onConfirm: run(
        saveLogin,
        { username },
        { success: 'Username changed', setError: renameForm.setError },
      ),
    }),
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
                ask({
                  title: 'Unlock this account?',
                  description: 'They can try their password again straight away.',
                  confirmLabel: 'Unlock',
                  onConfirm: run(unlock, undefined, { success: 'Unlocked' }),
                })
              }
            >
              Unlock now
            </Button>
          )}
          {access.loginEnabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                ask({
                  title: 'Turn sign-in off?',
                  description:
                    'They are signed out everywhere at once and cannot sign in until it is turned on again. Their records stay.',
                  destructive: true,
                  confirmLabel: 'Turn sign-in off',
                  onConfirm: run(setStatus, { enabled: false }, { success: 'Sign-in turned off' }),
                })
              }
            >
              Turn sign-in off
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() =>
                ask({
                  title: 'Turn sign-in on?',
                  description: 'They can sign in again with their password.',
                  confirmLabel: 'Turn sign-in on',
                  onConfirm: run(setStatus, { enabled: true }, { success: 'Sign-in turned on' }),
                })
              }
            >
              Turn sign-in on
            </Button>
          )}
        </div>
      )}
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
  const ask = useContext(AskContext);
  const onSubmit = form.handleSubmit(({ password, mustChangePassword }) =>
    ask({
      title: 'Set a new password?',
      description: 'They are signed out everywhere and sign in with the new password.',
      changes: [
        { label: 'Password', to: MASKED_PASSWORD },
        { label: 'Must choose their own at next sign-in', to: yesNo(mustChangePassword) },
      ],
      confirmLabel: 'Set password',
      onConfirm: run(
        setPassword,
        { password, mustChangePassword },
        {
          success: 'Password set. They have been signed out everywhere.',
          setError: form.setError,
          after: () => form.reset(),
        },
      ),
    }),
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
              hint={PASSWORD_HINT}
            />
            <TextField
              form={form}
              name="confirmPassword"
              label="Confirm password"
              type="password"
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
  const ask = useContext(AskContext);
  const onSubmit = form.handleSubmit((values) =>
    ask({
      title: 'Reset two-factor sign-in?',
      description: 'It is turned off and their trusted devices are forgotten.',
      changes: [{ label: 'Reason', to: values.reason }],
      destructive: true,
      confirmLabel: 'Reset two-factor sign-in',
      onConfirm: run(reset, values, {
        success: 'Two-factor sign-in turned off',
        setError: form.setError,
      }),
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
  const ask = useContext(AskContext);
  const onSubmit = form.handleSubmit((values) => {
    const name = (/** @type {number} */ id) =>
      roles.data?.find((role) => role.id === id)?.name ?? `#${id}`;
    ask({
      title: 'Change the role?',
      description: 'Their permissions change with it.',
      changes: [
        {
          label: 'Role',
          from: access.roleId ? (access.roleName ?? name(access.roleId)) : '(none)',
          to: name(values.roleId),
        },
      ],
      confirmLabel: 'Save role',
      onConfirm: run(setRole, values, { success: 'Role saved', setError: form.setError }),
    });
  });
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
  const ask = useContext(AskContext);
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
            onClick={() => {
              const added = [...selected].filter((id) => !saved.has(id));
              const removed = [...saved].filter((id) => !selected.has(id));
              ask({
                title: 'Save these permission changes?',
                changes: [
                  ...(added.length
                    ? [{ label: `Added (${added.length})`, to: permissionNames(added) }]
                    : []),
                  ...(removed.length
                    ? [{ label: `Removed (${removed.length})`, to: permissionNames(removed) }]
                    : []),
                ],
                confirmLabel: 'Save permissions',
                onConfirm: run(
                  save,
                  { permissionIds: [...selected] },
                  { success: 'Permissions saved' },
                ),
              });
            }}
          >
            {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            Save permissions
          </Button>
        </div>
      )}
    </FormSection>
  );
}

import { changePasswordFormSchema, MIN_NEW_PASSWORD_LENGTH } from '@ihealth/shared/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';

import { TextField } from '@/components/form/text-field';
import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api-error';
import { notify } from '@/lib/notify';

import { changePassword } from './auth-api.js';
import { AuthLayout } from './auth-layout.jsx';
import { CURRENT_USER_KEY, useCurrentUser, useLogout } from './use-auth.js';

/**
 * Change your own password. People whose administrator set a temporary password land here, and
 * nothing else works until they have chosen their own.
 *
 * @returns {React.JSX.Element}
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const required = Boolean(user?.mustChangePassword);
  const form = useZodForm(changePasswordFormSchema, {
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const change = useMutation({
    mutationFn: changePassword,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
      notify.success('Password changed');
      navigate(searchParams.get('redirect') || '/', { replace: true });
    },
    onError: (error) => applyServerErrors(error, form.setError),
  });

  const onSubmit = form.handleSubmit(({ currentPassword, newPassword }) =>
    change.mutate({ currentPassword, newPassword }),
  );
  const fieldErrorOnly = change.isError && applyServerErrors(change.error, () => {});

  return (
    <AuthLayout
      title={required ? 'Choose a new password' : 'Change your password'}
      description={
        required
          ? 'Your administrator set a temporary password. Choose your own to continue.'
          : 'Other devices signed in to your account will be signed out.'
      }
    >
      <form className="grid gap-5" noValidate onSubmit={onSubmit}>
        {change.isError && !fieldErrorOnly && <FormError>{errorMessage(change.error)}</FormError>}
        <TextField
          form={form}
          name="currentPassword"
          label={required ? 'Temporary password' : 'Current password'}
          type="password"
        />
        <TextField
          form={form}
          name="newPassword"
          label="New password"
          type="password"
          hint={`At least ${MIN_NEW_PASSWORD_LENGTH} characters, not your username or email.`}
        />
        <TextField
          form={form}
          name="confirmPassword"
          label="Confirm new password"
          type="password"
        />
        <Button type="submit" disabled={change.isPending}>
          {change.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          Change password
        </Button>
        {required && (
          <Button type="button" variant="ghost" onClick={() => logout.mutate()}>
            Sign out instead
          </Button>
        )}
      </form>
    </AuthLayout>
  );
}

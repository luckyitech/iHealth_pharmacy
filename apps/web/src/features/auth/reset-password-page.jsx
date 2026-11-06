import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES } from '@ihealth/shared/error-codes';
import { MIN_NEW_PASSWORD_LENGTH, resetPasswordFormSchema } from '@ihealth/shared/schemas';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { requiredFieldsOf } from '@/components/form/use-zod-form';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, isApiError } from '@/lib/api-error';

import { resetPassword } from './auth-api.js';
import { AUTH_LINK_CLASS, AuthLayout } from './auth-layout.jsx';

const PASSWORD_HINT_ID = 'password-hint';

const REQUIRED = requiredFieldsOf(resetPasswordFormSchema);
/**
 * @param {unknown} error
 * @returns {boolean}
 */
const isInvalidLink = (error) =>
  isApiError(error) && error.code === ERROR_CODES.RESET_TOKEN_INVALID;

/**
 * Sets a new password from the emailed link (`?token=...`), then returns to sign in.
 *
 * @returns {React.JSX.Element}
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const [showPasswords, setShowPasswords] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const reset = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => navigate('/login?reset=done', { replace: true }),
    onError: (error) => {
      // The API also refuses a password equal to the username or email; show that on the field.
      const detail = isApiError(error)
        ? error.details?.find((d) => d.path === 'body.password')
        : undefined;
      if (detail) setError('password', { message: detail.message });
    },
  });

  if (!token) {
    return (
      <AuthLayout
        title="Reset link missing"
        description="Open the link from your email again, or request a new one."
      >
        <p className="text-sm">
          <Link to="/forgot-password" className={AUTH_LINK_CLASS}>
            Request a new reset link
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(({ password }) => reset.mutate({ token, password }));
  const fieldError = reset.isError && isApiError(reset.error) && reset.error.details?.length;

  return (
    <AuthLayout
      title="Choose a new password"
      description="This ends any session that is still signed in."
    >
      <form className="grid gap-5" noValidate onSubmit={onSubmit}>
        {reset.isError && !fieldError && (
          <FormError>
            {errorMessage(reset.error)}{' '}
            {isInvalidLink(reset.error) && (
              <Link to="/forgot-password" className={AUTH_LINK_CLASS}>
                Request a new link
              </Link>
            )}
          </FormError>
        )}

        <div className="grid gap-2">
          <Label htmlFor="password" required={REQUIRED.has('password')}>
            New password
          </Label>
          <div className="relative">
            <Input
              id="password"
              aria-required={REQUIRED.has('password') || undefined}
              type={showPasswords ? 'text' : 'password'}
              className="pr-11"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : PASSWORD_HINT_ID}
              {...register('password')}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 text-muted-foreground hover:bg-transparent"
              aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
              aria-pressed={showPasswords}
              onClick={() => setShowPasswords((shown) => !shown)}
            >
              {showPasswords ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          {errors.password ? (
            <p id="password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : (
            <p id={PASSWORD_HINT_ID} className="text-sm text-muted-foreground">
              At least {MIN_NEW_PASSWORD_LENGTH} characters, and not your username or email.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword" required={REQUIRED.has('confirmPassword')}>
            Confirm new password
          </Label>
          <Input
            id="confirmPassword"
            aria-required={REQUIRED.has('confirmPassword') || undefined}
            type={showPasswords ? 'text' : 'password'}
            aria-invalid={errors.confirmPassword ? true : undefined}
            aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p id="confirm-error" className="text-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" className="mt-1 w-full" disabled={reset.isPending}>
          {reset.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {reset.isPending ? 'Saving…' : 'Change password'}
        </Button>

        <p className="text-sm text-muted-foreground">
          <Link to="/login" className={AUTH_LINK_CLASS}>
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

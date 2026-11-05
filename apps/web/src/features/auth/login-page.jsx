import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES } from '@ihealth/shared/error-codes';
import { loginBodySchema } from '@ihealth/shared/schemas';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { requiredFieldsOf } from '@/components/form/use-zod-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, isApiError } from '@/lib/api-error';
import { notify } from '@/lib/notify';

import { AUTH_LINK_CLASS, AuthLayout } from './auth-layout.jsx';
import { safeRedirect } from './safe-redirect.js';
import { useCurrentUser, useLogin } from './use-auth.js';

const SIGN_IN_ERROR_ID = 'sign-in-error';

const REQUIRED = requiredFieldsOf(loginBodySchema);
/**
 * @param {string | undefined} fieldErrorId
 * @param {boolean} rejected
 * @returns {string | undefined}
 */
const describedBy = (fieldErrorId, rejected) =>
  [fieldErrorId, rejected ? SIGN_IN_ERROR_ID : undefined].filter(Boolean).join(' ') || undefined;

/**
 * @returns {React.JSX.Element}
 */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const passwordChanged = searchParams.get('reset') === 'done';
  useEffect(() => {
    // Shown once; the id stops a second copy when React runs effects twice in development.
    if (passwordChanged)
      notify.success('Your password has been changed. Sign in with your new password.', {
        id: 'password-reset-done',
      });
  }, [passwordChanged]);
  const { data: user } = useCurrentUser();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { identifier: '', password: '' },
  });

  if (user) return <Navigate to={redirectTo} replace />;

  // Wrong credentials concern both fields, so both are marked invalid and point at the message.
  const credentialsRejected =
    login.isError &&
    isApiError(login.error) &&
    login.error.code === ERROR_CODES.INVALID_CREDENTIALS;

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(redirectTo, { replace: true }) }),
  );

  return (
    <AuthLayout title="Sign in" description="Use your work email or username.">
      <form className="grid gap-5" noValidate onSubmit={onSubmit}>
        {login.isError && <FormError id={SIGN_IN_ERROR_ID}>{errorMessage(login.error)}</FormError>}

        <div className="grid gap-2">
          <Label htmlFor="identifier" required={REQUIRED.has('identifier')}>
            Email or username
          </Label>
          <Input
            id="identifier"
            aria-required={REQUIRED.has('identifier') || undefined}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.identifier || credentialsRejected ? true : undefined}
            aria-describedby={describedBy(
              errors.identifier && 'identifier-error',
              credentialsRejected,
            )}
            {...register('identifier')}
          />
          {errors.identifier && (
            <p id="identifier-error" className="text-sm text-destructive">
              {errors.identifier.message}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password" required={REQUIRED.has('password')}>
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              aria-required={REQUIRED.has('password') || undefined}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              aria-invalid={errors.password || credentialsRejected ? true : undefined}
              aria-describedby={
                describedBy(errors.password && 'password-error', credentialsRejected) ??
                (capsLockOn ? 'caps-lock-hint' : undefined)
              }
              onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
              {...register('password', { onBlur: () => setCapsLockOn(false) })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 text-muted-foreground hover:bg-transparent"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
          {capsLockOn && !errors.password && (
            <p id="caps-lock-hint" className="text-sm text-muted-foreground">
              Caps Lock is on.
            </p>
          )}
        </div>

        <Button type="submit" className="mt-1 w-full" disabled={login.isPending}>
          {login.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-sm text-muted-foreground">
          <Link to="/forgot-password" className={AUTH_LINK_CLASS}>
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES } from '@ihealth/shared/error-codes';
import { loginBodySchema } from '@ihealth/shared/schemas';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { APP_VERSION, PHARMACY_LOCATION, PHARMACY_NAME, PRODUCT_NAME } from '@/app/app-info';
import { Wordmark } from '@/components/layout/wordmark';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, isApiError } from '@/lib/api-error';

import { safeRedirect } from './safe-redirect.js';
import { useCurrentUser, useLogin } from './use-auth.js';

const SIGN_IN_ERROR_ID = 'sign-in-error';

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
    defaultValues: { username: '', password: '' },
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
    <div className="grid min-h-svh grid-rows-[auto_1fr] bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      <aside className="flex flex-col justify-between gap-6 bg-brand px-6 py-5 text-brand-foreground lg:px-12 lg:py-10">
        <Wordmark inverted className="text-lg" />
        <div className="hidden max-w-sm lg:block">
          {PHARMACY_NAME !== PRODUCT_NAME && (
            <p className="mb-2 text-2xl leading-snug font-medium">{PHARMACY_NAME}</p>
          )}
          <p className="text-xl leading-snug text-brand-foreground/85">
            Point of sale and stock for your pharmacy.
          </p>
        </div>
        <p className="hidden text-sm text-brand-foreground/60 lg:block">
          Staff access only. Sign-ins are recorded.
        </p>
      </aside>

      <main className="flex flex-col px-6 py-10 sm:px-10 lg:px-16">
        <div className="flex flex-1 items-start lg:items-center">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Use your iHealth username and password.
            </p>

            <form className="mt-8 grid gap-5" noValidate onSubmit={onSubmit}>
              {login.isError && (
                <FormError id={SIGN_IN_ERROR_ID}>{errorMessage(login.error)}</FormError>
              )}

              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={errors.username || credentialsRejected ? true : undefined}
                  aria-describedby={describedBy(
                    errors.username && 'username-error',
                    credentialsRejected,
                  )}
                  {...register('username')}
                />
                {errors.username && (
                  <p id="username-error" className="text-sm text-destructive">
                    {errors.username.message}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
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
                Forgot your password? Ask your administrator.
              </p>
            </form>
          </div>
        </div>

        <footer className="mt-10 text-xs text-muted-foreground">
          {PHARMACY_NAME} · v{APP_VERSION} · {PHARMACY_LOCATION}
        </footer>
      </main>
    </div>
  );
}

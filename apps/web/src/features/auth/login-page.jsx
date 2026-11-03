import { zodResolver } from '@hookform/resolvers/zod';
import { ERROR_CODES } from '@ihealth/shared/error-codes';
import { loginBodySchema } from '@ihealth/shared/schemas';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
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
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-2 size-12" />
          <h1 className="text-xl leading-tight font-semibold">Sign in to iHealth Pharmacy</h1>
          <CardDescription>Use the username and password you use at the pharmacy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
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
                  aria-describedby={describedBy(
                    errors.password && 'password-error',
                    credentialsRejected,
                  )}
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 text-muted-foreground"
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
            </div>

            <Button type="submit" size="lg" disabled={login.isPending}>
              {login.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

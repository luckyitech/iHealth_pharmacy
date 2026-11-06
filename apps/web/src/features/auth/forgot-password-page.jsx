import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordBodySchema } from '@ihealth/shared/schemas';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { requiredFieldsOf } from '@/components/form/use-zod-form';
import { Link } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api-error';

import { requestPasswordReset } from './auth-api.js';
import { AUTH_LINK_CLASS, AuthLayout } from './auth-layout.jsx';

const REQUIRED = requiredFieldsOf(forgotPasswordBodySchema);
/**
 * Asks for a reset link. The answer is the same whether or not the account exists.
 *
 * @returns {React.JSX.Element}
 */
export default function ForgotPasswordPage() {
  const request = useMutation({ mutationFn: requestPasswordReset });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordBodySchema),
    defaultValues: { identifier: '' },
  });

  const onSubmit = handleSubmit((values) => request.mutate(values));

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your work email or username. We will email a link to the work email on your account."
    >
      {request.isSuccess ? (
        <div className="grid gap-5">
          <Alert role="status">
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{request.data}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            No email after a few minutes? Check your spam folder. If your account has no work email,
            ask your administrator to reset your password.
          </p>
          <p className="text-sm">
            <Link to="/login" className={AUTH_LINK_CLASS}>
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form className="grid gap-5" noValidate onSubmit={onSubmit}>
          {request.isError && <FormError>{errorMessage(request.error)}</FormError>}

          <div className="grid gap-2">
            <Label htmlFor="identifier" required={REQUIRED.has('identifier')}>
              Email or username
            </Label>
            <Input
              id="identifier"
              aria-required={REQUIRED.has('identifier') || undefined}
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={errors.identifier ? true : undefined}
              aria-describedby={errors.identifier ? 'identifier-error' : undefined}
              {...register('identifier')}
            />
            {errors.identifier && (
              <p id="identifier-error" className="text-sm text-destructive">
                {errors.identifier.message}
              </p>
            )}
          </div>

          <Button type="submit" className="mt-1 w-full" disabled={request.isPending}>
            {request.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {request.isPending ? 'Sending…' : 'Send reset link'}
          </Button>

          <p className="text-sm text-muted-foreground">
            <Link to="/login" className={AUTH_LINK_CLASS}>
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

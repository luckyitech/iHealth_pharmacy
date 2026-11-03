import { CircleAlert } from 'lucide-react';

import { Alert, AlertDescription } from './alert.jsx';

/**
 * A form-level error (e.g. a rejected sign-in), announced to screen readers via role="alert".
 * Field-level errors stay next to their field; this is for problems with the submission as a whole.
 *
 * @param {{ id?: string, children: React.ReactNode, className?: string }} props
 * @returns {React.JSX.Element}
 */
export function FormError({ id, children, className }) {
  return (
    <Alert id={id} variant="destructive" className={className}>
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

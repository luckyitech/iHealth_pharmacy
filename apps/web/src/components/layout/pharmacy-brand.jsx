import { Pill } from 'lucide-react';
import { useState } from 'react';

import { useAppInfo } from '@/app/use-app-info';
import { API_BASE_URL } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { Wordmark } from './wordmark.jsx';

const LOGO_URL = `${API_BASE_URL}/masters/pharmacy-profile/logo`;

/**
 * The pharmacy's logo from its profile, or a pharmacy mark when it has none.
 *
 * @param {{ className?: string }} props
 * @returns {React.JSX.Element}
 */
export function PharmacyLogo({ className }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={cn('grid size-8 shrink-0 place-items-center', className)}>
      <Pill aria-hidden="true" strokeWidth={2.25} className="size-5 text-primary" />
    </span>
  ) : (
    <img
      src={LOGO_URL}
      alt=""
      className={cn('size-8 shrink-0 rounded-md object-contain', className)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The pharmacy's name from its profile, or the product name before a profile exists.
 *
 * @param {{ className?: string }} props
 * @returns {React.JSX.Element}
 */
export function PharmacyName({ className }) {
  const { data } = useAppInfo();
  const name = data?.pharmacy?.name;
  // The wordmark's own mark is hidden: the logo is shown beside the name.
  if (!name) return <Wordmark className={cn('[&>svg]:hidden', className)} />;
  return (
    <span className={cn('truncate text-base font-semibold tracking-tight', className)}>{name}</span>
  );
}

/**
 * Logo and name together, for the phone bar and drawer.
 *
 * @param {{ className?: string }} props
 * @returns {React.JSX.Element}
 */
export function PharmacyBrand({ className }) {
  const { data } = useAppInfo();
  if (!data?.pharmacy?.name) return <Wordmark className={className} />;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <PharmacyLogo />
      <PharmacyName />
    </span>
  );
}

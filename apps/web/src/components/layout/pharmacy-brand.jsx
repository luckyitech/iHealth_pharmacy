import { Pill } from 'lucide-react';
import { useState } from 'react';

import { useAppInfo } from '@/app/use-app-info';
import { API_BASE_URL } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { Wordmark } from './wordmark.jsx';

const LOGO_URL = `${API_BASE_URL}/masters/pharmacy-profile/logo`;

/**
 * The pharmacy's logo and name from its profile, as in the old system's logo block. Without a
 * logo it shows a pharmacy mark; without a profile, the product name.
 *
 * @param {{ className?: string }} props
 * @returns {React.JSX.Element}
 */
export function PharmacyBrand({ className }) {
  const { data } = useAppInfo();
  const [logoFailed, setLogoFailed] = useState(false);
  const name = data?.pharmacy?.name;
  if (!name) return <Wordmark className={className} />;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      {logoFailed ? (
        <Pill aria-hidden="true" strokeWidth={2.25} className="size-5 shrink-0 text-primary" />
      ) : (
        <img
          src={LOGO_URL}
          alt=""
          className="size-8 shrink-0 rounded-md object-contain"
          onError={() => setLogoFailed(true)}
        />
      )}
      <span className="truncate text-base font-semibold tracking-tight">{name}</span>
    </span>
  );
}

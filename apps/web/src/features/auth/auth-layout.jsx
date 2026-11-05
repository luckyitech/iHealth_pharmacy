import { APP_VERSION, PRODUCT_NAME } from '@/app/app-info';
import { useAppInfo } from '@/app/use-app-info';
import { Wordmark } from '@/components/layout/wordmark';

/**
 * Shared frame of the signed-out pages (sign in, forgot password, reset password):
 * a solid brand panel beside a plain, left-aligned column. On phones the panel becomes a short strip.
 *
 * @param {{ title: string, description: React.ReactNode, children: React.ReactNode }} props
 * @returns {React.JSX.Element}
 */
export function AuthLayout({ title, description, children }) {
  const { data: info } = useAppInfo();
  const pharmacyName = info?.pharmacy?.name;
  const footer = [PRODUCT_NAME, `v${APP_VERSION}`, info?.pharmacy?.city]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1">
      <aside className="flex flex-col justify-between gap-6 bg-brand px-6 py-5 text-brand-foreground lg:px-12 lg:py-10">
        <Wordmark inverted className="text-lg" />
        <div className="hidden max-w-sm lg:block">
          {pharmacyName && <p className="mb-2 text-2xl leading-snug font-medium">{pharmacyName}</p>}
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
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        <footer className="mt-10 text-xs text-muted-foreground">{footer}</footer>
      </main>
    </div>
  );
}

/**
 * The quiet link style used on signed-out pages.
 */
export const AUTH_LINK_CLASS =
  'font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

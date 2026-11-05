import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Toaster as Sonner } from 'sonner';

/** Phones get notifications at the top, where the thumb is not in the way. */
const PHONE_QUERY = '(max-width: 639px)';

/**
 * @param {() => void} onChange
 * @returns {() => void}
 */
const subscribe = (onChange) => {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
};
const isPhone = () => window.matchMedia?.(PHONE_QUERY).matches ?? false;

/**
 * The app's notifications (Sonner), styled like the rest of the app: a solid surface, the type
 * shown by an icon, errors by a thin red rule and icon (no coloured fill). Bottom right, or top
 * centre on phones, with a close button. Animations follow the system's "reduce motion".
 *
 * @param {{ theme: 'light' | 'dark' | 'system' }} props
 * @returns {React.JSX.Element}
 */
export function Toaster({ theme }) {
  const phone = useSyncExternalStore(subscribe, isPhone, () => false);
  return (
    <Sonner
      theme={theme}
      position={phone ? 'top-center' : 'bottom-right'}
      closeButton
      visibleToasts={4}
      icons={{
        success: <CircleCheck aria-hidden="true" className="size-4 text-primary" />,
        error: <CircleAlert aria-hidden="true" className="size-4 text-destructive" />,
        warning: <TriangleAlert aria-hidden="true" className="size-4 text-foreground" />,
        info: <Info aria-hidden="true" className="size-4 text-muted-foreground" />,
        loading: (
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            'group/toast !rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg !font-sans !gap-3',
          title: '!text-sm !font-medium',
          description: '!text-sm !text-muted-foreground',
          error: '!border-l-2 !border-l-destructive',
          actionButton:
            '!rounded-md !bg-primary !px-2.5 !text-xs !font-medium !text-primary-foreground',
          cancelButton: '!rounded-md !bg-muted !px-2.5 !text-xs !text-foreground',
          closeButton: '!border-border !bg-popover !text-muted-foreground hover:!text-foreground',
        },
      }}
    />
  );
}

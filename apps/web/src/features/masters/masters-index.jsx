import { Navigate } from 'react-router';

import { PageState } from '@/components/feedback/page-state';
import { usePermissions } from '@/features/auth/use-permissions';

import { MASTER_SECTIONS } from './sections.js';

/**
 * /masters opens the first master screen the user may see.
 *
 * @returns {React.JSX.Element}
 */
export default function MastersIndex() {
  const { hasAny } = usePermissions();
  const first = MASTER_SECTIONS.find((section) => hasAny(section.permissions));
  if (!first) return <PageState state="empty" title="No master data to show" />;
  return <Navigate to={first.path} replace />;
}

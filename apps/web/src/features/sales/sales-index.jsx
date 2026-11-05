import { POLICIES } from '@ihealth/shared/permissions';
import { Navigate } from 'react-router';

import { usePermissions } from '@/features/auth/use-permissions';

/**
 * Opening Sales goes to the sales screen for people who sell, and to the history for the others.
 *
 * @returns {React.JSX.Element}
 */
export default function SalesIndex() {
  const { hasAny } = usePermissions();
  return <Navigate to={hasAny(POLICIES.sales.sell) ? 'new' : 'history'} replace />;
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { useConfirm } from '@/hooks/use-confirm';
import { api } from '@/lib/api-client';
import { notify } from '@/lib/notify';

const RESOURCE = 'masters/sales-settings';
const SETTINGS_KEY = ['resource', RESOURCE];
/** The till reads the rules with its other settings. */
const TILL_SETTINGS_KEY = ['sales', 'till-settings'];

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').salesSettingsSchema>} SalesSettings
 */

/**
 * @param {boolean} on
 * @returns {string} How a switch is named in the confirmation.
 */
const onOff = (on) => (on ? 'On' : 'Off');

/**
 * The pharmacy's choices about selling, on the Pharmacy profile screen: for now, whether
 * controlled drugs need the register's details before they can be paid.
 *
 * @param {{ canWrite: boolean }} props
 * @returns {React.JSX.Element}
 */
export function SalesSettingsCard({ canWrite }) {
  const queryClient = useQueryClient();
  const { ask, dialog } = useConfirm();
  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () =>
      /** @type {{ data: SalesSettings }} */ (await api.get(RESOURCE).json()).data,
  });
  const [rules, setRules] = useState(/** @type {boolean | null} */ (null));
  const save = useMutation({
    mutationFn: async (/** @type {SalesSettings} */ values) =>
      /** @type {{ data: SalesSettings }} */ (await api.put(RESOURCE, { json: values }).json())
        .data,
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_KEY, data);
      void queryClient.invalidateQueries({ queryKey: TILL_SETTINGS_KEY });
      setRules(null);
      notify.success('Sales settings saved');
    },
  });

  useEffect(() => {
    if (settings.error)
      notify.failure('Could not load the sales settings', settings.error, { id: RESOURCE });
  }, [settings.error]);

  const saved = settings.data?.controlledDrugRules;
  const current = rules ?? saved ?? true;
  const changed = rules !== null && rules !== saved;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales settings</CardTitle>
        <CardDescription>How the till sells, for this pharmacy.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {settings.isPending ? (
          <PageState state="loading" />
        ) : (
          <CheckboxField
            label="Controlled-drug rules"
            description={
              current
                ? "On: a controlled drug can't be paid for until the patient's name, phone and ID number, the doctor and the prescription date are in. They go in the controlled-drug register."
                : 'Off: as in the old system. The till shows the CD tag and asks for the details, but payment is not blocked. Whatever is entered still goes in the register.'
            }
            checked={current}
            disabled={!canWrite || save.isPending}
            onChange={(event) => setRules(event.target.checked)}
          />
        )}
        {canWrite && (
          <div className="flex gap-2">
            <Button
              disabled={!changed || save.isPending}
              onClick={() =>
                ask({
                  title: 'Save these changes?',
                  changes: [
                    {
                      label: 'Controlled-drug rules',
                      from: onOff(Boolean(saved)),
                      to: onOff(current),
                    },
                  ],
                  confirmLabel: 'Save changes',
                  onConfirm: () => save.mutateAsync({ controlledDrugRules: current }),
                })
              }
            >
              Save sales settings
            </Button>
            {changed && (
              <Button variant="outline" onClick={() => setRules(null)}>
                Discard
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {dialog}
    </Card>
  );
}

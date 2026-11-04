import { expect, test } from '@playwright/test';

/** Every masters list, and how its records open. */
const MASTERS = Object.freeze([
  { path: 'items', editor: 'page' },
  { path: 'suppliers', editor: 'page' },
  { path: 'customers', editor: 'page' },
  { path: 'employees', editor: 'page' },
  { path: 'hospitals', editor: 'page' },
  { path: 'providers', editor: 'page' },
  { path: 'manufacturers', editor: 'dialog' },
  { path: 'terms', editor: 'dialog' },
  { path: 'item-categories', editor: 'dialog' },
  { path: 'item-groups', editor: 'dialog' },
  { path: 'item-forms', editor: 'dialog' },
  { path: 'generic-names', editor: 'dialog' },
  { path: 'units-of-measure', editor: 'dialog' },
  { path: 'specializations', editor: 'dialog' },
]);

/** One made-up record with the fields every list shows. */
const RECORD = Object.freeze({
  id: 1,
  active: true,
  name: 'Smoke Record',
  code: 'SMOKE1',
  firstName: 'Smoke',
  lastName: 'Record',
  text: 'Smoke terms',
  productKind: 'medical',
  kind: 'individual',
  supplies: 'both',
});

/**
 * A signed-in administrator with "Masters Entry", and one record in every list.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockMastersApi(page) {
  const user = {
    employeeId: 1,
    username: 'smoke.admin',
    firstName: 'Smoke',
    lastName: 'Admin',
    email: 'admin@example.test',
    pharmacyId: 1,
    roles: [],
    permissionIds: [1],
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    /** @param {unknown} body */
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === 'auth/me') return json({ data: user });
    if (path === 'auth/csrf') return json({ data: { csrfToken: 'smoke' } });
    if (path.startsWith('lookups/')) return json({ data: [] });
    if (/^masters\/[\w-]+\/\d+$/.test(path)) return json({ data: RECORD });
    if (/^masters\/[\w-]+$/.test(path))
      return json({ data: [RECORD], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } });
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"code":"NOT_FOUND","message":"No mock"}}',
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockMastersApi(page);
});

for (const master of MASTERS) {
  test(`opens records of ${master.path} for editing`, async ({ page }) => {
    await page.goto(`/masters/${master.path}`);
    await page.locator('tbody tr').first().click();

    if (master.editor === 'page') {
      await expect(page).toHaveURL(new RegExp(`/masters/${master.path}/1/edit$`));
      await expect(page.getByRole('form')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page).toHaveURL(new RegExp(`/masters/${master.path}$`));
      await page.getByRole('button', { name: /^New / }).click();
      await expect(page).toHaveURL(new RegExp(`/masters/${master.path}/new$`));
      await expect(page.getByRole('form')).toBeVisible();
    } else {
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    }
    await expect(page.getByText(/page not found/i)).toHaveCount(0);
  });
}

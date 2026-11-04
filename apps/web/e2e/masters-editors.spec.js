import { expect, test } from '@playwright/test';

/** Every masters list, and the size of its edit dialog. */
const MASTERS = Object.freeze([
  { path: 'items', size: 'large' },
  { path: 'suppliers', size: 'large' },
  // A link is named by its item and supplier.
  { path: 'item-suppliers', size: 'large', title: 'Smoke Item from Smoke Supplier' },
  { path: 'customers', size: 'large' },
  { path: 'employees', size: 'large' },
  { path: 'hospitals', size: 'large' },
  { path: 'providers', size: 'large' },
  { path: 'manufacturers', size: 'small' },
  // A terms text is named by its first words.
  { path: 'terms', size: 'small', title: 'Smoke terms' },
  { path: 'item-categories', size: 'small' },
  { path: 'item-groups', size: 'small' },
  { path: 'item-forms', size: 'small' },
  { path: 'generic-names', size: 'small' },
  { path: 'units-of-measure', size: 'small' },
  { path: 'specializations', size: 'small' },
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
  itemName: 'Smoke Item',
  supplierName: 'Smoke Supplier',
  unitRate: 0,
  discountPercent: 0,
  duplicate: false,
  itemMissing: false,
  supplierMissing: false,
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
    if (/^masters\/[\w-]+\/\d+$/.test(path)) {
      const body = route.request().method() === 'PATCH' ? route.request().postDataJSON() : {};
      return json({ data: { ...RECORD, ...body } });
    }
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
  test(`opens records of ${master.path} in a dialog over the list`, async ({ page }) => {
    await page.goto(`/masters/${master.path}?q=smoke`);
    await page.locator('tbody tr').first().click();

    const dialog = page.getByRole('dialog', { name: master.title ?? 'Smoke Record' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/masters/${master.path}\\?q=smoke&edit=1$`));
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
    // The list stays underneath.
    await expect(page.locator('h1')).toBeAttached();
    await expect(dialog.getByRole('navigation', { name: 'Sections' })).toHaveCount(
      master.size === 'large' ? 1 : 0,
    );

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/masters/${master.path}\\?q=smoke$`));

    await page.getByRole('button', { name: /^New / }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/page not found/i)).toHaveCount(0);
  });

  test(`opens a record of ${master.path} from a link`, async ({ page }) => {
    await page.goto(`/masters/${master.path}?edit=1`);
    await expect(page.getByRole('dialog', { name: master.title ?? 'Smoke Record' })).toBeVisible();
  });
}

test('asks before saving, lists the change, and saves only after confirming', async ({ page }) => {
  /** @type {unknown[]} */
  const patches = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH') patches.push(request.postDataJSON());
  });
  await page.goto('/masters/hospitals?edit=1');
  const dialog = page.getByRole('dialog', { name: 'Smoke Record' });
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await dialog.getByLabel('Phone').fill('0700000999');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  const question = page.getByRole('alertdialog', { name: 'Save these changes?' });
  await expect(question.getByText('0700000999')).toBeVisible();
  await expect(question.getByRole('button', { name: 'Go back' })).toBeFocused();
  await question.getByRole('button', { name: 'Go back' }).click();
  await expect(question).toBeHidden();
  expect(patches).toHaveLength(0);

  await page.keyboard.press('ControlOrMeta+s');
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  expect(patches).toEqual([expect.objectContaining({ phone: '0700000999' })]);
});

test("adds a supplier from an item's Suppliers tab, with the item already chosen", async ({
  page,
}) => {
  await page.goto('/masters/items?edit=1');
  const dialog = page.getByRole('dialog', { name: 'Smoke Record' });
  await dialog.getByRole('tab', { name: 'Suppliers' }).click();
  await expect(dialog.getByRole('link', { name: /Smoke Supplier/ })).toBeVisible();

  await dialog.getByRole('link', { name: 'Add a supplier' }).click();
  await expect(page).toHaveURL(/\/masters\/item-suppliers\?itemId=1&status=all&edit=new$/);
  const editor = page.getByRole('dialog', { name: 'New item supplier' });
  await expect(editor.getByRole('combobox', { name: 'Item' })).toHaveText(/Smoke Record/);
  await expect(page.getByText('Showing the links of')).toBeVisible();
});

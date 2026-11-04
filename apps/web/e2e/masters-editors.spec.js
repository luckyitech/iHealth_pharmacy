import { expect, test } from '@playwright/test';

/** Every masters list, and the size of its edit dialog. */
const MASTERS = Object.freeze([
  { path: 'items', size: 'large' },
  { path: 'suppliers', size: 'large' },
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

test('lists the masters pages inside the main sidebar, open on masters pages', async ({
  page,
  isMobile,
}) => {
  await page.goto('/masters/suppliers');
  await expect(page.getByRole('navigation', { name: 'Masters' })).toHaveCount(0);

  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Main' }).last();
  const group = nav.getByRole('button', { name: 'Masters' });
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Suppliers' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Manufacturers' }).click();
  await expect(page).toHaveURL(/\/masters\/manufacturers$/);
  if (isMobile) {
    // The drawer closes after choosing a page.
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
    return;
  }
  await expect(nav.getByRole('link', { name: 'Manufacturers' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Closed by the user, it stays closed after a reload.
  await group.click();
  await expect(nav.getByRole('link', { name: 'Items' })).toBeHidden();
  await page.reload();
  await expect(nav.getByRole('button', { name: 'Masters' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('opens the masters pages from the icon-only sidebar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones use the drawer.');
  await page.goto('/masters/suppliers');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();

  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Masters' }).click();
  await page.getByRole('menuitem', { name: 'Customers' }).click();
  await expect(page).toHaveURL(/\/masters\/customers$/);

  // Remembered, and the content starts right after the rail.
  await page.reload();
  const main = page.locator('#main-content');
  const { x } = /** @type {{ x: number }} */ (await main.boundingBox());
  const rail = /** @type {{ width: number }} */ (await page.locator('aside').boundingBox());
  expect(x).toBe(rail.width);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(nav.getByRole('button', { name: 'Masters' })).toBeVisible();
});

import { expect, test } from '@playwright/test';

/** Width of the icon rail and of the slid-out or pinned panel, in CSS pixels. */
const RAIL_WIDTH = 64;
const PANEL_WIDTH = 240;

/**
 * A signed-in administrator, a made-up pharmacy, and one supplier.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockApi(page) {
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
    if (path === 'app-info') {
      return json({
        data: {
          apiVersion: '1',
          pharmacy: { id: 1, name: 'Smoke Pharmacy', city: null, country: null },
          region: { locale: 'en', currency: 'XXX', timeZone: 'UTC' },
        },
      });
    }
    if (path.startsWith('lookups/')) return json({ data: [] });
    if (/^masters\/[\w-]+$/.test(path)) {
      return json({
        data: [{ id: 1, active: true, name: 'Smoke Supplier', supplies: 'both' }],
        meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      });
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"code":"NOT_FOUND","message":"No mock"}}',
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'Phones use the drawer.');

  test("shows the pharmacy's name, the sections on top and the section's pages as icons", async ({
    page,
  }) => {
    await page.goto('/masters/suppliers');
    await expect(page.getByRole('banner').getByText('Smoke Pharmacy')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Masters' }),
    ).toHaveAttribute('aria-current', 'page');

    const pages = page.getByRole('navigation', { name: 'Masters' });
    await expect(pages.getByRole('link', { name: 'Suppliers', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(pages.getByRole('link', { name: 'Items', exact: true })).toHaveAttribute(
      'title',
      'Items',
    );
    const panel = page.locator('[data-expanded]');
    await expect(panel).toHaveAttribute('data-expanded', 'false');
    expect((await panel.boundingBox())?.width).toBe(RAIL_WIDTH);
    // The page starts right after the rail.
    expect((await page.locator('#main-content').boundingBox())?.x).toBe(RAIL_WIDTH);
  });

  test('slides out over the page on hover and back when the mouse leaves', async ({ page }) => {
    await page.goto('/masters/suppliers');
    const panel = page.locator('[data-expanded]');
    const main = page.locator('#main-content');

    await panel.hover();
    await expect(panel).toHaveAttribute('data-expanded', 'true');
    await expect.poll(async () => (await panel.boundingBox())?.width).toBe(PANEL_WIDTH);
    // Over the page: the page does not move.
    expect((await main.boundingBox())?.x).toBe(RAIL_WIDTH);

    await page
      .getByRole('navigation', { name: 'Masters' })
      .getByRole('link', { name: 'Items', exact: true })
      .click();
    await expect(page).toHaveURL(/\/masters\/items$/);

    await page.mouse.move(900, 500);
    await expect(panel).toHaveAttribute('data-expanded', 'false');
  });

  test('stays open when pinned, after a reload too, and the page starts after it', async ({
    page,
  }) => {
    await page.goto('/masters/suppliers');
    const panel = page.locator('[data-expanded]');
    await panel.hover();
    await page.getByRole('button', { name: 'Keep the panel open' }).click();
    await page.mouse.move(900, 500);
    await page.reload();

    await expect(panel).toHaveAttribute('data-expanded', 'true');
    await expect
      .poll(async () => (await page.locator('#main-content').boundingBox())?.x)
      .toBe(PANEL_WIDTH);
    await page.getByRole('button', { name: 'Let the panel slide' }).click();
    await page.mouse.move(900, 500);
    await expect(panel).toHaveAttribute('data-expanded', 'false');
  });

  test('has no side panel on a section without pages of its own', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-expanded]')).toHaveCount(0);
  });
});

test('lists the sections and the current section’s pages in the phone menu', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The drawer is for phones.');
  await page.goto('/masters/suppliers');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await expect(drawer.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await drawer.getByRole('link', { name: 'Manufacturers' }).click();
  await expect(page).toHaveURL(/\/masters\/manufacturers$/);
  await expect(drawer).toBeHidden();
});

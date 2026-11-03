import { expect, test } from '@playwright/test';

import { CASHIER, mockApi } from './api-mock.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('signs in, shows only permitted modules, and signs out', async ({ page, isMobile }) => {
  await page.goto('/sales');

  // Not signed in: sent to the sign-in page, which remembers where to go next.
  await expect(page).toHaveURL(/\/login\?redirect=%2Fsales/);
  await expect(page.getByRole('heading', { name: 'Sign in to iHealth Pharmacy' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter your username')).toBeVisible();

  await page.getByLabel('Username', { exact: true }).fill(CASHIER.username);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('The username or password is incorrect.');

  await page.getByLabel('Password', { exact: true }).fill(CASHIER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Back to the page that was asked for.
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('heading', { name: 'Sales', level: 1 })).toBeVisible();
  await expect(page.getByText('Sales Billing Submission')).toBeVisible();

  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Main' }).last();
  await expect(nav.getByRole('link', { name: 'Sales' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Masters' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Finance' })).toHaveCount(0);
  if (isMobile) await page.keyboard.press('Escape');

  // A module without permission shows a clear message instead of the page.
  await page.goto('/masters');
  await expect(
    page.getByRole('heading', { name: 'You do not have access to this page' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Account menu for Carl Cashier/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('switches between light and dark themes', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(CASHIER.username);
  await page.getByLabel('Password', { exact: true }).fill(CASHIER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Carl');

  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

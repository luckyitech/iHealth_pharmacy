import { expect, test } from '@playwright/test';

import { CASHIER, FORGOT_PASSWORD_MESSAGE, mockApi, RESET_TOKEN } from './api-mock.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('signs in, shows only permitted modules, and signs out', async ({ page, isMobile }) => {
  await page.goto('/sales');

  // Not signed in: sent to the sign-in page, which remembers where to go next.
  await expect(page).toHaveURL(/\/login\?redirect=%2Fsales/);
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter your email or username')).toBeVisible();

  await page.getByLabel('Email or username', { exact: true }).fill(CASHIER.username);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'The username or password is incorrect. Check them and try again.',
  );
  await expect(page.getByLabel('Email or username', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );

  await page.getByLabel('Password', { exact: true }).fill(CASHIER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Back to the page that was asked for.
  // Sales opens on its first screen: the sales screen, for someone who sells.
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(page.getByRole('heading', { name: 'New sale', level: 1 })).toBeAttached();

  if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Main' }).last();
  await expect(nav.getByRole('link', { name: 'Sales', exact: true })).toBeVisible();
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
  await page.getByLabel('Email or username', { exact: true }).fill(CASHIER.username);
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

test('signs in with the work email', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(CASHIER.email.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(CASHIER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Carl');
});

test('requests a reset link and sets a new password', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Email or username', { exact: true }).fill(CASHIER.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText(FORGOT_PASSWORD_MESSAGE);

  await page.goto(`/reset-password?token=${RESET_TOKEN}`);
  await page.getByLabel('New password', { exact: true }).fill('a-brand-new-password');
  await page.getByLabel('Confirm new password').fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/login\?reset=done$/);
  await expect(page.getByText('Your password has been changed.', { exact: false })).toBeVisible();
});

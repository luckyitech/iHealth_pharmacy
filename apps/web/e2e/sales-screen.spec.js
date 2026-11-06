import { expect, test } from '@playwright/test';

import { createTillServer, mockTillApi, SYRUP_BARCODE, USED_MPESA_CODE } from './till-mock.js';

/** @type {ReturnType<typeof createTillServer>} */
let server;

test.beforeEach(async ({ page }) => {
  server = createTillServer();
  await mockTillApi(page, server);
});

/**
 * @param {import('@playwright/test').Page} page
 */
const search = (page) => page.getByRole('combobox', { name: 'Find an item' });

test('sells with the keyboard only: quantity, search, scan, pay and next sale', async ({
  page,
}) => {
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(search(page)).toBeFocused();

  await search(page).fill('3*testa');
  const options = page.getByRole('option');
  await expect(options).toHaveCount(3);
  // The first batch to expire is chosen; the expired one is shown but cannot be chosen.
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toContainText('first to expire');
  await expect(options.nth(2)).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');

  // A scanner types the barcode and Enter at once.
  await search(page).pressSequentially(`${SYRUP_BARCODE}\n`, { delay: 5 });

  const rows = page.getByRole('table', { name: 'Items on this sale' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('TM-EARLY');
  await expect(page.getByRole('textbox', { name: 'Quantity of Testamol 500mg tabs' })).toHaveValue(
    '3',
  );
  await expect(rows.nth(2)).toContainText('Demo cough syrup 100ml');

  // With the search empty, + adds one to the selected line (the syrup).
  await page.keyboard.press('+');
  await expect(
    page.getByRole('textbox', { name: 'Quantity of Demo cough syrup 100ml' }),
  ).toHaveValue('2');

  await page.keyboard.press('F9');
  const pay = page.getByRole('dialog', { name: 'Take payment' });
  await expect(pay.getByText('Ksh 1,248.00').first()).toBeVisible();
  await expect(pay.getByRole('textbox', { name: 'Cash received' })).toBeFocused();
  await page.keyboard.type('1300');
  await expect(pay.getByText('Ksh 52.00')).toBeVisible();
  await page.keyboard.press('Enter');

  const done = page.getByRole('dialog', { name: 'Sale complete' });
  await expect(done.getByText('TSB0511260001')).toBeVisible();
  await expect(done.getByText('Change Ksh 52.00')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(done).toBeHidden();
  await expect(page.getByText('No items yet')).toBeVisible();
  await expect(search(page)).toBeFocused();
});

test('shows the problem under the M-Pesa code when the server refuses it', async ({ page }) => {
  await page.goto('/sales/new');
  await search(page).fill('testa');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('F9');

  const pay = page.getByRole('dialog', { name: 'Take payment' });
  // M-Pesa takes the place of the cash the window opened with.
  await pay.getByRole('button', { name: /^M-Pesa/ }).click();
  await expect(pay.getByRole('group', { name: 'Cash' })).toHaveCount(0);
  const code = pay.getByRole('textbox', { name: /M-Pesa code/ });
  await code.fill('AB12');
  await pay.getByRole('button', { name: /Complete sale/ }).click();
  await expect(pay.getByText('Enter all 10 characters of the M-Pesa code')).toBeVisible();

  await code.fill(USED_MPESA_CODE.toLowerCase());
  await pay.getByRole('button', { name: /Complete sale/ }).click();
  await expect(pay.getByText('This M-Pesa code is already on bill TSB0511260001')).toBeVisible();
});

test('splits a bill between card, cheque and cash, with change only from cash', async ({
  page,
}) => {
  await page.goto('/sales/new');
  await search(page).fill('3*testa');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('F9');

  const pay = page.getByRole('dialog', { name: 'Take payment' });
  // Card for part of the bill: Alt 3, and only the approval code besides the amount.
  await page.keyboard.press('Alt+Digit3');
  await expect(pay.getByRole('group', { name: 'Cash' })).toHaveCount(0);
  const card = pay.getByRole('group', { name: 'Card' });
  await card.getByRole('textbox', { name: 'Amount' }).fill('200');
  await card.getByRole('textbox', { name: 'Approval code' }).fill('482193');

  await pay.getByRole('button', { name: /^Cheque/ }).click();
  const cheque = pay.getByRole('group', { name: 'Cheque' });
  await cheque.getByRole('textbox', { name: 'Amount' }).fill('100');
  await cheque.getByRole('textbox', { name: 'Cheque number' }).fill('000731');
  await pay.getByRole('button', { name: /Complete sale/ }).click();
  await expect(cheque.getByText('Choose the bank')).toBeVisible();
  await cheque.getByRole('combobox', { name: 'Bank' }).selectOption({ label: 'Example Bank' });
  await cheque.getByLabel('Cheque date').fill('2020-01-31');
  await expect(cheque.getByText('Older than 6 months')).toBeVisible();
  const today = new Date().toISOString().slice(0, 10);
  await cheque.getByLabel('Cheque date').fill(today);

  // 348 to pay: 200 card + 100 cheque leaves 48 in cash; 50 handed over gives 2 back.
  await expect(pay.getByText('Still to pay')).toBeVisible();
  await pay.getByRole('button', { name: /^Cash/ }).click();
  await expect(pay.getByRole('textbox', { name: /Cash received/ })).toHaveValue('48.00');
  await pay.getByRole('textbox', { name: /Cash received/ }).fill('50');
  await expect(pay.getByText('Change to give')).toBeVisible();
  await expect(pay.getByText('Ksh 2.00')).toBeVisible();
  await pay.getByRole('button', { name: /Complete sale/ }).click();

  const done = page.getByRole('dialog', { name: 'Sale complete' });
  await expect(done.getByText('Change Ksh 2.00')).toBeVisible();
  await expect(done.getByText(/Card/)).toBeVisible();
});

test('asks before clearing the sale with Escape', async ({ page }) => {
  await page.goto('/sales/new');
  await search(page).fill('testa');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('alertdialog', { name: 'Clear this sale?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Clear sale' }).click();
  await expect(page.getByText('No items yet')).toBeVisible();
});

test('holds a sale at one till and recalls it at another, only once', async ({ browser, page }) => {
  await page.goto('/sales/new');
  await search(page).fill('testa');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('table', { name: 'Items on this sale' })).toBeVisible();
  await page.keyboard.press('F8');
  await expect(page.getByText('Sale held for Walk-in')).toBeVisible();
  await expect(page.getByText('No items yet')).toBeVisible();

  const otherTill = await browser.newPage();
  await mockTillApi(otherTill, server);
  await otherTill.goto('/sales/new');
  await otherTill.getByRole('button', { name: /^Held \(1\)/ }).click();
  await otherTill.getByRole('button', { name: /Recall the sale for Walk-in/ }).click();
  await expect(
    otherTill.getByRole('textbox', { name: 'Quantity of Testamol 500mg tabs' }),
  ).toHaveValue('1');

  // The first till still lists it from before; recalling it now says where it went.
  await page.keyboard.press('Shift+F8');
  await page.getByRole('button', { name: /Recall the sale for Walk-in/ }).click();
  await expect(page.getByText('Could not recall the sale')).toBeVisible();
  await expect(page.getByText(/no longer on hold/)).toBeVisible();
  await otherTill.close();
});

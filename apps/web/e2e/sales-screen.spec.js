import { expect, test } from '@playwright/test';

import {
  APPROVER,
  createTillServer,
  mockTillApi,
  SYRUP_BARCODE,
  USED_MPESA_CODE,
} from './till-mock.js';

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
  await expect(pay.getByRole('textbox', { name: 'Cash received' })).toBeFocused();
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

test('a discount above the limit needs a second person, never the cashier', async ({ page }) => {
  await page.goto('/sales/new');
  await search(page).fill('2*testa');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('F4');
  const discount = page.getByRole('textbox', { name: 'Discount (%)' });
  await discount.fill('30');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Discount above the limit · needs approval/).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.keyboard.press('F9');
  const approval = page.getByRole('dialog', { name: 'Approval needed' });
  await approval.getByRole('button', { name: 'Regular customer' }).click();
  await approval.getByLabel(/Approver's username/).fill('smoke.cashier');
  await approval.getByLabel(/Approver's PIN/).fill('0000');
  await approval.getByRole('button', { name: /Approve and pay/ }).click();
  await expect(
    approval.getByText("You can't approve your own sale. Ask someone else."),
  ).toBeVisible();
  await expect(page.getByText('Not approved')).toBeVisible();

  await approval.getByLabel(/Approver's username/).fill(APPROVER.username);
  await approval.getByLabel(/Approver's PIN/).fill(APPROVER.pin);
  await approval.getByRole('button', { name: /Approve and pay/ }).click();
  const pay = page.getByRole('dialog', { name: 'Take payment' });
  await expect(pay).toBeVisible();
  await expect(page.getByText('Approved by Pat Pharmacist')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Sale complete' })).toBeVisible();
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

test('finds a registered customer as the name is typed', async ({ page }) => {
  await page.goto('/sales/new');
  await expect(search(page)).toBeFocused();
  await page.keyboard.press('F2');
  const dialog = page.getByRole('dialog', { name: 'Customer' });
  const name = dialog.getByRole('combobox', { name: /Name/ });
  await expect(name).toBeFocused();
  await name.pressSequentially('jan');
  const options = dialog.getByRole('option');
  await expect(options).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: test.info().outputPath('customer-typeahead.png') });

  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await name.pressSequentially('e t');
  await expect(options).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Customer\s*Jane Testcase/ })).toBeVisible();
});

test('takes the prescription of a prescription-only medicine, a new doctor included', async ({
  page,
}) => {
  await page.goto('/sales/new');
  await expect(search(page)).toBeFocused();
  await search(page).fill('hypo');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option').getByTitle('Prescription only')).toHaveText(/Rx/);
  await page.keyboard.press('Enter');
  await search(page).fill('amox');
  await expect(page.getByRole('option', { name: /Amoxidemo/ })).toBeVisible();
  await page.keyboard.press('Enter');

  const strip = page.getByRole('region', { name: /Prescription/ });
  await expect(strip).toContainText('2 items need one');
  await page.keyboard.press('F3');
  const doctor = strip.getByRole('combobox', { name: 'Doctor' });
  await expect(doctor).toBeFocused();
  await doctor.pressSequentially('am');
  await expect(page.getByRole('option', { name: /Amani Demo/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(doctor).toHaveValue('Amani Demo');
  await expect(strip.getByRole('combobox', { name: 'Hospital' })).toHaveValue(
    'Sample Medical Centre',
  );
  await strip.getByLabel('Prescription date').fill('2026-11-05');
  await strip.getByLabel('Photo').setInputFiles({
    name: 'prescription.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(strip.getByRole('img', { name: 'The prescription' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('prescription-strip.png') });

  // A doctor not on the list is added without leaving the sale.
  await strip.getByRole('button', { name: 'Clear doctor' }).click();
  await doctor.pressSequentially('Chausiku Sample');
  await page.getByRole('button', { name: /Add “Chausiku Sample” as a new doctor/ }).click();
  const added = page.getByRole('dialog', { name: 'Add a doctor' });
  await expect(added.getByLabel(/First name/)).toHaveValue('Chausiku');
  await expect(added.getByLabel(/Last name/)).toHaveValue('Sample');
  await added.getByRole('button', { name: 'Add doctor' }).click();
  await expect(added).toBeHidden();
  await expect(doctor).toHaveValue('Chausiku Sample');

  await page.keyboard.press('F9');
  const payment = page.getByRole('dialog', { name: 'Take payment' });
  await expect(payment.getByRole('textbox', { name: 'Cash received' })).toBeFocused();
  await page.keyboard.press('Enter');
  const done = page.getByRole('dialog', { name: 'Sale complete' });
  await expect(done).toBeVisible();
  expect(server.lastSale?.prescription).toMatchObject({
    doctorId: 102,
    hospitalId: 3,
    prescribedOn: '2026-11-05',
    photo: expect.stringMatching(/^data:image\/jpeg;base64,/),
  });
  await page.keyboard.press('Enter');
  await expect(done).toBeHidden();
  await expect(page.getByRole('region', { name: /Prescription/ })).toHaveCount(0);
});

test('sells a controlled drug only with the details the register needs', async ({ page }) => {
  await page.goto('/sales/new');
  await expect(search(page)).toBeFocused();
  await search(page).fill('3*calm');
  await expect(page.getByRole('option', { name: /Calmadol/ })).toBeVisible();
  await page.keyboard.press('Enter');

  const strip = page.getByRole('region', { name: /Controlled drug/ });
  await expect(strip).toContainText('required for the register');
  const pay = page.getByRole('button', { name: /^Pay/ }).first();
  await expect(pay).toBeDisabled();
  await page.keyboard.press('F9');
  await expect(
    page.locator('[data-sonner-toast]', {
      hasText: /Fill in the patient's name, phone, ID number/,
    }),
  ).toBeVisible();

  // The patient is found as the name is typed, and becomes the sale's customer.
  await strip.getByRole('combobox', { name: /Patient's name/ }).pressSequentially('jane');
  await expect(page.getByRole('option', { name: /Jane Testcase/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(strip.getByRole('textbox', { name: /Phone/ })).toHaveValue('0700000104');
  await expect(page.getByRole('button', { name: /Customer\s*Jane Testcase/ })).toBeVisible();
  await strip.getByRole('textbox', { name: /ID or passport/ }).fill('TEST1234');
  await strip.getByRole('combobox', { name: /Doctor/ }).pressSequentially('bora');
  await expect(page.getByRole('option', { name: /Bora Example/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await strip.getByLabel(/Prescription date/).fill('2026-11-02');
  await page.screenshot({ path: test.info().outputPath('controlled-strip.png') });

  await expect(pay).toBeEnabled();
  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog', { name: 'Take payment' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Sale complete' })).toBeVisible();
  expect(server.lastSale).toMatchObject({
    customerId: 104,
    lines: [{ stockId: 7, quantity: 3 }],
    prescription: { doctorId: 8, prescribedOn: '2026-11-02', patientIdNumber: 'TEST1234' },
  });
});

test('prints the dosing labels after the sale, building the dose from codes', async ({ page }) => {
  await page.goto('/sales/new');
  await expect(search(page)).toBeFocused();
  await search(page).fill('15*amox');
  await expect(page.getByRole('option', { name: /Amoxidemo/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await search(page).fill('testa');
  await expect(page.getByRole('option', { name: /Testamol/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog', { name: 'Take payment' })).toBeVisible();
  await page.keyboard.press('Enter');
  const done = page.getByRole('dialog', { name: 'Sale complete' });
  await expect(done).toBeVisible();

  await page.keyboard.press('l');
  const labels = page.getByRole('dialog', { name: 'Print labels' });
  const dose = labels.getByRole('textbox', { name: 'Dose for Amoxidemo 250mg caps' });
  await expect(dose).toBeVisible();
  const codes = labels.getByRole('combobox', { name: /Add a code to the dose for Amoxidemo/ });
  await codes.fill('1c');
  await page.keyboard.press('Enter');
  await codes.fill('tds');
  await page.keyboard.press('Enter');
  await expect(dose).toHaveValue('Take one capsule 3 times a day');
  await dose.pressSequentially(' for 5 days.');
  await page.screenshot({ path: test.info().outputPath('labels.png') });

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    labels.getByRole('button', { name: 'Print 1 label' }).click(),
  ]);
  await popup.close();
  await expect(labels).toBeHidden();
  expect(server.lastLabels).toEqual({
    labels: [
      { lineId: 1, text: 'Take one capsule 3 times a day for 5 days.', copies: 1 },
      { lineId: 2, text: '', copies: 0 },
    ],
  });
  await expect(done).toBeVisible();
});

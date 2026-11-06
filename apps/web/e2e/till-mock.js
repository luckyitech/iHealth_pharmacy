/**
 * A small in-memory stand-in for the sales screen's API, so the till can be tested without a
 * database. It prices with the shared engine, as the server does. All data is made up.
 */
import { priceBill } from '@ihealth/shared/pricing';

export const TILL_USER = Object.freeze({
  employeeId: 2,
  username: 'smoke.cashier',
  firstName: 'Smoke',
  lastName: 'Cashier',
  email: 'cashier@example.test',
  pharmacyId: 1,
  roles: [],
  // Sales Billing Submission, Sales Return Approval
  permissionIds: [6, 8],
});

/** Barcode of the made-up syrup. */
export const SYRUP_BARCODE = '6009900000017';
/** The made-up second person who may approve. */
/** Made-up registered customers. */
const CUSTOMERS = Object.freeze([
  { id: 104, name: 'Jane Testcase', phone: '0700000104' },
  { id: 221, name: 'Janet Example', phone: '0700000221' },
  { id: 342, name: 'John Sample', phone: '0700000342' },
]);

export const APPROVER = Object.freeze({ username: 'pat.pharmacist', pin: '4321' });
const APPROVAL_TOKEN = '11111111-2222-4333-8444-555555555555';

/** An M-Pesa code the mock says is already on another bill. */
export const USED_MPESA_CODE = 'QK00USED00';

const BATCHES = Object.freeze(
  [
    {
      stockId: 1,
      itemId: 10,
      itemName: 'Testamol 500mg tabs',
      itemCode: 'TST500',
      genericName: 'Testamolum',
      batchNo: 'TM-EARLY',
      barcode: null,
      expiryDate: '2030-01-31',
      expired: false,
      available: 40,
      labelPrice: '116.00',
      vatPercent: 16,
    },
    {
      stockId: 2,
      itemId: 10,
      itemName: 'Testamol 500mg tabs',
      itemCode: 'TST500',
      genericName: 'Testamolum',
      batchNo: 'TM-LATE',
      barcode: null,
      expiryDate: '2031-06-30',
      expired: false,
      available: 100,
      labelPrice: '116.00',
      vatPercent: 16,
    },
    {
      stockId: 3,
      itemId: 10,
      itemName: 'Testamol 500mg tabs',
      itemCode: 'TST500',
      genericName: 'Testamolum',
      batchNo: 'TM-OLD',
      barcode: null,
      expiryDate: '2020-01-31',
      expired: true,
      available: 5,
      labelPrice: '116.00',
      vatPercent: 16,
    },
    {
      stockId: 4,
      itemId: 20,
      itemName: 'Demo cough syrup 100ml',
      itemCode: 'DCS100',
      genericName: null,
      batchNo: 'DC-77',
      barcode: SYRUP_BARCODE,
      expiryDate: '2029-12-31',
      expired: false,
      available: 12,
      labelPrice: '450.00',
      vatPercent: 0,
    },
    {
      stockId: 5,
      itemId: 30,
      itemName: 'Hypotest 10mg tabs',
      itemCode: 'HYP10',
      genericName: null,
      batchNo: 'HT-3307',
      barcode: null,
      expiryDate: '2028-01-31',
      expired: false,
      available: 60,
      labelPrice: '640.00',
      vatPercent: 0,
      medicineKind: 'prescription',
    },
    {
      stockId: 6,
      itemId: 40,
      itemName: 'Amoxidemo 250mg caps',
      itemCode: 'AMX250',
      genericName: null,
      batchNo: 'AX-0912',
      barcode: null,
      expiryDate: '2027-08-31',
      expired: false,
      available: 30,
      labelPrice: '380.00',
      vatPercent: 0,
      medicineKind: 'antibiotic',
    },
    {
      stockId: 7,
      itemId: 50,
      itemName: 'Calmadol 50mg tabs',
      itemCode: 'CAL50',
      genericName: null,
      batchNo: 'CL-0420',
      barcode: null,
      expiryDate: '2028-04-30',
      expired: false,
      available: 120,
      labelPrice: '42.00',
      vatPercent: 0,
      medicineKind: 'controlled',
    },
  ].map((batch) => ({ medicineKind: null, ...batch })),
);

/** A made-up credit note the till can spend. */
export const CREDIT_NOTE = Object.freeze({
  id: 9,
  code: 'DPCN0611260001',
  customerName: 'Jane Testcase',
  amount: '893.00',
  balance: '893.00',
  expiresOn: '2027-11-06',
  originalBillCode: 'DPSB0211260012',
  problem: null,
});

/** Made-up doctors and hospitals. */
const HOSPITALS = Object.freeze([
  { id: 3, name: 'Sample Medical Centre' },
  { id: 4, name: 'Example Community Clinic' },
]);
const DOCTORS = Object.freeze([
  {
    id: 7,
    name: 'Amani Demo',
    licenseNumber: 'TEST-0001',
    hospitalId: 3,
    hospitalName: 'Sample Medical Centre',
  },
  { id: 8, name: 'Bora Example', licenseNumber: 'TEST-0002', hospitalId: null, hospitalName: null },
]);

/**
 * State both tills share, like the server's database.
 *
 * @returns {{ held: Map<number, Record<string, any>>, nextHeld: number, nextBill: number, approved: string | null, lastSale: Record<string, any> | null, doctors: { id: number, name: string, licenseNumber: string | null, hospitalId: number | null, hospitalName: string | null }[], lastLabels: Record<string, any> | null, controlledDrugRules: boolean }}
 */
export const createTillServer = () => ({
  held: new Map(),
  nextHeld: 1,
  nextBill: 1,
  /** @type {string | null} */ approved: null,
  /** @type {Record<string, any> | null} The last sale completed, as the till sent it. */ lastSale:
    null,
  doctors: [...DOCTORS],
  /** Whether the pharmacy requires the register's details for controlled drugs. */
  controlledDrugRules: true,
  /** @type {Record<string, any> | null} The last labels printed, as the till sent them. */ lastLabels:
    null,
});

/**
 * @param {Record<string, any>} sale A held sale with its lines.
 * @returns {Record<string, any>} What the list shows: everything but the lines.
 */
const summaryOf = (sale) =>
  Object.fromEntries(Object.entries(sale).filter(([field]) => field !== 'lines'));

/**
 * @param {{ stockId: number, quantity: number, discountPercent?: number }[]} lines
 * @returns {ReturnType<typeof priceBill>}
 */
const price = (lines) =>
  priceBill(
    lines.map((line) => {
      const batch = /** @type {(typeof BATCHES)[number]} */ (
        BATCHES.find((b) => b.stockId === line.stockId)
      );
      return {
        labelPrice: batch.labelPrice,
        quantity: line.quantity,
        discountPercent: line.discountPercent ?? 0,
        vatPercent: batch.vatPercent,
      };
    }),
    { roundingStep: 1 },
  );

/**
 * @param {import('@playwright/test').Page} page
 * @param {ReturnType<typeof createTillServer>} server
 */
export async function mockTillApi(page, server) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/', '');
    const key = `${request.method()} ${path}`;
    /**
     * @param {unknown} body
     * @param {number} [status]
     * @returns {Promise<void>}
     */
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (key === 'GET auth/me') return json({ data: TILL_USER });
    if (key === 'GET auth/csrf') return json({ data: { csrfToken: 'smoke' } });
    if (key === 'GET app-info')
      return json({
        data: {
          apiVersion: '1',
          pharmacy: { id: 1, name: 'Example Pharmacy', city: null, country: null },
          region: { locale: 'en-KE', currency: 'KES', timeZone: 'Africa/Nairobi' },
        },
      });
    if (key === 'GET sales/till-settings')
      return json({
        data: {
          selfDiscountLimit: 25,
          maxHeld: 30,
          quickCashNotes: [50, 100, 200, 500, 1000],
          chequeMaxAgeMonths: 6,
          canAcceptCheques: true,
          cancelAloneMinutes: 10,
          approvalReasons: ['Regular customer', 'Price match'],
          cancelReasons: ['Wrong item'],
          medicineTypes: [
            { kind: 'prescription', code: 'H', name: 'Prescription only' },
            { kind: 'controlled', code: 'X', name: 'Controlled' },
            { kind: 'antibiotic', code: 'H1', name: 'Antibiotic' },
          ],
          prescriptionPhotoMaxKb: 500,
          labelMaxCopies: 20,
          controlledDrugRules: server.controlledDrugRules,
        },
      });
    if (key === 'GET sales/doctors') {
      const words = (url.searchParams.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      return json({
        data: server.doctors.filter((doctor) =>
          words.every((word) =>
            String(doctor.name)
              .toLowerCase()
              .split(' ')
              .some((part) => part.startsWith(word)),
          ),
        ),
      });
    }
    if (key === 'POST sales/doctors') {
      const body = request.postDataJSON();
      const hospital = HOSPITALS.find((h) => h.id === body.hospitalId);
      const doctor = {
        id: 100 + server.doctors.length,
        name: `${body.firstName} ${body.lastName}`,
        licenseNumber: body.licenseNumber || null,
        hospitalId: hospital?.id ?? null,
        hospitalName: hospital?.name ?? null,
      };
      server.doctors.push(doctor);
      return json({ data: doctor }, 201);
    }
    if (key === 'GET sales/hospitals') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      return json({ data: HOSPITALS.filter((h) => h.name.toLowerCase().includes(q)) });
    }
    if (key === 'GET sales/banks')
      return json({
        data: [
          { id: 1, name: 'Example Bank' },
          { id: 2, name: 'Sample Bank' },
        ],
      });
    if (key === 'GET sales/customers') {
      const words = (url.searchParams.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      return json({
        data: CUSTOMERS.filter((customer) =>
          words.every((word) =>
            customer.name
              .toLowerCase()
              .split(' ')
              .some((part) => part.startsWith(word)),
          ),
        ),
      });
    }
    if (key === 'GET sales/batches') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const scanned = BATCHES.filter((b) => b.barcode === q);
      const found = scanned.length
        ? BATCHES.filter((b) => scanned.some((s) => s.itemId === b.itemId))
        : BATCHES.filter(
            (b) => b.itemName.toLowerCase().startsWith(q) || b.itemCode.toLowerCase().startsWith(q),
          );
      return json({ data: { batches: found, scanned: scanned.length > 0 } });
    }
    if (key === 'POST sales/quote') {
      const { lines } = request.postDataJSON();
      const priced = price(lines);
      return json({
        data: {
          lines: lines.map((/** @type {any} */ line, /** @type {number} */ index) => {
            const batch = /** @type {any} */ (BATCHES.find((b) => b.stockId === line.stockId));
            return {
              ...line,
              discountPercent: line.discountPercent ?? 0,
              itemId: batch.itemId,
              itemName: batch.itemName,
              itemCode: batch.itemCode,
              batchNo: batch.batchNo,
              expiryDate: batch.expiryDate,
              available: batch.available,
              vatPercent: batch.vatPercent,
              taxCode: null,
              labelPrice: batch.labelPrice,
              ...priced.lines[index],
              warnings: line.quantity > batch.available ? ['insufficientStock'] : [],
              needsApproval: (line.discountPercent ?? 0) > 25 ? ['discountAboveLimit'] : [],
              batchLabelPrice: batch.labelPrice,
              medicineKind: batch.medicineKind,
            };
          }),
          totals: priced,
          quantity: priced.quantity,
        },
      });
    }
    if (key === 'POST sales/approvals') {
      const body = request.postDataJSON();
      if (body.approver !== APPROVER.username)
        return json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Some fields are invalid.',
              details: [
                {
                  path: 'body.approver',
                  message: "You can't approve your own sale. Ask someone else.",
                },
              ],
            },
          },
          400,
        );
      if (body.pin !== APPROVER.pin)
        return json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Some fields are invalid.',
              details: [
                {
                  path: 'body.pin',
                  message: 'Wrong PIN. 2 tries left before it is locked for 15 minutes.',
                },
              ],
            },
          },
          400,
        );
      server.approved = APPROVAL_TOKEN;
      return json(
        {
          data: {
            token: APPROVAL_TOKEN,
            approvedBy: 'Pat Pharmacist',
            items: [],
            givenAway: '69.60',
          },
        },
        201,
      );
    }
    const noteOf = /^GET sales\/credit-notes\/(.+)$/.exec(key);
    if (noteOf) {
      if (decodeURIComponent(noteOf[1]) !== CREDIT_NOTE.code)
        return json(
          { error: { code: 'NOT_FOUND', message: 'No credit note has this number' } },
          404,
        );
      return json({ data: CREDIT_NOTE });
    }
    const labelsOf = /^(GET|POST) sales\/bills\/(\d+)\/labels$/.exec(key);
    if (labelsOf?.[1] === 'GET') {
      const sale = server.lastSale;
      return json({
        data: {
          billId: Number(labelsOf[2]),
          billCode: null,
          printedBefore: false,
          lines: (sale?.lines ?? []).map((/** @type {any} */ line, /** @type {number} */ index) => {
            const batch = /** @type {any} */ (BATCHES.find((b) => b.stockId === line.stockId));
            return {
              lineId: index + 1,
              itemName: batch.itemName,
              batchNo: batch.batchNo,
              expiryDate: batch.expiryDate,
              quantity: line.quantity,
              medicineKind: batch.medicineKind,
              suggestedText: null,
              savedText: null,
              savedCopies: null,
            };
          }),
        },
      });
    }
    if (labelsOf?.[1] === 'POST') {
      server.lastLabels = request.postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4' });
    }
    if (key === 'POST sales/bills') {
      const body = request.postDataJSON();
      const needs = body.lines.some((/** @type {any} */ line) => (line.discountPercent ?? 0) > 25);
      if (needs && body.approvalToken !== server.approved)
        return json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Some fields are invalid.',
              details: [
                {
                  path: 'body.approvalToken',
                  message: "This sale needs a second person's approval before it can be paid",
                },
              ],
            },
          },
          400,
        );
      const mpesaIndex = body.payments.findIndex((/** @type {any} */ p) => p.method === 'mpesa');
      if (mpesaIndex >= 0 && body.payments[mpesaIndex].reference === USED_MPESA_CODE) {
        return json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Some details need fixing.',
              details: [
                {
                  path: `body.payments.${mpesaIndex}.reference`,
                  message: 'This M-Pesa code is already on bill TSB0511260001',
                },
              ],
              requestId: 'req-till',
            },
          },
          400,
        );
      }
      server.lastSale = body;
      const priced = price(body.lines);
      const cash = body.payments.find((/** @type {any} */ p) => p.method === 'cash');
      const others = body.payments.filter((/** @type {any} */ p) => p.method !== 'cash');
      const cashDue =
        Number(priced.net) -
        others.reduce(
          (/** @type {number} */ sum, /** @type {any} */ p) => sum + Number(p.amount),
          0,
        );
      const id = server.nextBill++;
      return json(
        {
          data: {
            id,
            code: `TSB051126${String(id).padStart(4, '0')}`,
            payments: [
              ...(cash ? [{ method: 'cash', amount: cashDue.toFixed(2), reference: null }] : []),
              ...others.map((/** @type {any} */ p) => ({
                method: p.method,
                amount: p.amount,
                reference: p.reference,
              })),
            ],
            change: (Number(cash?.amount ?? 0) - cashDue).toFixed(2),
          },
        },
        201,
      );
    }
    if (key === 'GET sales/held')
      return json({
        data: [...server.held.values()].reverse().map(summaryOf),
      });
    if (key === 'POST sales/held') {
      const body = request.postDataJSON();
      const id = server.nextHeld++;
      const sale = {
        id,
        customerName: body.customerName ?? null,
        note: null,
        lineCount: body.lines.length,
        net: price(body.lines).net,
        heldBy: 'Smoke Cashier',
        heldAt: new Date().toISOString(),
        lines: body.lines,
      };
      server.held.set(id, sale);
      return json({ data: summaryOf(sale) }, 201);
    }
    const recall = /^sales\/held\/(\d+)\/recall$/.exec(path);
    if (request.method() === 'POST' && recall) {
      const sale = server.held.get(Number(recall[1]));
      if (!sale)
        return json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'This sale is no longer on hold. It may have been recalled at another till.',
              requestId: 'req-held',
            },
          },
          404,
        );
      server.held.delete(sale.id);
      return json({
        data: {
          id: sale.id,
          customerId: null,
          customerName: sale.customerName,
          customerPhone: null,
          note: null,
          lines: sale.lines.map((/** @type {any} */ line) => ({ discountPercent: 0, ...line })),
        },
      });
    }
    if (/^sales\/bills\/\d+\/receipt$/.test(path))
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF',
      });
    return json({ error: { code: 'NOT_FOUND', message: `No mock for ${key}` } }, 404);
  });
}

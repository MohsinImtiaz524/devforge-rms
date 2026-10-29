const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');

(async () => {
  const dist = path.resolve(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.replace(/^\/app\//, '');
    const file = relative.startsWith('assets/') ? path.join(dist, relative) : path.join(dist, 'index.html');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    fs.createReadStream(file).on('error', () => { res.statusCode = 404; res.end(); }).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const mutations = [], errors = [];
    let failUpdate = false;
    const sale = { id: 12, order_number: 1012, customer_name: 'Ali', order_type: 'dine_in', payment_method: 'cash', total: 1000, amount_received: 100, discount: 0, tax_percentage: 0, created_at: '2026-10-30T10:00:00Z', due: 900 };
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      let data = [], status = 200;
      if (url.pathname === '/api/auth/me') data = { user: { id: 1, shop_id: 1, name: 'Test admin', role: 'admin', shop_type: 'restaurant', shop_currency: 'PKR', permissions: ['sales.view', 'sales.update', 'settings.view'] } };
      else if (url.pathname === '/api/lobby') data = { modules: [], user: { id: 1, name: 'Test admin', role: 'admin' }, shop: { name: 'Test Shop' } };
      else if (url.pathname === '/api/sales') data = { rows: [sale], summary: {}, pagination: { page: 1, total_records: 1, total_pages: 1 } };
      else if (url.pathname.endsWith('/bill')) data = { sale, items: [{ product_name: 'Tea', quantity: 10, price_at_sale: 100 }] };
      else if (url.pathname === '/api/shop-settings/discounts') data = [{ id: 1, name: 'Ten percent', type: 'percentage', value: 10 }];
      else if (url.pathname === '/api/shop-settings/taxes') data = [{ id: 1, name: 'Card tax', percentage: 5, linked_payment_method: 'card' }];
      else if (url.pathname.endsWith('/inquiry-bill')) {
        mutations.push({ path: url.pathname, body: req.postDataJSON() });
        if (failUpdate) { status = 409; data = { error: 'Bill cannot be changed' }; } else data = { ok: true };
      } else if (url.pathname === '/api/print-jobs/queue') { mutations.push({ path: url.pathname, body: req.postDataJSON() }); data = { queued: 1 }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/app/sales?pending=1`);
    const openOptions = async () => {
      await page.getByTitle('Print Receipt', { exact: true }).click();
      await page.getByRole('button', { name: /Unpaid Bill/ }).click();
      await page.getByRole('dialog', { name: 'Unpaid Bill Options' }).waitFor();
    };
    await openOptions();
    assert.equal(mutations.length, 0, 'Opening options must not print or update');
    const dialog = page.getByRole('dialog', { name: 'Unpaid Bill Options' });
    await dialog.getByLabel('Customer Name (optional)').fill('New Customer');
    await dialog.getByLabel('Payment Method', { exact: true }).selectOption('card');
    await dialog.getByLabel('Tax (%)', { exact: true }).fill('5');
    await dialog.getByLabel('Discount preset', { exact: true }).selectOption('1');
    assert.equal(await dialog.getByLabel('Discount', { exact: true }).inputValue(), '100');
    await dialog.getByRole('button', { name: 'Update & Print Unpaid Bill' }).click();
    await page.getByText('Print sent to configured printer.', { exact: true }).waitFor();
    assert.deepEqual(mutations.map(entry => entry.path), ['/api/sales/12/inquiry-bill', '/api/print-jobs/queue']);
    assert.deepEqual(mutations[0].body, { customer_name: 'New Customer', payment_method: 'card', discount: 100, tax_percentage: 5 });
    assert.equal(mutations[1].body.format, 'unpaid');
    assert.ok(mutations.every(entry => !Object.hasOwn(entry.body, 'amount_received')));
    failUpdate = true;
    await openOptions();
    await dialog.getByRole('button', { name: 'Update & Print Unpaid Bill' }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Bill cannot be changed' }).waitFor();
    assert.equal(mutations.filter(entry => entry.path === '/api/print-jobs/queue').length, 1, 'Failed save must never print');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    fs.mkdirSync(path.resolve(__dirname, '../../tmp'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../../tmp/sales-unpaid-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('Sales unpaid popup verified: opens before print, edits and presets, save-before-print, error handling, mobile dark mode, Escape, and no payment collection.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

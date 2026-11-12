const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = 'http://127.0.0.1:5175/app/pos';
const source = fs.readFileSync(path.join(__dirname, 'pos-orders-parity.cjs'), 'utf8');
const setupSource = source.slice(source.indexOf('async function setup('), source.indexOf('\n(async'));
(async () => {
  const setup = eval('(' + setupSource.trim() + ')');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const { page, errors } = await setup(browser, ['orders.view', 'orders.create'], 'cashier', 1, { shopType: 'retail_restaurant' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:5175/app/pos');
    const cart = page.getByRole('button', { name: 'Open checkout', exact: true });
    await expect(cart).toBeVisible();
    for (const action of ['View Orders', 'Tables', 'Inbox']) {
      const control = page.getByRole(action === 'Inbox' ? 'link' : 'button', { name: action, exact: true });
      await expect(control).toBeVisible();
      await expect(control.locator('.pos-toolbar-label')).toBeHidden();
    }
    await expect(page.locator('.pos-inbox svg.lucide-bell')).toBeVisible();
    const before = await cart.boundingBox();
    assert.ok(before.x >= 330 && before.y <= 15);
    assert.equal(await cart.evaluate(el => getComputedStyle(el).position), 'fixed');
    const colors = await page.evaluate(() => [getComputedStyle(document.querySelector('.pos-mobile-cart')).backgroundColor, getComputedStyle(document.querySelector('.pos-toolbar-action')).backgroundColor]);
    assert.notEqual(colors[0], colors[1]);
    await page.evaluate(() => window.scrollTo(0, 300));
    const after = await cart.boundingBox();
    assert.equal(after.y, before.y);
    await cart.click();
    await expect(page.locator('.pos-checkout')).toBeVisible();
    await page.locator('.pos-checkout').getByRole('button', { name: 'Close checkout', exact: true }).click();
    await page.getByRole('button', { name: 'View Orders', exact: true }).click();
    await page.locator('.order-cards').getByRole('button', { name: 'Print', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Kitchen Print/ })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('PASS: mobile icon toolbar, bell, fixed distinct cart, checkout, and kitchen print menu');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

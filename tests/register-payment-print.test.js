const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(printReceipt = async () => {}) {
  const notices = [];
  const c = { printReceipt, RECEIPT_FORMATS: { CUSTOMER: 'customer' }, toast: (...args) => notices.push(args), shopCurrencyCode: () => 'PKR', escapeOrderValue: String };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('public/js/register-payments.js', 'utf8'), c);
  return { c, notices };
}
test('payment rows print the internal order ID and keep empty table aligned', () => {
  const { c } = setup();
  const html = c.renderRegisterPaymentRows([{ order_id: 42, order_number: 7 }]);
  assert.match(html, /printRegisterPaymentReceipt\(42, this\)/);
  assert.match(html, /aria-label="Print paid receipt"/);
  assert.match(c.renderRegisterPaymentRows([]), /colspan="6"/);
});
test('paid receipt uses customer routing without browser fallback', async () => {
  const calls = [];
  const { c } = setup(async (...args) => calls.push(args));
  const button = { disabled: false };
  await c.printRegisterPaymentReceipt(42, button);
  assert.equal(calls[0][0], 42);
  assert.equal(calls[0][1], 'customer');
  assert.equal(calls[0][2].browserFallback, false);
  assert.equal(button.disabled, false);
});
test('invalid orders never print', async () => {
  let count = 0;
  const { c, notices } = setup(async () => count++);
  for (const id of [0, -1, NaN, '42', null]) await c.printRegisterPaymentReceipt(id);
  assert.equal(count, 0);
  assert.equal(notices.length, 5);
});
test('duplicate clicks are suppressed and failure permits a later retry', async () => {
  let reject, calls = 0;
  const { c } = setup(() => { calls++; return new Promise((resolve, fail) => { reject = fail; }); });
  const button = { disabled: false };
  const first = c.printRegisterPaymentReceipt(42, button);
  assert.equal(button.disabled, true);
  await c.printRegisterPaymentReceipt(42, button);
  assert.equal(calls, 1);
  reject(new Error('offline'));
  await assert.rejects(first, /offline/);
  assert.equal(button.disabled, false);
  const retry = c.printRegisterPaymentReceipt(42, button);
  assert.equal(calls, 2);
  reject(new Error('offline'));
  await assert.rejects(retry, /offline/);
});

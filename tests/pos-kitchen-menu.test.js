const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/app.js'), 'utf8');
const eligibility = source.slice(source.indexOf('function canPrintKitchenReceipt()'), source.indexOf('async function printReceipt('));
const menu = source.slice(source.indexOf('function showReceiptPrintMenu('), source.indexOf('async function printBill('));
for (const shopType of ['restaurant', 'retail_restaurant', 'retail', undefined]) {
  test(`legacy print menu eligibility for ${shopType}`, () => {
    let html;
    const context = { currentUser: { shop_type: shopType }, window: {}, openModal: (_title, content) => { html = content; } };
    vm.createContext(context);
    vm.runInContext(eligibility + menu + '\nshowReceiptPrintMenu(42)', context);
    assert.equal(html.includes('printKitchenReceipt(42)'), ['restaurant', 'retail_restaurant'].includes(shopType));
    assert.ok(html.includes('Customer Bill'));
    assert.ok(html.includes('Unpaid Bill'));
    vm.runInContext('showReceiptPrintMenu(42, false)', context);
    assert.equal(html.includes('printKitchenReceipt(42)'), false);
  });
}

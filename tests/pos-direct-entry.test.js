const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/app.js'), 'utf8');
function functionSource(name, next) {
  return source.slice(source.indexOf(name), source.indexOf(next, source.indexOf(name)));
}

test('checkout rejects an unselected or unavailable type before any request', async () => {
  for (const type of ['', 'disabled_type']) {
    let focused = false, message = '';
    const context = { _posCheckoutSubmitting: false, cart: [{}], window: { _posOrderType: type },
      getPOSAllowedOrderTypes: () => ['dine_in'], $c: () => ({ focus() { focused = true; } }),
      toast(value) { message = value; } };
    vm.createContext(context);
    vm.runInContext(functionSource('async function checkout(', '\nasync function '), context);
    await context.checkout('pending');
    assert.equal(focused, true);
    assert.equal(message, 'Please select an order type before placing the order.');
    assert.equal(context._posCheckoutSubmitting, false);
  }
});

test('changing checkout type keeps cart items and resets service-specific fields', async () => {
  let renders = 0, opens = 0;
  const item = { product_id: 12, quantity: 2 };
  const context = { _posCheckoutSubmitting: false, _editingOrderId: null, cart: [item], window: {},
    currentUserHasPermission: () => true, getPOSAllowedOrderTypes: () => ['delivery'],
    capturePOSLayoutState: () => ({ values: { 'pos-table': '3', 'pos-waiter': '8', 'pos-discount': '10' } }),
    renderPOS: async () => { renders++; }, openPOSCheckout: () => { opens++; } };
  vm.createContext(context);
  vm.runInContext(functionSource('async function selectPOSCheckoutOrderType(', '\nasync function startPOSOrder'), context);
  await context.selectPOSCheckoutOrderType('delivery');
  assert.equal(context.window._posLayoutRestore.cart[0], item);
  assert.equal(context.window._posLayoutRestore.form.orderType, 'delivery');
  assert.equal(context.window._posLayoutRestore.form.values['pos-table'], undefined);
  assert.equal(context.window._posLayoutRestore.form.values['pos-discount'], '10');
  assert.equal(renders, 1);
  assert.equal(opens, 1);
});

test('fresh order returns directly to terminal with no selected type', () => {
  const context = { window: {}, cart: [{}], stopPOSOrdersPolling() {}, closePOSCheckout() {}, closePOSMobileCategories() {}, renderPOS() { return 'terminal'; } };
  vm.createContext(context);
  vm.runInContext(functionSource('function returnToPOSOrderTypeSelection()', '\nfunction restorePOSLayoutState'), context);
  assert.equal(context.startFreshPOSOrder(), 'terminal');
  assert.equal(context.window._posOrderType, null);
  assert.equal(context.window._posEntryOrderType, null);
  assert.equal(context.cart.length, 0);
});

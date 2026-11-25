const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSaleReceiptPage } = require('../services/ReceiptPrintService');
const { prepareData } = require('../src/modules/escpos-print/escpos-print.data');
const encoder = require('../src/modules/escpos-print/escpos-encoder');
const templates = require('../src/modules/escpos-print/receipt-templates.json');

function details(orderType, address) {
  return { sale: { id: 1, order_type: orderType, delivery_address: address,
    created_at: '2026-11-25T10:00:00Z', total: 100 },
  items: [{ name: 'Tea', quantity: 1, price_at_sale: 100 }], shop: {} };
}

test('paid and unpaid delivery receipts escape addresses and preserve wrapping', () => {
  for (const format of ['customer', 'unpaid']) {
    for (const type of ['delivery', 'foodpanda']) {
      const html = renderSaleReceiptPage(details(type, ' Block <4> & Road\nFloor 2 '), { format, autoPrint: false });
      assert.match(html, /Delivery Address:<\/strong> Block &lt;4&gt; &amp; Road\nFloor 2/);
      assert.match(html, /white-space: pre-wrap; overflow-wrap: anywhere/);
    }
  }
});

test('server templates print delivery addresses using the existing encoder on both widths', () => {
  encoder.validateTemplates(templates);
  const address = 'House 123 Block 456 Main Road Near Market\nSecond floor';
  for (const format of ['customer', 'unpaid']) {
    for (const type of ['delivery', 'foodpanda']) {
      for (const columns of [32, 48]) {
        const document = { ...details(type, address), format };
        document.data = prepareData(document);
        assert.equal(document.data.deliveryAddress, address);
        const output = encoder.encode(document, { receipt: {}, assets: [], templates }, columns).toString('latin1');
        assert.match(output, /Delivery Address:/);
        assert.match(output, /Second floor/);
        assert.ok(output.indexOf('Delivery Address:') < output.indexOf('Type:'));
      }
    }
  }
});

test('missing addresses and non-delivery orders do not add a receipt field', () => {
  for (const [type, address] of [['delivery', undefined], ['delivery', null], ['delivery', '  '], ['takeaway', 'Old address'], ['dine_in', 'Old address']]) {
    for (const format of ['customer', 'unpaid', 'kitchen']) {
      const document = { ...details(type, address), format };
      assert.doesNotMatch(renderSaleReceiptPage(document, { format, autoPrint: false }), /Delivery Address:/);
      document.data = prepareData(document);
      const output = encoder.encode(document, { receipt: {}, assets: [], templates }, 32).toString('latin1');
      assert.doesNotMatch(output, /Delivery Address:/);
    }
  }
});

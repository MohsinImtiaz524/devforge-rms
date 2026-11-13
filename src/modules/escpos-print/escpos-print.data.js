// RMS prepares values; templates own placement and the agent only renders primitives.
function prepareData(document, receipt = {}, timeZone = 'Asia/Karachi') {
  const sale = document.sale || {};
  const quotes = document.payment_quotes || require('../../../utils/unpaid-payment-quotes').unpaidPaymentQuotes(sale, document.items || []);
  const items = document.items || [];
  const money = value => Number(value || 0).toFixed(2);
  const payment = value => ({ cash: 'Cash', card: 'Card', online: 'Online Transfer' }[value] || String(value || 'Cash').toUpperCase());
  const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || []; } catch (_) { return []; } };
  const created = String(sale.created_at || '');
  const date = new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(created) ? created.replace(' ', 'T') + 'Z' : created);
  const shortTime = value => value.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' });
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price_at_sale || 0), 0);
  const total = Number(sale.total || 0), discount = Number(sale.discount || 0), tip = Number(sale.tip_amount || 0);
  const received = Math.max(0, Number(sale.amount_received || 0));
  const standalone = sale.tip_collection_mode === 'standalone';
  const remaining = total + (standalone ? 0 : tip) - received;
  const orderType = { dine_in: 'Dine-in', takeaway: 'Takeaway', walk_in: 'Walk-in' }[sale.order_type] || 'Delivery';
  return {
    number: sale.order_number || sale.id, date: Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { timeZone }),
    time: Number.isNaN(date.getTime()) ? '' : shortTime(date), generatedTime: shortTime(new Date(document.generated_at || Date.now())),
    staff: document.seller?.name || 'Staff', customer: sale.customer_name || 'Walk-in', phone: sale.customer_phone || '',
    orderType, upperOrderType: orderType.toUpperCase(), method: payment(sale.payment_method), tipMethod: payment(sale.tip_payment_method || sale.payment_method),
    kitchenName: String(document.route_label || sale.kitchen_name || 'Kitchen').replace(/^Kitchen:\s*/i, ''),
    updateLabel: document.is_update ? ' - UPDATED' : '', hasTable: Boolean(sale.table_id), table: sale.table_number || 'N/A', token: sale.token_number || '', note: sale.special_instructions || '',
    currency: receipt.currency && receipt.currency !== 'PKR' ? receipt.currency : 'Rs.', subtotal: subtotal.toFixed(0),
    cashDue: money(quotes[0].due), cardDue: money(quotes[1].due), cashTotal: money(quotes[0].total), cardTotal: money(quotes[1].total), cashTax: quotes[0].tax_percentage, cardTax: quotes[1].tax_percentage,
    total: money(total), discount: money(discount), hasDiscount: discount > 0, taxPercentage: sale.tax_percentage || 0,
    tax: money((subtotal - discount) * Number(sale.tax_percentage || 0) / 100), hasTax: Number(sale.tax_percentage) > 0,
    tip: money(tip), hasTip: tip > 0, standaloneTip: standalone && tip > 0, collected: money(Math.min(received, total) + tip),
    received: money(received), amountPaid: money(Math.min(received, total)), due: money(Math.max(remaining, 0)), change: money(Math.abs(remaining)), hasDue: remaining > 0, hasChange: remaining <= 0,
    items: items.map(item => {
      const variants = Object.values(parse(item.variants_json || item.variants)).map(v => v?.name || v?.label || v?.value || v).filter(Boolean);
      const addons = Object.values(parse(item.addons_json || item.addons)).map(a => `${a?.name || a?.label || a}${Number(a?.selection_quantity) > 1 ? ` x${a.selection_quantity}` : ''}`).filter(Boolean);
      const name = `${item.product_name || item.custom_name || item.name || 'Item'}${variants.length ? ` ${variants.join(' ')}` : ''}${addons.length ? ` - ${addons.join(', ')} (Add-ons)` : ''}`;
      return { name, quantity: item.quantity, price: Number(item.price_at_sale || 0).toFixed(0), total: (Number(item.quantity || 0) * Number(item.price_at_sale || 0)).toFixed(0),
        kitchenDescription: [item.change_action ? item.change_action === 'remove' ? 'REMOVE' : 'ADD' : '', name, item.special_instructions ? `NOTE: ${item.special_instructions}` : ''].filter(Boolean).join('\n') };
    })
  };
}
module.exports = { prepareData };

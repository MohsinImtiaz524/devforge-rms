// Read-only reference totals. Keep the saved sale and payment untouched.
function unpaidPaymentQuotes(sale, items, taxes = []) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price_at_sale || 0), 0);
  const taxable = subtotal - Number(sale.discount || 0);
  const dineInServiceCharge = sale.order_type === 'dine_in' ? Math.round(taxable * Number(sale.dine_in_service_charge_percentage || 0)) / 100 : 0;
  return ['cash', 'card'].map(method => {
    const preset = taxes.find(tax => tax.linked_payment_method === method);
    const percentage = Number(preset?.percentage ?? sale.tax_percentage ?? 0);
    const total = (Math.round((taxable + taxable * percentage / 100) * 100) + Math.round(Number(sale.delivery_service_charge || 0) * 100) + Math.round(dineInServiceCharge * 100)) / 100;
    return { method, tax_percentage: percentage, total, due: Math.max(0, Math.round((total - Number(sale.amount_received || 0)) * 100) / 100) };
  });
}
module.exports = { unpaidPaymentQuotes };

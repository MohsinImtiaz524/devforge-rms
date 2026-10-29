import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { formatShopCurrency } from '../../currency';

export function UnpaidBillOptions({ data, onPrint }) {
  const sale = data.sale || {};
  const subtotal = (data.items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price_at_sale || 0), 0);
  const [name, setName] = useState(sale.customer_name || '');
  const [method, setMethod] = useState(sale.payment_method || 'cash');
  const [discount, setDiscount] = useState(sale.discount || 0);
  const [tax, setTax] = useState(sale.tax_percentage || 0);
  const [presets, setPresets] = useState({ discounts: [], taxes: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameInput = useRef(null);
  useEffect(() => { nameInput.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api('/api/shop-settings/discounts').catch(() => []), api('/api/shop-settings/taxes').catch(() => [])])
      .then(([discounts, taxes]) => { if (active) setPresets({ discounts: Array.isArray(discounts) ? discounts : [], taxes: Array.isArray(taxes) ? taxes : [] }); });
    return () => { active = false; };
  }, []);
  const discountValue = Math.max(0, Number(discount) || 0);
  const taxValue = Math.max(0, Number(tax) || 0);
  const taxAmount = (subtotal - discountValue) * taxValue / 100;
  const total = subtotal - discountValue + taxAmount;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!Number.isFinite(Number(discount)) || !Number.isFinite(Number(tax)) || Number(discount) < 0 || Number(tax) < 0 || discountValue > subtotal) {
      setError('Enter a valid tax and a discount between zero and the bill subtotal.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api(`/api/sales/${sale.id}/inquiry-bill?view=sales_panel`, { method: 'PATCH', body: {
        customer_name: name.trim(), payment_method: method, discount: discountValue, tax_percentage: taxValue
      } });
      await onPrint(sale.id, 'unpaid');
    } catch (requestError) { setError(requestError.message || 'Could not update unpaid bill'); }
    finally { setBusy(false); }
  }
  return <form className="sales-form" onSubmit={submit}>
    <label>Customer Name (optional)<input ref={nameInput} value={name} maxLength={120} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
    <div className="sales-form-grid">
      <label htmlFor="unpaid-method">Payment Method<select id="unpaid-method" aria-label="Payment Method" value={method} onChange={event => {
        const next = event.target.value; setMethod(next);
        const linked = presets.taxes.find(preset => preset.linked_payment_method === next);
        if (linked) setTax(linked.percentage);
      }}><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online Transfer</option></select></label>
      <label>Tax (%)<input type="number" min="0" step="0.01" value={tax} onChange={event => setTax(event.target.value)} /></label>
    </div>
    <label htmlFor="unpaid-discount-preset">Discount preset<select id="unpaid-discount-preset" aria-label="Discount preset" defaultValue="" onChange={event => {
      const preset = presets.discounts.find(entry => String(entry.id) === event.target.value);
      if (preset) setDiscount(preset.type === 'percentage' ? subtotal * Number(preset.value) / 100 : Number(preset.value));
    }}><option value="">Presets</option>{presets.discounts.map(preset => <option key={preset.id} value={preset.id}>{preset.name} ({preset.type === 'percentage' ? `${preset.value}%` : formatShopCurrency(preset.value)})</option>)}</select></label>
    <label>Discount<input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={event => setDiscount(event.target.value)} /></label>
    <div className="sales-summary">
      <div><span>Subtotal</span><strong>{formatShopCurrency(subtotal)}</strong></div>
      <div><span>Discount</span><strong>- {formatShopCurrency(discountValue)}</strong></div>
      <div><span>Tax</span><strong>{formatShopCurrency(taxAmount)}</strong></div>
      <div><span>Grand Total</span><strong>{formatShopCurrency(total)}</strong></div>
      <div><span>Remaining Due</span><strong>{formatShopCurrency(Math.max(total - Number(sale.amount_received || 0), 0))}</strong></div>
    </div>
    <p>No payment will be recorded.</p>
    {error && <p role="alert" className="sales-error">{error}</p>}
    <button type="submit" className="sales-primary bg-green-500" disabled={busy}>{busy ? 'Updating & printing…' : 'Update & Print Unpaid Bill'}</button>
  </form>;
}

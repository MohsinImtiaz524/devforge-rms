import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Printer } from 'lucide-react';
import { api } from '../../api/client';
import { formatShopCurrency } from '../../currency';
import './unpaid-bill-options.css';

const moneyRound = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function discountAmountFromPercentage(subtotal, percentage) {
  return moneyRound(Math.max(0, Number(subtotal) || 0) * Math.max(0, Number(percentage) || 0) / 100);
}

function discountPercentageFromAmount(subtotal, amount) {
  const billSubtotal = Math.max(0, Number(subtotal) || 0);
  if (!billSubtotal) return 0;
  return Number((Math.max(0, Number(amount) || 0) * 100 / billSubtotal).toFixed(6));
}

export function UnpaidBillOptions({ data, onPrint, onCancel, requestView = 'sales_panel' }) {
  const sale = data.sale || {};
  const subtotal = (data.items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price_at_sale || 0), 0);
  const [discountPercentage, setDiscountPercentage] = useState(() => discountPercentageFromAmount(subtotal, sale.discount));
  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const discountInput = useRef(null);
  useEffect(() => { discountInput.current?.focus(); }, []);
  useEffect(() => {
    let active = true;
    api('/api/shop-settings/discounts').catch(() => []).then(discounts => {
      if (active) setPresets(Array.isArray(discounts) ? discounts : []);
    });
    return () => { active = false; };
  }, []);
  const percentageValue = Math.max(0, Number(discountPercentage) || 0);
  const discountValue = discountAmountFromPercentage(subtotal, percentageValue);
  const taxValue = Math.max(0, Number(sale.tax_percentage) || 0);
  const deliveryServiceCharge = Math.max(0, Number(sale.delivery_service_charge) || 0);
  const dineInServiceCharge = sale.order_type === 'dine_in' ? moneyRound(Math.max(0, subtotal - discountValue) * Math.max(0, Number(sale.dine_in_service_charge_percentage) || 0) / 100) : 0;
  const serviceCharge = deliveryServiceCharge + dineInServiceCharge;
  const taxAmount = moneyRound((subtotal - discountValue) * taxValue / 100);
  const total = moneyRound(subtotal - discountValue + taxAmount + serviceCharge);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!Number.isFinite(Number(discountPercentage)) || percentageValue < 0 || percentageValue > 100) {
      setError('Enter a discount percentage between 0 and 100.');
      return;
    }
    setBusy(true); setError('');
    try {
      const viewQuery = requestView ? `?view=${encodeURIComponent(requestView)}` : '';
      await api(`/api/sales/${sale.id}/inquiry-bill${viewQuery}`, { method: 'PATCH', body: { discount: discountValue } });
      await onPrint(sale.id, 'unpaid');
    } catch (requestError) { setError(requestError.message || 'Could not update unpaid bill'); }
    finally { setBusy(false); }
  }
  return <form className="payment-form payment-compact unpaid-bill-form" onSubmit={submit}>
    <div className="payment-context"><span>Order #{sale.order_number || sale.id}</span><span>Payment pending</span></div>
    <div className="payment-layout">
      <section className="payment-fields" aria-label="Apply unpaid bill discount">
        {presets.length > 0 && <fieldset className="payment-option-group"><legend>Discount presets</legend><div className="payment-option-cards discount-option-cards">{presets.map(preset => <button type="button" key={preset.id} aria-pressed={selectedPreset === String(preset.id)} onClick={() => {
          setSelectedPreset(String(preset.id));
          setDiscountPercentage(preset.type === 'percentage' ? Number(preset.value) : discountPercentageFromAmount(subtotal, preset.value));
        }}><b>{preset.name}</b><small>{preset.type === 'percentage' ? `${preset.value}%` : formatShopCurrency(preset.value)}</small></button>)}</div></fieldset>}
        <label className="unpaid-custom-discount">Custom discount (%)<div className="unpaid-percentage-input"><input ref={discountInput} aria-label="Discount percentage" type="number" min="0" max="100" step="0.01" value={discountPercentage} onChange={event => { setSelectedPreset(''); setDiscountPercentage(event.target.value); }} /><span aria-hidden="true">%</span></div></label>
        <small className="payment-hint unpaid-bill-note">Apply an optional discount, review the bill total, then print. No payment or customer details will be changed.</small>
      </section>
      <aside className="payment-summary" aria-label="Unpaid bill summary">
        <dl>
          <div><dt>Subtotal</dt><dd>{formatShopCurrency(subtotal)}</dd></div>
          <div><dt>Discount ({percentageValue || 0}%)</dt><dd>- {formatShopCurrency(discountValue)}</dd></div>
          <div><dt>Tax</dt><dd>{formatShopCurrency(taxAmount)}</dd></div>
          {deliveryServiceCharge > 0 && <div><dt>Delivery service charge</dt><dd>{formatShopCurrency(deliveryServiceCharge)}</dd></div>}
          {dineInServiceCharge > 0 && <div><dt>Dine-in service charge</dt><dd>{formatShopCurrency(dineInServiceCharge)}</dd></div>}
          <div className="payment-grand-total"><dt>Grand Total</dt><dd>{formatShopCurrency(total)}</dd></div>
        </dl>
        <div className="payment-balance due"><span>Remaining Due</span><strong>{formatShopCurrency(Math.max(total - Number(sale.amount_received || 0), 0))}</strong></div>
      </aside>
    </div>
    {error && <p role="alert" className="unpaid-bill-error">{error}</p>}
    <footer className="payment-footer">
      {onCancel && <button type="button" className="payment-cancel" disabled={busy} onClick={onCancel}>Cancel</button>}
      <button type="submit" className="primary unpaid-bill-print" disabled={busy}>{busy ? <><LoaderCircle className="pos-spin" size={16}/> Saving & printing…</> : <><Printer size={16}/> Save & Print Unpaid Bill</>}</button>
    </footer>
  </form>;
}

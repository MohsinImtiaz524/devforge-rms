function prepareShiftData(details) {
  const { shift, summary: s, shop } = details;
  const currency = shop?.currency && shop.currency !== 'PKR' ? shop.currency : 'Rs.';
  const money = value => `${currency} ${Number(value || 0).toFixed(2)}`;
  const date = value => value ? new Date(value).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const rows = [];
  const row = (label, value, bold = false) => rows.push({ label, value: String(value ?? 0), bold });
  const section = label => rows.push({ section: label });
  const fields = entries => entries.forEach(([label, key, count, negative]) => row(label, count ? s[key] || 0 : `${negative ? '- ' : ''}${money(s[key])}`));
  const sales = details.sales || [], ledger = details.ledgerEntries || [], drops = details.cashDrops || [];
  const expected = Number(shift.expected_balance ?? s.expected_balance ?? 0);
  const difference = Number(shift.closing_balance || 0) - expected;
  row('Cashier', shift.cashier_name || shift.cashier_username || `User #${shift.user_id}`);
  row('Date', shift.start_time ? new Date(shift.start_time).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' }) : '-');
  row('Shift', `#${shift.id}`); row('Started', date(shift.start_time)); row('Closed', date(shift.end_time));
  const minutes = Math.round(Math.max(0, new Date(shift.end_time) - new Date(shift.start_time)) / 60000);
  row('Duration', `${Math.floor(minutes / 60)}h ${minutes % 60}m`);
  if (shift.terminal_id) row('Terminal', shift.terminal_id);
  row('Opening petty cash', money(s.opening_balance), true);
  section('ORDERS & SALES');
  fields([['Total orders','total_orders',true],['Cash orders','cash_orders',true],['Cash sales (excl. tax)','cash_sales_ex_tax'],['Cash tax','cash_tax'],['Card orders','card_orders',true],['Card sales (excl. tax)','card_sales_ex_tax'],['Card tax','card_tax'],['Online orders','online_orders',true],['Online sales (excl. tax)','online_sales_ex_tax'],['Online tax','online_tax']]);
  section('UNPAID / PENDING BILLS');
  const paid = ledger.reduce((map, entry) => { if (entry.type === 'payment') map[entry.sale_id] = (map[entry.sale_id] || 0) + Number(entry.amount || 0); return map; }, {});
  const pending = sales.map(sale => ({ ...sale, outstanding: Math.max(0, Number(sale.total || 0) - Math.min(Number(sale.total || 0), Number(sale.amount_received || 0)) - (paid[sale.id] || 0)) }))
    .filter(sale => sale.order_status === 'payment_pending' || sale.outstanding > .01);
  if (!pending.length) row('Pending bills', 'None');
  for (const sale of pending) row(`#${sale.order_number || sale.id}`, money(sale.outstanding || sale.total));
  row('Total sales (excl. tax)', money(s.total_sales_ex_tax), true); row('Total tax', money(s.total_tax), true); row('Total collected (sales + tax)', money(s.total_sales_collected), true);
  section('TIPS - SEPARATE FROM SALES');
  fields([['Cash tips','cash_tips'],['Card tips','card_tips'],['Online tips','online_tips'],['Total tips','total_tips']]);
  section('CASH DRAWER');
  fields([['Opening petty cash','opening_balance'],['Cash collected (sales + tax)','net_cash_sales'],['Cash due collections','debt_collections'],['Cash refunds','total_cash_refunds',false,true],['Cash tips','cash_tips']]);
  row('Cash before drop', money(Number(s.opening_balance || 0) + Number(s.net_cash_sales || 0) + Number(s.debt_collections || 0) + Number(s.cash_tips || 0) - Number(s.total_cash_refunds || 0)), true);
  row('Cash drop', `- ${money(s.cash_drops)}`);
  row('Cash drop reason', drops.filter(drop => drop.status === 'verified').map(drop => drop.note).filter(Boolean).join('; ') || '-');
  row('Verified handovers', `- ${money(s.cash_handovers)}`);
  const pendingVerification = Number(s.pending_cash_drops || 0) + Number(s.pending_cash_handovers || 0);
  if (pendingVerification) row('Pending verification', `- ${money(pendingVerification)}`);
  row('Expected closing cash', money(expected), true); row('Actual closing cash', money(shift.closing_balance), true); row('Difference (over/short)', money(difference), true);
  section(Math.abs(difference) <= .01 ? 'BALANCED' : difference > 0 ? `OVER +${money(difference)}` : `SHORT -${money(Math.abs(difference))}`);
  section('ORDER RANGE');
  row('First order #', sales.length ? `#${sales[0].order_number || sales[0].id}` : '-'); row('Last order #', sales.length ? `#${sales.at(-1).order_number || sales.at(-1).id}` : '-');
  section('OTHER RECONCILIATION');
  fields([['Cash due collections','debt_collections'],['Card due collections','card_collections'],['Online due collections','online_collections'],['Cash refunds','total_cash_refunds',false,true],['Card refunds','total_card_refunds',false,true],['Online refunds','total_online_refunds',false,true]]);
  row('Refund transactions', (details.returns || []).length);
  row('Business expenses', `- ${money(s.total_expenses)}`); row('EXPECTED TOTAL', money(s.expected_total), true); row('EXPECTED CARD', money(s.expected_card)); row('EXPECTED ONLINE', money(s.expected_online));
  if (shift.note) { section('CLOSING NOTE'); row('', shift.note); }
  if (shift.shortage_reason) { section('DISCREPANCY REASON'); row('', shift.shortage_reason); }
  return { shiftRows: rows, shopName: shop?.name || 'RESTAURANT', printedAt: date(new Date()) };
}
module.exports = { prepareShiftData };

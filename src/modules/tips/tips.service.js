const db = require('../../../db/knex');
const { getTipOrderDateRange } = require('./tips-date-range');

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function toCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999999) {
    throw invalid('Tip must be a valid non-negative amount.');
  }
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.00001) throw invalid('Tip supports at most two decimal places.');
  return cents;
}
function validateTip(amount, total, received) {
  const cents = toCents(amount);
  if (cents > 0 && (!Number.isFinite(Number(received)) || !Number.isFinite(Number(total)) ||
    Math.round(Number(received) * 100) < Math.round(Number(total) * 100) + cents)) {
    throw invalid('Amount received must cover the bill and tip.');
  }
  return cents;
}

// Caller owns the transaction and locks the sale. One immutable collection per
// order makes retries safe and preserves the original collector and shift.
async function collect(trx, { saleId, shopId, userId, amount, total, received, paymentMethod }) {
  const sale = await trx('sales').where({ id: saleId, shop_id: shopId }).forUpdate().first();
  if (!sale) throw invalid('Sale not found.', 404);
  const existing = await trx('sale_tips').where({ shop_id: shopId, sale_id: saleId }).first();
  const cents = validateTip(amount === undefined ? Number(existing?.amount_cents || 0) / 100 : amount, total, received);
  if (existing) {
    if (Number(existing.amount_cents) !== cents) throw invalid('A collected tip cannot be edited. It remains in its original shift.', 409);
    return;
  }
  if (!cents) return;
  if (!['cash', 'card', 'online'].includes(paymentMethod)) throw invalid('Invalid tip payment method.');
  const shift = await trx('shifts').where({ shop_id: shopId, user_id: userId, status: 'open' }).forUpdate().first();
  if (!shift) throw invalid('You must open a register shift to collect a tip.');
  await trx('sale_tips').insert({ shop_id: shopId, sale_id: saleId, shift_id: shift.id,
    collected_by: userId, amount_cents: cents, payment_method: paymentMethod, collection_mode: 'checkout' });
  await trx('sales').where({ id: saleId, shop_id: shopId }).update({ tip_amount: cents / 100 });
}

function applyOrderVisibility(query, user) {
  const role = String(user?.role || '').toLowerCase();
  if (['waiter', 'order_taker'].includes(role)) {
    query.andWhere(function () { this.where('s.user_id', user.id).orWhere('s.waiter_id', user.id); });
  } else if (!['admin', 'superadmin', 'manager', 'pos_user'].includes(role)) {
    query.andWhere(function () { this.where('s.user_id', user.id).orWhere('s.waiter_id', user.id); });
  }
}

async function listEligibleOrders(shopId, user, filters = {}) {
  const search = String(filters.search || '').trim().slice(0, 80);
  const tableId = Number(filters.tableId) || null;
  const range = getTipOrderDateRange(filters);
  const isPostgres = db.client.config.client === 'pg';
  const completedAt = db.raw(isPostgres ? 'COALESCE(s.payment_received_at, s.updated_at, s.created_at)' : 'datetime(COALESCE(s.payment_received_at, s.updated_at, s.created_at))');
  const timestamp = value => isPostgres ? value : value.replace('T', ' ').slice(0, 19);
  const query = db('sales as s')
    .leftJoin('tables as t', 's.table_id', 't.id')
    .leftJoin('sale_tips as tip', function () { this.on('tip.sale_id', 's.id').andOn('tip.shop_id', 's.shop_id'); })
    .where({ 's.shop_id': shopId, 's.order_status': 'completed' })
    .whereRaw('COALESCE(s.amount_received, 0) >= COALESCE(s.total, 0) - 0.01')
    .whereNull('tip.id')
    .modify(q => { if (range) q.where(completedAt, '>=', timestamp(range.start)).andWhere(completedAt, '<', timestamp(range.end)); })
    .modify(q => {
      applyOrderVisibility(q, user);
      if (tableId) q.where('s.table_id', tableId);
      if (search) q.andWhere(function () {
        this.whereRaw('CAST(COALESCE(s.order_number, s.id) AS TEXT) LIKE ?', [`%${search}%`])
          .orWhereRaw('LOWER(COALESCE(t.table_number, ?)) LIKE ?', ['', `%${search.toLowerCase()}%`])
          .orWhereRaw('LOWER(COALESCE(s.customer_name, ?)) LIKE ?', ['', `%${search.toLowerCase()}%`]);
      });
    })
    .select('s.id', 's.order_number', 's.order_type', 's.table_id', 't.table_number', 's.customer_name',
      's.total', 's.amount_received', 's.payment_method', db.raw('COALESCE(s.payment_received_at, s.updated_at, s.created_at) as completed_at'))
    .orderBy('completed_at', 'desc').limit(50);
  const [orders, tables] = await Promise.all([
    query,
    db('tables').where({ shop_id: shopId }).select('id', 'table_number').orderBy('table_number', 'asc')
  ]);
  return { orders, tables };
}

async function recordStandalone({ saleId, shopId, user, amount, paymentMethod }) {
  if (!Number.isInteger(saleId) || saleId <= 0) throw invalid('Valid order required.');
  const cents = toCents(amount);
  if (!cents) throw invalid('Tip must be greater than zero.');
  if (!['cash', 'card', 'online'].includes(paymentMethod)) throw invalid('Invalid tip payment method.');
  return db.transaction(async trx => {
    const sale = await trx('sales').where({ id: saleId, shop_id: shopId }).forUpdate().first();
    if (!sale) throw invalid('Order not found.', 404);
    const role = String(user?.role || '').toLowerCase();
    const canViewAll = ['admin', 'superadmin', 'manager', 'pos_user'].includes(role);
    if (!canViewAll && Number(sale.user_id) !== Number(user.id) && Number(sale.waiter_id) !== Number(user.id)) {
      throw invalid('You cannot record a tip for this order.', 403);
    }
    if (sale.order_status !== 'completed' || Number(sale.amount_received || 0) < Number(sale.total || 0) - 0.01) {
      throw invalid('Tips can only be recorded for completed, fully paid orders.');
    }
    const existing = await trx('sale_tips').where({ shop_id: shopId, sale_id: saleId }).first();
    if (existing) throw invalid('A tip has already been recorded for this order.', 409);
    const shift = await trx('shifts').where({ shop_id: shopId, user_id: user.id, status: 'open' }).forUpdate().first();
    if (!shift) throw invalid('You must open a register shift to collect a tip.');
    await trx('sale_tips').insert({ shop_id: shopId, sale_id: saleId, shift_id: shift.id, collected_by: user.id,
      amount_cents: cents, payment_method: paymentMethod, collection_mode: 'standalone' });
    await trx('sales').where({ id: saleId, shop_id: shopId }).update({ tip_amount: cents / 100 });
    return { sale_id: Number(saleId), amount: cents / 100, payment_method: paymentMethod, shift_id: shift.id };
  });
}

async function summary({ shopId, shiftId, bounds } = {}, connection = db) {
  const rows = await connection('sale_tips')
    .modify(q => {
      if (shopId) q.where('shop_id', shopId);
      if (shiftId) q.where('shift_id', shiftId);
      if (bounds) {
        // Analytics supplies shop-local dates. Normalize both database engines
        // to UTC so SQLite text timestamps and PostgreSQL timestamptz agree.
        const utc = value => new Date(value.replace(' ', 'T') + '+05:00').toISOString();
        const values = [utc(bounds.start), utc(bounds.end)];
        if (connection.client.config.client === 'pg') q.whereBetween('collected_at', values);
        else q.whereBetween(connection.raw('datetime(collected_at)'), values.map(v => v.replace('T', ' ').slice(0, 19)));
      }
    })
    .select('payment_method').sum('amount_cents as cents').groupBy('payment_method');
  const result = { total_tips: 0, cash_tips: 0, card_tips: 0, online_tips: 0 };
  let totalCents = 0;
  for (const row of rows) {
    result[row.payment_method + '_tips'] = Number(row.cents) / 100;
    totalCents += Number(row.cents);
  }
  result.total_tips = totalCents / 100;
  return result;
}
async function payments(shopId, shiftId, connection = db) {
  return connection('sale_tips as tip')
    .join('sales as s', function () { this.on('s.id', 'tip.sale_id').andOn('s.shop_id', 'tip.shop_id'); })
    .leftJoin('tables as t', 's.table_id', 't.id')
    .where({ 'tip.shop_id': shopId, 'tip.shift_id': shiftId })
    .select('tip.sale_id', 'tip.amount_cents', 'tip.payment_method as tip_payment_method',
      'tip.collection_mode', 'tip.collected_at as payment_time', 's.payment_method as bill_payment_method',
      's.order_number', 's.order_type', 's.order_status', 's.customer_name', 't.table_number');
}
// Analytics reads the immutable collection ledger once. The collector is the
// only persisted staff assignment; sale.tip_amount is a mirror, not another tip.
async function monthlyAnalytics(shopId, { month, year }, connection = db) {
  if (!Number.isSafeInteger(Number(shopId)) || Number(shopId) <= 0) throw invalid('Shop context required.');
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 9998) throw invalid('Choose a valid month and year.');
  const pg = connection.client.config.client === 'pg';
  const setting = pg ? await connection('attendance_settings').where({ shop_id: shopId }).first('timezone') : null;
  const timezone = setting?.timezone || 'Asia/Karachi';
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const query = connection('sale_tips as tip')
    .leftJoin('users as u', function () { this.on('u.id', 'tip.collected_by').andOn('u.shop_id', 'tip.shop_id'); })
    .leftJoin('staff_profiles as staff', function () { this.on('staff.user_id', 'tip.collected_by').andOn('staff.shop_id', 'tip.shop_id'); })
    .where('tip.shop_id', shopId);
  if (pg) query.whereRaw('tip.collected_at >= (?::timestamp AT TIME ZONE ?) AND tip.collected_at < (?::timestamp AT TIME ZONE ?)', [start, timezone, end, timezone]);
  else {
    // SQLite collection timestamps are UTC, including legacy space-delimited values.
    const utc = date => new Date(date + 'T00:00:00+05:00').toISOString().replace('T', ' ').slice(0, 19);
    query.where(connection.raw('datetime(tip.collected_at)'), '>=', utc(start))
      .where(connection.raw('datetime(tip.collected_at)'), '<', utc(end));
  }
  const waitersQuery = connection('users as u')
    .leftJoin('staff_profiles as staff', function () { this.on('staff.user_id', 'u.id').andOn('staff.shop_id', 'u.shop_id'); })
    .where('u.shop_id', shopId)
    .andWhere(function () {
      this.whereRaw('LOWER(u.role) IN (?, ?)', ['waiter', 'order_taker'])
        .orWhereExists(connection('user_roles as ur').join('roles as r', 'r.id', 'ur.role_id')
          .whereColumn('ur.user_id', 'u.id').whereRaw('LOWER(r.name) = ?', ['waiter'])
          .andWhere(function () { this.where('r.shop_id', shopId).orWhereNull('r.shop_id'); }));
    }).select('u.id', 'u.name', 'staff.full_name');
  const [records, waiters] = await Promise.all([query.select('tip.collected_by', 'u.name', 'staff.full_name')
    .count('tip.id as count').sum('tip.amount_cents as amount_cents')
    .groupBy('tip.collected_by', 'u.name', 'staff.full_name'), waitersQuery]);
  const byStaff = new Map(records.map(row => [Number(row.collected_by), {
    id: Number(row.collected_by), name: row.full_name || row.name || `Former staff #${row.collected_by}`,
    quantity: Number(row.count), amountCents: BigInt(row.amount_cents),
  }]));
  for (const waiter of waiters) {
    const id = Number(waiter.id);
    if (!byStaff.has(id)) byStaff.set(id, { id, name: waiter.full_name || waiter.name, quantity: 0, amountCents: 0n });
  }
  const rows = [...byStaff.values()].sort((a, b) => a.amountCents === b.amountCents ? a.name.localeCompare(b.name) || a.id - b.id : a.amountCents > b.amountCents ? -1 : 1);
  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0n);
  return {
    month, year, timezone,
    tips: rows.map(({ amountCents, ...row }) => ({ ...row, revenue: Number(amountCents) / 100 })),
    kpi: { totalTips: Number(totalCents) / 100, tipsReceived: rows.reduce((sum, row) => sum + row.quantity, 0), topRecipient: rows.find(row => row.amountCents > 0n)?.name || null },
  };
}

module.exports = { collect, recordStandalone, listEligibleOrders, summary, payments, validateTip, toCents, monthlyAnalytics };

// Read-only monthly read model. No inventory or sales history is changed.
const defaultDb = require('../../../../db/knex');
const SCALE = 1000000n;
const fixed = value => BigInt(Math.round(Number(value || 0) * 1e6));
const number = value => Number(value) / 1e6;
const cents = value => Number((value + (value < 0n ? -5000n : 5000n)) / 10000n) / 100;
const parseArray = value => {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

async function getMonthlyAnalytics(shopId, { month, year }, db = defaultDb) {
  if (!Number.isSafeInteger(Number(shopId)) || Number(shopId) <= 0) throw new Error('Shop context required');
  const pg = db.client.config.client === 'pg';
  const setting = pg ? await db('attendance_settings').where({ shop_id: shopId }).first('timezone') : null;
  const timezone = setting?.timezone || 'Asia/Karachi';
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const range = (query, column) => pg
    ? query.whereRaw('?? >= (?::timestamp AT TIME ZONE ?) AND ?? < (?::timestamp AT TIME ZONE ?)', [column, start, timezone, column, end, timezone])
    : query.where(column, '>=', start).where(column, '<', end);

  const [items, allocations, links, ingredients, batches, waste] = await Promise.all([
    range(db('sale_items as si').join('sales as s', 's.id', 'si.sale_id')
      .join('products as p', 'p.id', 'si.product_id')
      .where({ 's.shop_id': shopId, 'p.shop_id': shopId, 's.order_status': 'completed' }), 's.created_at')
      .select('si.*', 'p.name', 's.created_at as sold_at', 's.total', 's.tax_amount'),
    range(db('sale_inventory_consumptions as c').join('sales as s', 's.id', 'c.sale_id')
      .join('sale_items as si', function () { this.on('si.id', 'c.sale_item_id').andOn('si.sale_id', 's.id'); })
      .join('raw_stocks as rs', 'rs.id', 'c.raw_stock_id')
      .where({ 'c.shop_id': shopId, 's.shop_id': shopId, 'rs.shop_id': shopId, 's.order_status': 'completed' }), 's.created_at')
      .select('c.*', 'rs.name', 'rs.unit'),
    db('product_recipe_links as l').join('recipes as r', 'r.id', 'l.recipe_id')
      .join('products as p', 'p.id', 'l.product_id').join('recipe_ingredients as ri', 'ri.recipe_id', 'r.id')
      .where({ 'l.shop_id': shopId, 'r.shop_id': shopId, 'p.shop_id': shopId })
      .select('l.product_id', 'l.variant_name', 'ri.raw_stock_id', 'ri.quantity'),
    db('raw_stocks').where({ shop_id: shopId }).select('id', 'name', 'unit', 'conversion_factor'),
    db('raw_stock_batches').where({ shop_id: shopId }).orderBy('created_at', 'desc').orderBy('id', 'desc')
      .select('raw_stock_id', 'buying_price', 'created_at'),
    range(db('waste_event_items as wi').join('waste_events as we', 'we.id', 'wi.waste_event_id')
      .join('raw_stocks as rs', 'rs.id', 'wi.raw_stock_id')
      .where({ 'we.shop_id': shopId, 'rs.shop_id': shopId, 'we.status': 'recorded' }), 'we.created_at')
      .select(db.raw('COALESCE(SUM(CAST(wi.cost_amount AS NUMERIC)), 0) as cost')).first(),
  ]);
  const productMap = new Map();
  const subtotals = new Map();
  for (const item of items) subtotals.set(item.sale_id, (subtotals.get(item.sale_id) || 0n) + fixed(item.quantity) * fixed(item.price_at_sale) / SCALE);
  for (const item of items) {
    const row = productMap.get(item.product_id) || { id: item.product_id, name: item.name, quantity: 0n, revenue: 0n };
    row.quantity += fixed(item.quantity);
    const subtotal = subtotals.get(item.sale_id);
    // Match analytics revenue: completed bills after discounts, excluding tax.
    row.revenue += subtotal ? fixed(item.quantity) * fixed(item.price_at_sale) / SCALE * (fixed(item.total) - fixed(item.tax_amount)) / subtotal : 0n;
    productMap.set(item.product_id, row);
  }
  const usage = new Map();
  const add = (id, name, unit, quantity, cost, estimated = false, unknownCost = false) => {
    const row = usage.get(id) || { id, name, unit, quantity: 0n, cost: 0n, estimated: false, unknownCost: false };
    row.quantity += quantity; row.cost += cost; row.estimated ||= estimated; row.unknownCost ||= unknownCost;
    usage.set(id, row);
  };
  const recordedItems = new Set(allocations.map(a => Number(a.sale_item_id)));
  for (const a of allocations) add(a.raw_stock_id, a.name, a.unit, fixed(a.quantity), fixed(a.total_cost));
  const rawById = new Map(ingredients.map(r => [Number(r.id), r]));
  const linksByProduct = new Map();
  for (const l of links) { const list = linksByProduct.get(Number(l.product_id)) || []; list.push(l); linksByProduct.set(Number(l.product_id), list); }
  const batchesByRaw = new Map();
  for (const b of batches) { const list = batchesByRaw.get(Number(b.raw_stock_id)) || []; list.push(b); batchesByRaw.set(Number(b.raw_stock_id), list); }
  const unavailableItems = new Set();
  for (const item of items) {
    if (recordedItems.has(Number(item.id))) continue;
    const variants = parseArray(item.variants_json).map(v => v.name || v);
    const active = (linksByProduct.get(Number(item.product_id)) || []).filter(l => !l.variant_name || variants.includes(l.variant_name));
    if (!active.length) { unavailableItems.add(item.id); continue; }
    for (const l of active) {
      const raw = rawById.get(Number(l.raw_stock_id));
      if (!raw || !(Number(raw.conversion_factor) > 0) || !(Number(l.quantity) > 0)) { unavailableItems.add(item.id); continue; }
      const quantity = fixed(l.quantity) * fixed(item.quantity) / fixed(raw.conversion_factor);
      const batch = (batchesByRaw.get(Number(raw.id)) || []).find(b => new Date(b.created_at) <= new Date(item.sold_at));
      add(raw.id, raw.name, raw.unit, quantity, quantity * fixed(batch?.buying_price) / SCALE, true, !batch);
    }
  }
  const productRows = [...productMap.values()].sort((a, b) => Number(b.quantity - a.quantity) || a.name.localeCompare(b.name));
  const ingredientRows = [...usage.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Compare quantities only within a measurement dimension, in base units.
  const base = { kg: ['mass', 1000], g: ['mass', 1], mg: ['mass', .001], l: ['volume', 1000], liter: ['volume', 1000], litre: ['volume', 1000], ml: ['volume', 1], pcs: ['count', 1], piece: ['count', 1], pieces: ['count', 1] };
  const leaders = new Map();
  for (const row of ingredientRows) {
    const [dimension, factor] = base[String(row.unit).toLowerCase()] || [row.unit, 1];
    const score = number(row.quantity) * factor;
    if (!leaders.has(dimension) || leaders.get(dimension).score < score) leaders.set(dimension, { name: row.name, score });
  }
  return {
    month, year, timezone,
    products: productRows.map(r => ({ id: r.id, name: r.name, quantity: number(r.quantity), revenue: cents(r.revenue) })),
    ingredients: ingredientRows.map(r => ({ id: r.id, name: r.name, unit: r.unit, quantity: number(r.quantity), cost: r.unknownCost ? null : cents(r.cost), estimated: r.estimated })),
    kpi: {
      totalUnits: number(productRows.reduce((s, r) => s + r.quantity, 0n)),
      totalRevenue: cents(productRows.reduce((s, r) => s + r.revenue, 0n)),
      bestProduct: productRows[0]?.name || null,
      totalIngredients: ingredientRows.length,
      consumptionCost: ingredientRows.some(r => r.unknownCost) ? null : cents(ingredientRows.reduce((s, r) => s + r.cost, 0n)),
      mostConsumed: [...leaders].map(([unit, r]) => `${r.name} (${unit})`).join(', ') || null,
      wastageCost: cents(fixed(waste?.cost)),
    },
    unlinkedItems: unavailableItems.size,
  };
}

module.exports = { getMonthlyAnalytics };

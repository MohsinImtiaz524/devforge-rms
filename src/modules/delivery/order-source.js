const { z } = require('zod');

const orderSourceSchema = z.enum(['foodpanda']).nullable().optional();
function resolveOrderSource(type, source, previous = null) {
  if (previous === 'foodpanda' && type !== 'foodpanda') {
    throw Object.assign(new Error('A Foodpanda order must keep its Foodpanda order type.'), { status: 409 });
  }
  if (type === 'foodpanda') return 'foodpanda';
  if (source === 'foodpanda') throw Object.assign(new Error('Foodpanda orders must use the Foodpanda order type.'), {status:400});
  return null;
}
function normalizeFoodpandaType(data) {
  // Compatibility for older POS clients that submitted a delivery source marker.
  if (data.order_type === 'delivery' && data.order_source === 'foodpanda') data.order_type = 'foodpanda';
  return data;
}
async function migrateFoodpandaOrderType(db) {
  let changed = 0;
  while (true) {
    const rows = await db('sales').where({order_type:'delivery',order_source:'foodpanda'}).select('id').orderBy('id').limit(500);
    if (!rows.length) break;
    changed += await db('sales').whereIn('id',rows.map(row=>row.id)).where({order_type:'delivery',order_source:'foodpanda'}).update({order_type:'foodpanda'});
  }
  if (changed) console.info('[Foodpanda migration] Reclassified orders:', changed);
}
async function ensureOrderSourceSchema(db) {
  if (!await db.schema.hasColumn('sales', 'order_source')) {
    await db.schema.alterTable('sales', table => table.string('order_source', 32).nullable());
  }
}
module.exports = { orderSourceSchema, resolveOrderSource, normalizeFoodpandaType, migrateFoodpandaOrderType, ensureOrderSourceSchema };

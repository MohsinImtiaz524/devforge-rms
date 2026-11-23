const { z } = require('zod');
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['all','pending','preparing','ready','served','completed','cancelled']).default('all'),
});

async function foodpandaDashboard(db, shopId, query = {}) {
  const { page, search, status } = querySchema.parse(query);
  const base = () => db('sales').where({ shop_id: shopId, order_type: 'foodpanda' });
  const filtered = () => {
    const rows = base();
    if (status !== 'all') rows.andWhere('order_status', status);
    if (search) rows.andWhere(function () {
      this.whereRaw('CAST(order_number AS TEXT) LIKE ?', ['%' + search + '%'])
        .orWhere('customer_name', 'like', '%' + search + '%');
    });
    return rows;
  };
  const [summary, count, orders] = await Promise.all([
    base().select(db.raw(`COUNT(*) AS total_orders,
      COALESCE(SUM(CASE WHEN order_status = 'completed' THEN 1 ELSE 0 END),0) AS completed_orders,
      COALESCE(SUM(CASE WHEN order_status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END),0) AS active_orders,
      COALESCE(SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END),0) AS cancelled_orders,
      COALESCE(SUM(CASE WHEN order_status = 'completed' THEN total ELSE 0 END),0) AS completed_sales`)).first(),
    filtered().count({ count: '*' }).first(),
    filtered().select('id','order_number','order_type','order_source','order_status','customer_name','total','amount_received','created_at')
      .orderBy('created_at','desc').orderBy('id','desc').limit(20).offset((page - 1) * 20),
  ]);
  return { summary, orders, pagination: { page, page_size: 20, total: Number(count.count), total_pages: Math.max(1, Math.ceil(Number(count.count) / 20)) } };
}
module.exports = { foodpandaDashboard };

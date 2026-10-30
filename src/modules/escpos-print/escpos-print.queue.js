const db = require('../../../db/knex');
const service = require('./escpos-print.service');
async function claim(shopId, printers, stationName) {
  const station = String(stationName || '');
  if (!printers.includes(station)) throw Object.assign(new Error('Printer is not registered for this shop'), { status: 403 });
  const job = await db.transaction(async trx => {
    const postgres = trx.client.config.client === 'pg';
    const matches = (query, key, expected) => postgres
      ? query.whereRaw('content_json ~ ?', [`"${key}"[[:space:]]*:[[:space:]]*"${expected}"`])
      : query.whereRaw("json_extract(CASE WHEN json_valid(content_json) THEN content_json ELSE '{}' END, ?) = ?", [`$.${key}`, expected]);
    let query = trx('print_queue').where({ shop_id: shopId, station_name: station, status: 'pending' })
      .where(function () {
        this.where(function () { matches(this, 'type', 'CASH_DRAWER'); })
          .orWhere(function () {
            this.where(function () {
              for (const format of ['customer', 'unpaid', 'kitchen']) this.orWhere(function () { matches(this, 'format', format); });
            });
          });
      }).orderByRaw('CASE WHEN content_json LIKE ? THEN 0 ELSE 1 END', ['%"type":"CASH_DRAWER"%'])
      .orderBy('created_at').orderBy('id').first();
    if (trx.client.config.client === 'pg') query = query.forUpdate().skipLocked();
    const row = await query;
    if (!row) return null;
    const changed = await trx('print_queue').where({ id: row.id, shop_id: shopId, status: 'pending' })
      .update({ status: 'printing', claimed_at: trx.fn.now(), updated_at: trx.fn.now(), attempts: trx.raw('COALESCE(attempts, 0) + 1'), last_error: null });
    return changed ? row : null;
  });
  if (!job) return null;
  try {
    return { id: job.id, station_name: job.station_name, created_at: job.created_at, document: await service.documentFor(job, shopId) };
  } catch (error) {
    await db('print_queue').where({ id: job.id, shop_id: shopId, status: 'printing' })
      .update({ status: 'failed', last_error: error.message.slice(0, 1000), updated_at: db.fn.now() });
    error.jobFailed = true;
    throw error;
  }

}
module.exports = { claim };

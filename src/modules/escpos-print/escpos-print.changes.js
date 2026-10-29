const db = require('../../../db/knex');

async function notifyConfigurationChanged(shopId) {
  const payload = { kind: 'configuration', shop_id: shopId };
  if (db.client.config.client === 'pg') {
    // Reuse the existing listener so updates also reach agents on another RMS instance.
    await db.raw('SELECT pg_notify(?, ?)', ['rms_print_jobs', JSON.stringify(payload)]);
  } else require('../../../services/RealtimePrintService').jobNotifications.emit('configuration', payload);
}

function configurationChanges(notify = notifyConfigurationChanged) {
  return (req, res, next) => {
    const pathname = String(req.originalUrl || '').split('?')[0];
    const adminShop = /^\/api\/shops\/(\d+)(?:\/|$)/.exec(pathname);
    const relevant = /^\/api\/(shop-settings|printers|product-categories)(?:\/|$)/.test(pathname) || adminShop;
    if (!relevant || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const shopId = Number(adminShop ? adminShop[1] : req.session?.user?.shop_id);
    if (Number.isSafeInteger(shopId) && shopId > 0) res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Promise.resolve().then(() => notify(shopId)).catch(error => console.error('[ESC/POS] Configuration notification failed:', error.message));
      }
    });
    next();
  };
}

async function notifyPendingJobs(shopId) {
  const realtime = require('../../../services/RealtimePrintService');
  // A second after-commit signal independent of the database queue trigger.
  // Local agents wake even while LISTEN is reconnecting; pg_notify reaches other instances.
  const pending = await db('print_queue').where({ shop_id: shopId, status: 'pending' })
    .distinct('station_name');
  for (const row of pending) realtime.publish({ shop_id: shopId, station_name: row.station_name });
  if (db.client.config.client === 'pg' && pending.length) {
    await db.raw("SELECT pg_notify('rms_print_jobs', json_build_object('shop_id', ?::int, 'station_name', station_name)::text) FROM (SELECT DISTINCT station_name FROM print_queue WHERE shop_id = ? AND status = 'pending') pending", [shopId, shopId]);
  }
}

function queueChanges(notify = notifyPendingJobs) {
  return (req, res, next) => {
    const pathname = String(req.originalUrl || '').split('?')[0];
    const relevant = /^\/api\/(sales|shifts|tips|kds|delivery|print-jobs)(?:\/|$)/.test(pathname)
      || /^\/api\/(?:escpos-print|realtime-print-jobs)\/\d+\/retry$/.test(pathname);
    const shopId = Number(req.session?.user?.shop_id);
    if (relevant && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Number.isSafeInteger(shopId) && shopId > 0) {
      res.once('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) Promise.resolve().then(() => notify(shopId))
          .catch(error => console.error('[ESC/POS] Job wake-up failed:', error.message));
      });
    }
    next();
  };
}
module.exports = { configurationChanges, notifyConfigurationChanged, queueChanges, notifyPendingJobs };

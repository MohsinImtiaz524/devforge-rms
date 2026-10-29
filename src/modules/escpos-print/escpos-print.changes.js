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
module.exports = { configurationChanges, notifyConfigurationChanged };

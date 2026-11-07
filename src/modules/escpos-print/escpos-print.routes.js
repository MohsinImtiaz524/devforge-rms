const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../../../db/knex');
const { requirePermission } = require('../../../authorization/middleware');
const service = require('./escpos-print.service');
const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.get('/download', requirePermission('settings.manage_printers', 'settings.update'), asyncRoute(async (req, res) => {
  const shopId = Number(req.session.user.shop_id);
  if (!Number.isSafeInteger(shopId) || shopId <= 0) return res.status(403).json({ error: 'Select a shop first' });
  const shop = await db('shops').where({ id: shopId }).first('name');
  const printers = await db('printers').where({ shop_id: shopId }).pluck('system_name');
  if (!shop || !printers.length) return res.status(400).json({ error: 'Register at least one printer first' });
  const protocol = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const profile = { shopId, shopName: shop.name, serverUrl: `${protocol}://${req.get('host')}`, token: service.issueToken(shopId) };
  let source = await fs.readFile(path.join(__dirname, '../../../escpos-print-agent.js'), 'utf8');
  const encoder = await fs.readFile(path.join(__dirname, 'escpos-encoder.js'), 'utf8');
  const dashboard = await fs.readFile(path.join(__dirname, 'escpos-agent-ui.js'), 'utf8');
  source = source.replace('/* PROFILE */ {}', () => JSON.stringify(profile))
    .replace('/* ENCODER */ null', () => `(function(){ const module = { exports: {} };\n${encoder}\nreturn module.exports; })()`)
    .replace('/* DASHBOARD */ null', () => `(function(){ const module = { exports: {} };\n${dashboard}\nreturn module.exports; })()`);
  res.set('Cache-Control', 'private, no-store').type('application/javascript')
    .attachment('agent.js').send(source);
}));

router.use(asyncRoute(async (req, res, next) => {
  const identity = service.verifyToken(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!identity) return res.status(401).json({ error: 'Invalid or expired ESC/POS agent credential. Download a new agent.' });
  const shop = await db('shops').where({ id: identity.shopId }).first('id');
  if (!shop) return res.status(401).json({ error: 'Shop no longer exists' });
  req.agent = identity;
  req.printers = await db('printers').where({ shop_id: identity.shopId }).pluck('system_name');
  res.set('Cache-Control', 'private, no-store');
  next();
}));
router.get('/config', asyncRoute(async (req, res) => res.json(await service.configuration(req.agent.shopId))));
router.get('/status', asyncRoute(async (req, res) => {
  const scope = () => db('print_queue').where({ shop_id: req.agent.shopId }).whereIn('station_name', req.printers);
  const [totals, perPrinter, recent] = await Promise.all([
    scope().select('status').count({ count: '*' }).groupBy('status'),
    scope().select('station_name', 'status').count({ count: '*' }).groupBy('station_name', 'status'),
    scope().select('id', 'station_name', 'status', 'attempts', 'last_error', 'created_at', 'updated_at', 'printed_at', 'content_json')
      .orderBy('updated_at', 'desc').orderBy('id', 'desc').limit(30)
  ]);
  const jobs = recent.map(({ content_json, ...job }) => {
    let content = {};
    try { content = JSON.parse(content_json || '{}'); } catch (_) {}
    return { ...job, format: content.format || (content.type === 'CASH_DRAWER' ? 'drawer' : 'document'), sale_id: content.sale_id || null };
  });
  res.json({ checkedAt: new Date().toISOString(), counts: Object.fromEntries(totals.map(row => [row.status, Number(row.count)])),
    printers: perPrinter.map(row => ({ ...row, count: Number(row.count) })), jobs });
}));
router.get('/outstanding', asyncRoute(async (req, res) => {
  res.json(await db('print_queue').where({ shop_id: req.agent.shopId, status: 'printing' })
    .whereIn('station_name', req.printers).select('id', 'station_name').limit(100));
}));
router.post('/claim', asyncRoute(async (req, res) => {
  if (!req.printers.includes(String(req.body?.station_name || ''))) return res.status(403).json({ error: 'Printer is not registered for this shop' });
  try { res.json(await require('./escpos-print.queue').claim(req.agent.shopId, req.printers, req.body?.station_name)); }
  catch (error) {
    if (error.jobFailed) return res.status(422).json({ error: error.message, jobFailed: true });
    throw error;
  }
}));
router.post('/:id/:action', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !['confirm', 'fail', 'retry', 'cancel'].includes(req.params.action)) return res.status(400).json({ error: 'Invalid job action' });
  const query = () => db('print_queue').where({ id, shop_id: req.agent.shopId }).whereIn('station_name', req.printers);
  const job = await query().first('status');
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (req.params.action === 'cancel') {
    if (job.status === 'cancelled') return res.json({ ok: true });
    const changed = await query().whereIn('status', ['pending', 'retry_wait', 'printing', 'failed']).update({
      status: 'cancelled', updated_at: db.fn.now(), last_error: 'Removed from queue by operator.'
    });
    if (!changed) return res.status(409).json({ error: 'Only queued, failed or interrupted jobs can be removed' });
    return res.json({ ok: true });
  }
  if (req.params.action === 'retry') {
    const changed = await query().where({ status: 'failed' }).update({ status: 'pending', claimed_at: null, failed_at: null, last_error: null, attempts: 0, updated_at: db.fn.now() });
    if (!changed) return res.status(409).json({ error: 'Only a failed job can be retried' });
    return res.json({ ok: true });
  }
  if (req.params.action === 'confirm' && job.status === 'printed') return res.json({ ok: true });
  if (req.params.action === 'fail' && job.status === 'failed') return res.json({ ok: true });
  const updated = await query().where({ status: 'printing' }).update(req.params.action === 'confirm'
    ? { status: 'printed', printed_at: db.fn.now(), updated_at: db.fn.now(), last_error: null }
    : { status: 'failed', failed_at: db.fn.now(), updated_at: db.fn.now(), last_error: String(req.body?.reason || 'Agent failure').slice(0, 1000) });
  if (!updated) return res.status(409).json({ error: 'Job is no longer claimed' });
  res.json({ ok: true });
}));
module.exports = router;

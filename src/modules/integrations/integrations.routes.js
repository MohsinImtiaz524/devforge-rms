const express = require('express');
const { requireAuth } = require('../../../middleware/auth');
const { requirePermission } = require('../../../authorization/middleware');
const { sendError } = require('../../../utils/error-response');
const { foodpandaSettings } = require('./integrations.service');

function createIntegrationsRouter(db) {
  const router = express.Router();
  router.use(requireAuth, (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.session.user.shop_id) return res.status(403).json({ error: 'No shop assigned.' });
    next();
  });
  router.get('/foodpanda', async (req, res) => {
    try {
      const permissions = req.permissions || await require('../../../authorization/service').getUserPermissions(req.session.user);
      res.json({ ...await foodpandaSettings(db, req.session.user.shop_id), can_manage: permissions.includes('settings.update') });
    }
    catch (error) { sendError(res, error); }
  });
  router.get('/foodpanda/orders', requirePermission('reports.view', 'analytics.view'), async (req,res) => {
    try { res.json(await require('./foodpanda-dashboard').foodpandaDashboard(db, req.session.user.shop_id, req.query)); }
    catch(error) { sendError(res,error); }
  });
  router.put('/foodpanda', requirePermission('settings.update'), async (req, res) => {
    try {
      if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'Enabled must be true or false.' });
      await foodpandaSettings(db, req.session.user.shop_id);
      await db('shops').where({ id: req.session.user.shop_id }).update({ foodpanda_enabled: req.body.enabled, ...(req.body.enabled ? { foodpanda_activated:true } : {}) });
      res.json(await foodpandaSettings(db, req.session.user.shop_id));
    } catch (error) { sendError(res, error); }
  });
  return router;
}
module.exports = { createIntegrationsRouter };

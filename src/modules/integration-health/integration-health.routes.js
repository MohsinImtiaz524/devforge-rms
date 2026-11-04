const express = require('express');
const path = require('node:path');
const { requireSuperAdmin } = require('../../../middleware/auth');
function createHealthRouter({ service } = {}) {
  const router = express.Router();
  router.use(requireSuperAdmin);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store, private'); next(); });
  router.get('/view', (req, res) => res.sendFile(path.resolve(__dirname, '../../../public/integration-health.html')));
  router.get('/', async (req, res, next) => {
    try {
      service ||= require('./integration-health.service').createRuntimeHealthService();
      res.json(await service.snapshot());
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createHealthRouter };

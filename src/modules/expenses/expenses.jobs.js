const crypto = require('crypto');
const express = require('express');
const service = require('./expenses.service');

const router = express.Router();

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest();
}

function authorize(req, res, next) {
  const configured = process.env.EXPENSES_CRON_SECRET;
  if (!configured) return res.status(503).json({ error: 'Recurring expense scheduler is not configured.', code: 'EXPENSES_CRON_NOT_CONFIGURED' });
  const bearer = /^Bearer\s+(.+)$/i.exec(String(req.get('authorization') || ''))?.[1];
  const supplied = bearer || req.get('x-cron-secret') || '';
  if (!supplied || !crypto.timingSafeEqual(digest(supplied), digest(configured))) return res.status(401).json({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED' });
  return next();
}

router.post('/expenses-recurring', authorize, async (req, res, next) => {
  try {
    const summary = await service.processDueRecurring();
    res.set('Cache-Control', 'no-store').json({ ok: true, ...summary });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
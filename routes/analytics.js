const express = require('express');
const analyticsService = require('../services/AnalyticsService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const db = require('../db/knex');
const { requirePermission } = require('../authorization/middleware');
const { monthlyQuery } = require('../src/modules/moons/analytics/monthly.schema');
const { getMonthlyAnalytics } = require('../src/modules/moons/analytics/monthly.service');
const tipsService = require('../src/modules/tips/tips.service');

router.get('/monthly-tips', requireAuth, requirePermission('analytics.view'), async (req, res) => {
    const parsed = monthlyQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a valid month (1–12) and year (1900–9998).' });
    const shopId = Number(req.session.user.shop_id);
    if (!Number.isSafeInteger(shopId) || shopId <= 0) return res.status(400).json({ error: 'Select a business before viewing monthly analytics.' });
    res.set('Cache-Control', 'no-store');
    res.json(await tipsService.monthlyAnalytics(shopId, parsed.data));
});

router.get('/monthly', requireAuth, requirePermission('analytics.view'), async (req, res) => {
    const parsed = monthlyQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a valid month (1–12) and year (1900–9998).' });
    const shopId = Number(req.session.user.shop_id);
    if (!Number.isSafeInteger(shopId) || shopId <= 0) return res.status(400).json({ error: 'Select a business before viewing monthly analytics.' });
    res.set('Cache-Control', 'no-store');
    res.json(await getMonthlyAnalytics(shopId, parsed.data));
});

// GET /api/analytics/dashboard-data
router.get('/dashboard-data', requireAuth, requirePermission('analytics.view'), async (req, res) => {
    const user = req.session.user;
    const shopId = user.shop_id;
    const targetShopId = user.role === 'superadmin' ? (req.query.shop_id ? parseInt(req.query.shop_id, 10) : null) : shopId;
    
    if (!targetShopId && user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Shop ID required' });
    }

    const panel = req.query.panel;
    if (panel !== undefined && !['overview', 'sales', 'customers', 'inventory', 'profit', 'staff', 'channels'].includes(panel)) {
      return res.status(400).json({ error: 'Choose a valid analytics panel.' });
    }
    res.set('Cache-Control', 'no-store');
    const started = process.hrtime.bigint();
    const data = await analyticsService.getDashboardData(targetShopId, req.query.period, req.query.from, req.query.to, req.query.brand_id, panel);
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    res.set('Server-Timing', `analytics;dur=${durationMs.toFixed(1)}`);
    res.json(data);
});

// GET /api/analytics - Global Overview (Superadmin)
router.get('/', requireAuth, async (req, res) => {
    if (req.session.user.role === 'superadmin') {
        const stats = await analyticsService.getGlobalStats();
        return res.json({ isGlobal: true, ...stats });
    }

    // Legacy support for shop-specific analytics via the new service
    const data = await analyticsService.getDashboardData(req.session.user.shop_id, req.query.period, req.query.from, req.query.to, req.query.brand_id);
    res.json(data);
});

module.exports = router;

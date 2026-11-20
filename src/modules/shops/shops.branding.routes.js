const express = require('express');
const path = require('path');
const { requireAuth } = require('../../../middleware/auth');
function createBrandingRouter(db) {
  const router = express.Router();
  router.get('/', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const shopId = Number(req.session.user.shop_id);
    if (!Number.isSafeInteger(shopId) || shopId <= 0) return res.status(403).json({ error: 'No shop assigned' });
    try {
      const shop = await db('shops').select('logo_data', 'logo_path').where({ id: shopId }).first();
      if (!shop) return res.status(404).json({ error: 'Shop not found' });
      return res.json({ logo_url: shop.logo_data || (shop.logo_path ? `/uploads/receipt-assets/${path.basename(shop.logo_path)}` : null) });
    } catch (error) {
      console.error('Shop branding unavailable', error.message);
      return res.status(503).json({ error: 'Shop logo is temporarily unavailable.' });
    }
  });
  return router;
}
module.exports = { createBrandingRouter };

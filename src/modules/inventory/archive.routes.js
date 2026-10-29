const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../../../middleware/auth');
const { requirePermission } = require('../../../authorization/middleware');
const { createArchiveService } = require('./archive.service');
function createArchiveRouter(db) {
const router = express.Router();
const service = createArchiveService(db);
router.use(requireAuth);
router.get('/targets', requirePermission('inventory_archive.archive'), async (req,res) => {
  const { entity,search } = z.object({ entity:z.enum(['ingredient','product','variant']),search:z.string().trim().max(100).default('') }).parse(req.query);
  const shopId = Number(req.session.user.shop_id);
  if (!Number.isInteger(shopId) || shopId <= 0) return res.status(400).json({ error:'Select a restaurant first.' });
  let query;
  if (entity === 'ingredient') query = db('raw_stocks').where({ shop_id:shopId,is_deleted:0 }).select('id','name','unit','current_stock as available');
  else if (entity === 'product') query = db('products').where({ shop_id:shopId,is_deleted:0,product_type:'stock_based' }).select('id','name',db.raw("'units' as unit"),'stock as available');
  else query = db('product_stock_variants as v').join('products as p','p.id','v.product_id').where({ 'v.shop_id':shopId,'p.shop_id':shopId,'p.is_deleted':0,'v.is_active':true,'p.product_type':'stock_based' }).select('v.id',db.raw("p.name || ' / ' || v.name as name"),db.raw("'units' as unit"),'v.stock as available');
  const nameColumn = entity === 'variant' ? db.raw("p.name || ' / ' || v.name") : 'name';
  if (search) query.whereILike(nameColumn,`%${search.replace(/[\\%_]/g,'\\$&')}%`);
  res.json(await query.orderBy('name').limit(50));
});
router.get('/', requirePermission('inventory_archive.view'), async (req,res) => {
  const query = z.object({ page:z.coerce.number().int().min(1).max(100000).default(1),kind:z.enum(['item','quantity']).optional(),status:z.enum(['active','restored','all']).default('active') }).parse(req.query);
  res.json(await service.list(req.session.user,query));
});
router.post('/', requirePermission('inventory_archive.archive'), async (req,res) => res.status(201).json(await service.archive(req.session.user,req.body)));
router.post('/:id/restore', requirePermission('inventory_archive.restore'), async (req,res) => res.json(await service.restore(req.session.user,z.coerce.number().int().positive().parse(req.params.id),req.body)));
return router;
}
module.exports = { createArchiveRouter };

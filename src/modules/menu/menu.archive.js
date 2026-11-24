const { requirePermission } = require('../../../authorization/middleware');
function registerMenuArchive(router, db) {
 router.patch('/menu-archive/:id', requirePermission('products.update'), async (req, res, next) => {
  try {
   const id = Number(req.params.id), shopId = req.session.user.shop_id;
   if (!shopId || !Number.isSafeInteger(id) || id <= 0 || typeof req.body?.archived !== 'boolean') return res.status(400).json({ error: 'Select a restaurant and a valid product and archive state.' });
   const kind = req.body.kind || 'products';
   if (!['products', 'addons'].includes(kind)) return res.status(400).json({ error: 'Invalid archive type.' });
   if (kind === 'addons') {
    if (req.body.archived) return res.status(400).json({ error: 'Use the add-on archive action to archive add-ons.' });
    const addon = await db('menu_addons').where({ id, shop_id: shopId }).first('id', 'is_active');
    if (!addon) return res.status(404).json({ error: 'Add-on not found.' });
    if (!addon.is_active) await db('menu_addons').where({ id, shop_id: shopId, is_active: 0 }).update({ is_active: 1, updated_at: db.fn.now() });
    return res.json({ ok: true });
   }
   const product = await db('products').where({ id, shop_id: shopId, is_component: 0 }).first();
   if (!product) return res.status(404).json({ error: 'Product not found.' });
   const archived = req.body.archived;
   if (Boolean(product.is_deleted) === archived) return res.json({ ok: true });
   if (product.product_type === 'stock_based') {
    const service = require('../inventory/archive.service').createArchiveService(db);
    if (archived) await service.archive(req.session.user, { entity: 'product', entityId: id, kind: 'item', reason: 'Archived from Menu', requestId: req.body.requestId });
    else {
     const entry = await db('inventory_archives as a').where({ 'a.shop_id': shopId, 'a.entity': 'product', 'a.entity_id': id, 'a.kind': 'item' }).whereNotExists(function () {
      this.select('r.id').from('inventory_archive_restores as r').whereRaw('r.archive_id = a.id AND r.shop_id = a.shop_id');
     }).orderBy('a.id', 'desc').first('a.id');
     if (!entry) return res.status(409).json({ error: 'No matching inventory archive was found for this product.' });
     await service.restore(req.session.user, entry.id, { reason: 'Unarchived from Menu' });
    }
   } else await db.transaction(async trx => {
    const count = await trx('products').where({ id, shop_id: shopId, is_component: 0, is_deleted: archived ? 0 : 1 }).update({ is_deleted: archived ? 1 : 0 });
    if (count) await trx('shops').where({ id: shopId }).increment('product_count', archived ? -1 : 1);
   });
   res.json({ ok: true });
  } catch (error) { next(error); }
 });
 router.get('/menu-archive', requirePermission('products.view'), async (req,res,next) => {
  try {
   const kind=req.query.kind||'products';
   if(!['products','addons'].includes(kind))return res.status(400).json({error:'Invalid archive type.'});
   const page=Number(req.query.page||1);
   if(!Number.isInteger(page)||page<1||page>100000)return res.status(400).json({error:'Invalid page.'});
   const shopId=req.session.user.shop_id;
   if(!shopId)return res.status(400).json({error:'Select a restaurant first.'});
   const query=kind==='addons'?db('menu_addons').where({shop_id:shopId,is_active:0}):db('products').where({shop_id:shopId,is_deleted:1,is_component:0});
   const [{total}]=await query.clone().count('* as total');
   const fields=kind==='addons'?['id','name','price','updated_at']:['id','name','sku','category','selling_price','product_type'];
   const items=await query.select(fields).orderBy('name').limit(30).offset((page-1)*30);
   res.json({items,pagination:{page,total:Number(total),total_pages:Math.max(1,Math.ceil(Number(total)/30))}});
  } catch(e){next(e)}
 });
}
module.exports={registerMenuArchive};

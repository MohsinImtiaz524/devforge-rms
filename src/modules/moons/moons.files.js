const { fail } = require('../files/files.policies');
const { enabled, REGISTRY } = require('./moons.registry');
async function authorizeEdit(db,user,id) {
  if (!enabled()) fail(404,'Moons catalog is not enabled.','MOONS_DISABLED');
  if (user?.role !== 'superadmin') fail(403,'Only the Super Admin can edit Moon artwork.','FORBIDDEN');
  if (!await db('moon_catalog').where({id:Number(id)}).forUpdate().first()) fail(404,'Moon not found.','MOON_NOT_FOUND');
}
async function authorizeView(db,user,id) {
  if (!enabled()) fail(404,'Moon not found.','MOON_NOT_FOUND');
  const row = await db('moon_catalog').where({id:Number(id)}).first();
  if (!user?.id || !row || !REGISTRY[row.key]) fail(404,'Moon not found.','MOON_NOT_FOUND');
  if (user.role === 'superadmin') return;
  const shopId = Number(user.shop_id);
  if (row.status !== 'published' || !REGISTRY[row.key].implemented || !REGISTRY[row.key].launchReady || !Number.isSafeInteger(shopId) || shopId <= 0) fail(404,'Moon not found.','MOON_NOT_FOUND');
  const shop = await db('shops').where({id:shopId}).first();
  if (!shop || shop.status === 'blocked') fail(404,'Moon not found.','MOON_NOT_FOUND');
}
const resources = Object.fromEntries(['icon','cover','screenshot'].map(slot => ['moon.'+slot, {purpose:'moon.'+slot, authorizeEdit, authorizeView}]));
function authorizeUpload(user) {
  if (!enabled()) fail(409,'Enable the Moons catalog before uploading artwork.','MOONS_DISABLED');
  if (user?.role !== 'superadmin') fail(403,'Only the Super Admin can edit Moon artwork.','FORBIDDEN');
}
const purposeAuthorizers = Object.fromEntries(['icon','cover','screenshot'].map(slot => ['moon.'+slot,authorizeUpload]));
module.exports = { resources, purposeAuthorizers };

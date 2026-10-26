const {fail}=require('../files/files.policies');
function authorizeLogoUpload(user){
  if(!user?.id)fail(401,'Unauthorized','UNAUTHORIZED');
  if(!['admin','superadmin'].includes(user.role)||!Number.isSafeInteger(Number(user.shop_id))||Number(user.shop_id)<=0)fail(403,'Only shop administrators may change the shop logo.','FORBIDDEN');
}
async function authorizeView(trx,user,id){
  if(!user?.id||String(user.shop_id)!==String(id))fail(404,'Shop not found.','SHOP_NOT_FOUND');
  if(!await trx('shops').where({id:Number(user.shop_id)}).first())fail(404,'Shop not found.','SHOP_NOT_FOUND');
}
async function authorizeEdit(trx,user,id){
  authorizeLogoUpload(user);await authorizeView(trx,user,id);
  await trx('shops').where({id:Number(user.shop_id)}).forUpdate().first();
}
module.exports={authorizeLogoUpload,resources:{'shop.logo':{purpose:'company.logo',authorizeEdit,authorizeView}}};

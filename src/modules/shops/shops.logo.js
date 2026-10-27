const {authorizeLogoUpload}=require('./shops.files');
const {fail}=require('../files/files.policies');
const {z}=require('zod');
const schema=z.object({file_id:z.string().uuid().nullable()}).strict();
function createLogoService({db,files}){
  async function get(user){
    authorizeLogoUpload(user);
    const shop=await db('shops').where({id:Number(user.shop_id)}).first();
    if(!shop)fail(404,'Shop not found.','SHOP_NOT_FOUND');
    const attached=await files.listAttachments(user,{type:'shop.logo',id:user.shop_id});
    return {file:attached[0]||null,legacy_url:attached.length?null:(shop.logo_data||(shop.logo_path?`/uploads/receipt-assets/${require('path').basename(shop.logo_path)}`:null))};
  }
  async function save(user,raw){
    authorizeLogoUpload(user);const {file_id:id}=schema.parse(raw);
    const meta=id?await files.metadata(user,id):null;
    if(id&&meta.purpose!=='company.logo')fail(422,'Select a shop logo.','INVALID_RESOURCE');
    // Printers cannot use session-protected image URLs. Keep a verified print
    // snapshot in the existing receipt field, atomically with the attachment.
    const image=id?await files.content(user,id):null;
    await db.transaction(async trx=>{
      await files.syncAttachments(trx,user,{type:'shop.logo',id:user.shop_id,purpose:'company.logo'},id?[id]:[]);
      await trx('shops').where({id:Number(user.shop_id)}).update({logo_data:image?`data:${image.mime};base64,${image.bytes.toString('base64')}`:null,logo_path:null});
      await require('../../../services/ReceiptImageService').refreshShopImages(trx,user.shop_id);
    });return {file:meta,legacy_url:null};
  }
  return {get,save};
}
module.exports={createLogoService};

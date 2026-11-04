const crypto = require('node:crypto');
const schema = require('./website.schema');
const { configuredDomain, websiteOrigin, websiteLabel, localWebsitePath } = require('./website.hosts');
const { fail, imageDefaults, stillTypes } = require('../../files/files.policies');
const { verify } = require('../../files/files.verification');
const {ownedAssetIds,sharedPhotos,PREFIX}=require('./premium.assets');
const MAX_BYTES = 5 * 1024 * 1024;
function createWebsiteService({ db, resolvePermissions = require('../../../../authorization/service').getUserPermissions, storageFactory = require('../../files/files.storage').createStorage, domain = () => configuredDomain(), menuProvider = (shopId) => require('../../../../services/ProductService').getAllProducts(shopId,{menuOnly:true,excludeComponents:true,excludeDamageStock:true,excludeBatches:true,includeBrandName:false,paginate:true,pageSize:100}), beforeActivate = async () => {} }) {
  async function authorize(sessionUser, permission) {
    if (!sessionUser?.id) fail(401,'Unauthorized.','UNAUTHORIZED');
    const actor = await db('users as u').join('shops as s','s.id','u.shop_id').where({'u.id':sessionUser.id,'u.shop_id':sessionUser.shop_id}).select('u.id','u.shop_id','u.role','u.status','u.must_change_password','s.status as shop_status').first();
    if (!actor || actor.status === 'blocked' || actor.shop_status === 'blocked' || actor.must_change_password) fail(403,'Your shop account is unavailable.','FORBIDDEN');
    const permissions = await resolvePermissions(actor);
    if (!permissions.includes(permission)) fail(403,'You do not have permission to manage this website.','FORBIDDEN');
    return { ...actor, permissions };
  }
  const rowFor = (trx,actor) => trx('moon_websites').where({shop_id:actor.shop_id});
  function project(row) {
    return row ? { id:row.id, subdomain:row.subdomain, revision:row.revision, configuration:schema.configuration.parse(JSON.parse(row.draft_json)), status:row.is_published?'published':'draft', publishedRevision:row.published_revision, lastPublishedAt:row.last_published_at, url:domain() ? websiteOrigin(row.subdomain,domain()) : localWebsitePath(row.subdomain) } : null;
  }
  async function assetsValid(trx,shopId,c) {
    const ids = ownedAssetIds(c);
    if (!ids.length) return;
    const rows = await trx('moon_website_assets').where({shop_id:shopId}).whereIn('id',ids);
    if (rows.length !== ids.length) fail(422,'Select images uploaded by your shop.','INVALID_ASSET');
  }
  async function audit(trx,actor,row,action) {
    await trx('moon_website_events').insert({shop_id:actor.shop_id,website_id:row.id,actor_id:actor.id,action,revision:row.revision});
  }
  async function get(user) {
    const actor = await authorize(user,'website.view');
    return { website:project(await rowFor(db,actor).first()), templates:schema.TEMPLATES, defaults:schema.defaults(), permissions:actor.permissions.filter(p=>p.startsWith('website.')), domain:domain(), localPaths:domain()===null,menuPhotoOptions:Object.entries(sharedPhotos).map(([id,file])=>({id,label:file.replace('.webp',''),url:PREFIX+file})) };
  }
  async function save(user,raw) {
    const actor = await authorize(user,'website.edit'), data = schema.save.parse(raw);
    return db.transaction(async trx => {
      await assetsValid(trx,actor.shop_id,data.configuration);
      const row = await rowFor(trx,actor).forUpdate().first();
      if (!row) {
        if (data.revision !== 0) fail(409,'Reload the website before saving.','REVISION_CONFLICT');
        await trx('moon_websites').insert({shop_id:actor.shop_id,subdomain:data.subdomain,draft_json:JSON.stringify(data.configuration),revision:1});
      } else {
        // Stable hostname prevents a draft edit from moving an active public website.
        if (row.subdomain !== data.subdomain) fail(422,'The website address cannot be changed after the first save.','ADDRESS_LOCKED');
        const count = await rowFor(trx,actor).where({revision:data.revision}).update({draft_json:JSON.stringify(data.configuration),revision:data.revision+1,updated_at:new Date()});
        if (!count) fail(409,'This draft changed. Reload before saving.','REVISION_CONFLICT');
      }
      const result = await rowFor(trx,actor).first();
      await audit(trx,actor,result,'save');
      return project(result);
    });
  }
  async function publish(user,raw) {
    const actor = await authorize(user,'website.publish'), { revision } = schema.transition.parse(raw);
    return db.transaction(async trx => {
      const row = await rowFor(trx,actor).forUpdate().first();
      if (!row) fail(404,'Save a draft before publishing.','NOT_FOUND');
      if (row.revision !== revision) fail(409,'This draft changed. Reload before publishing.','REVISION_CONFLICT');
      const c = schema.configuration.parse(JSON.parse(row.draft_json));
      await assetsValid(trx,actor.shop_id,c);
      domain(); // Fail before any activation when hosting is not configured.
      if (row.is_published && row.published_revision === revision) return project(row);
      const version = await trx('moon_website_versions').where({shop_id:actor.shop_id,website_id:row.id,revision}).first();
      if (!version) await trx('moon_website_versions').insert({shop_id:actor.shop_id,website_id:row.id,revision,configuration_json:JSON.stringify(c),actor_id:actor.id});
      await beforeActivate();
      const count = await rowFor(trx,actor).where({revision}).update({is_published:true,published_revision:revision,last_published_at:new Date(),updated_at:new Date()});
      if (!count) fail(409,'The website changed. Try again.','REVISION_CONFLICT');
      await audit(trx,actor,row,'publish');
      return project(await rowFor(trx,actor).first());
    });
  }
  async function unpublish(user,raw) {
    const actor = await authorize(user,'website.publish'), {revision} = schema.transition.parse(raw);
    return db.transaction(async trx => {
      const row = await rowFor(trx,actor).forUpdate().first();
      if (!row) fail(404,'Website not found.','NOT_FOUND');
      if (row.revision !== revision) fail(409,'The website changed. Reload before unpublishing.','REVISION_CONFLICT');
      if (row.is_published) {
        await rowFor(trx,actor).where({revision}).update({is_published:false,updated_at:new Date()});
        await audit(trx,actor,row,'unpublish');
      }
      return project(await rowFor(trx,actor).first());
    });
  }
  async function renderPreview(user,raw) { const actor=await authorize(user,'website.view');const c=schema.configuration.parse(raw);await assetsValid(db,actor.shop_id,c);return c; }
  async function preview(user) {
    const actor = await authorize(user,'website.view'), row = await rowFor(db,actor).first();
    if (!row) fail(404,'Save a draft to preview your website.','NOT_FOUND');
    return schema.configuration.parse(JSON.parse(row.draft_json));
  }
  async function publicWebsite(host) {
    const label = websiteLabel(host,domain());
    return publicWebsiteByLabel(label);
  }
  async function publicWebsiteByLabel(label) {
    if (!schema.subdomain.safeParse(label).success) fail(404,'Website not found.','NOT_FOUND');
    const row = await db('moon_websites as w').join('shops as s','s.id','w.shop_id').where({'w.subdomain':label,'w.is_published':true}).whereNot('s.status','blocked').select('w.id','w.shop_id','w.published_revision').first();
    if (!row) fail(404,'Website not found.','NOT_FOUND');
    const version = await db('moon_website_versions').where({shop_id:row.shop_id,website_id:row.id,revision:row.published_revision}).first();
    if (!version) fail(404,'Website not found.','NOT_FOUND');
    // No draft, user, credential, or internal database projection escapes here.
    return { shopId:row.shop_id, configuration:schema.configuration.parse(JSON.parse(version.configuration_json)) };
  }
  async function importMenu(user) {
    const actor=await authorize(user,'website.edit');
    const result=await menuProvider(actor.shop_id), products=Array.isArray(result)?result:result.items;
    const items=[];
    for(const p of products || []) {
      const variants=p.product_type==='stock_based' ? (p.stock_variants || []).filter(v=>v.is_on_menu===true || v.is_on_menu===1).map(v=>({name:v.name,price:v.selling_price})) : (p.variants?.length?p.variants:[{name:'',price:p.selling_price}]);
      for(const variant of variants) {
        const price=Number(variant.price);if(!Number.isFinite(price)||price<0||price>=100000000)continue;
        items.push({name:(String(p.name)+(variant.name?' — '+String(variant.name):'')).slice(0,160),category:String(p.category||'').slice(0,80),description:String(p.description||'').slice(0,500),price:price.toFixed(2)});
      }
    }
    const shop=await db('shops').where({id:actor.shop_id}).first('currency');
    const parsed=schema.configuration.parse({...schema.defaults(),menuItems:items.slice(0,100),menuCurrency:shop?.currency||'PKR'});
    return {menuItems:parsed.menuItems,menuCurrency:parsed.menuCurrency,hasMore:items.length>100 || Number(result.total||0)>products.length};
  }
  async function upload(user,file) {
    const actor = await authorize(user,'website.edit');
    if (!file?.buffer || file.buffer.length > MAX_BYTES || !stillTypes.includes(file.mimetype)) fail(415,'Use a JPEG, PNG or WebP image up to 5 MB.','INVALID_IMAGE');
    const image = await verify(file.buffer,file.mimetype,MAX_BYTES,{...imageDefaults,types:stillTypes,maxBytes:MAX_BYTES,maxFrames:1});
    const id = crypto.randomUUID(), key = `websites/${actor.shop_id}/${id}`, storage = storageFactory();
    let stored = false;
    try {
      // Bound upload retention per shop. No published asset is garbage-collected in V1.
      await db.transaction(async trx => {
        await trx('shops').where({id:actor.shop_id}).forUpdate().first();
        const count = await trx('moon_website_assets').where({shop_id:actor.shop_id}).count('* as count').first();
        if (Number(count.count) >= 100) fail(429,'Your website image limit has been reached.','ASSET_QUOTA');
        await storage.put(key,image.bytes,image.mime); stored = true;
        await trx('moon_website_assets').insert({id,shop_id:actor.shop_id,storage_key:key,mime:image.mime,size:image.bytes.length,checksum:crypto.createHash('sha256').update(image.bytes).digest('hex'),width:image.width,height:image.height,actor_id:actor.id});
      });
      return {id,url:`/api/moons/website/assets/${id}`};
    } catch (error) {
      if (stored) try { await storage.remove(key); } catch { console.error('[Website Moon] orphaned upload requires storage reconciliation',{assetId:id}); }
      throw error;
    } finally { storage.close(); }
  }
  async function readAsset(shopId,id) {
    if (!require('zod').z.string().uuid().safeParse(id).success) fail(404,'Image not found.','NOT_FOUND');
    const row = await db('moon_website_assets').where({shop_id:shopId,id}).first();
    if (!row) fail(404,'Image not found.','NOT_FOUND');
    const storage = storageFactory();
    try {
      const bytes = await storage.read(row.storage_key,MAX_BYTES);
      if (bytes.length !== row.size || crypto.createHash('sha256').update(bytes).digest('hex') !== row.checksum) fail(503,'Image unavailable.','INTEGRITY_FAILURE');
      return {bytes,mime:row.mime};
    } finally { storage.close(); }
  }
  async function privateAsset(user,id) { const actor=await authorize(user,'website.view'); return readAsset(actor.shop_id,id); }
  async function publicAsset(host,id) {
    const website = await publicWebsite(host);
    if (!ownedAssetIds(website.configuration).includes(id)) fail(404,'Image not found.','NOT_FOUND');
    return readAsset(website.shopId,id);
  }
  async function publicAssetByLabel(label,id) { const website=await publicWebsiteByLabel(label); if(![website.configuration.logo,website.configuration.heroImage].includes(id))fail(404,'Image not found.','NOT_FOUND');return readAsset(website.shopId,id); }
  return {renderPreview,importMenu,publicWebsiteByLabel,publicAssetByLabel,get,save,publish,unpublish,preview,upload,privateAsset,publicWebsite,publicAsset};
}
module.exports = {createWebsiteService,MAX_BYTES};

const schemas = require('./moons.schema');
const { REGISTRY } = require('./moons.registry');
const { fail } = require('../files/files.policies');
function createMoonsService({db, files = () => require('../files/files.runtime'), now = Date.now}) {
  // One bounded cache of global published offers only. Never contains users, shops or can_open.
  let publishedCache=null;
  function admin(user) { if (!user?.id || user.role !== 'superadmin') fail(403,'Only the Super Admin can manage the Moons catalog.','SUPERADMIN_REQUIRED'); }
  function registered(key) { schemas.key.parse(key); if (!Object.hasOwn(REGISTRY,key)) fail(404,'Moon not found.','MOON_NOT_FOUND'); return REGISTRY[key]; }
  const record = (row) => ({...row, implemented: REGISTRY[row.key].implemented, launch_ready: REGISTRY[row.key].launchReady, route: REGISTRY[row.key].route, features: REGISTRY[row.key].features, permission_modules: REGISTRY[row.key].permissionModules});
  async function decorate(rows, trx=db, slots=['icon','cover','screenshot']) {
    if (!rows.length) return [];
    const ids=rows.map(r=>r.id);
    const runtime=files();
    const [prices,artwork]=await Promise.all([
      trx('moon_prices').whereIn('id',trx('moon_prices').whereIn('moon_id',ids).groupBy('moon_id').max('id')),
      runtime.enabled() ? Promise.all(slots.map(slot=>runtime.service.readResourceFiles('moon.'+slot,ids,'platform',trx).then(items=>items.map(file=>({...file,slot}))))).then(groups=>groups.flat()) : [],
    ]);
    return rows.map(row=>({...record(row),price:prices.find(price=>price.moon_id===row.id)||null,artwork:artwork.filter(f=>f.resourceId===String(row.id))}));
  }
  async function list(user) {
    admin(user);
    return decorate(await db('moon_catalog').whereIn('key',Object.keys(REGISTRY)).orderBy('sort_order').orderBy('id'));
  }
  async function history(user,key) {
    admin(user); registered(key);
    const row=await db('moon_catalog').where({key}).first(); if(!row)fail(404,'Moon not found.','MOON_NOT_FOUND');
    const [events,prices]=await Promise.all([db('moon_catalog_events').where({moon_id:row.id}).orderBy('version','desc').limit(100), db('moon_prices').where({moon_id:row.id}).orderBy('id','desc').limit(100)]);
    return {events,prices};
  }
  async function change(user,key,data,action,mutate) {
    admin(user); registered(key);
    const result=await db.transaction(async trx=>{
      const row=await trx('moon_catalog').where({key}).forUpdate().first();
      if(!row)fail(404,'Moon not found.','MOON_NOT_FOUND');
      if(row.version!==data.version)fail(409,'This Moon changed. Reload it before saving.','MOON_VERSION_CONFLICT');
      const changes=await mutate(trx,row);
      const count=await trx('moon_catalog').where({id:row.id,version:data.version}).update({...changes,version:row.version+1,updated_at:trx.fn.now()});
      if(count!==1)fail(409,'This Moon changed. Reload it before saving.','MOON_VERSION_CONFLICT');
      await trx('moon_catalog_events').insert({moon_id:row.id,actor_id:user.id,action,version:row.version+1,details_json:JSON.stringify(data)});
      return (await decorate([await trx('moon_catalog').where({id:row.id}).first()],trx))[0];
    });
    publishedCache=null; // Invalidate only after the catalog mutation commits.
    return result;
  }
  async function update(user,key,raw) {
    admin(user); const data=schemas.metadata.parse(raw);
    return change(user,key,data,'metadata',async(trx,row)=>{
      const {version,icon_ids,cover_ids,screenshot_ids,...metadata}=data;
      const slots={icon:icon_ids,cover:cover_ids,screenshot:screenshot_ids};
      if(Object.values(slots).some(ids=>ids!==undefined)){
        const runtime=files();if(!runtime.enabled())fail(409,'Enable the shared file service before editing artwork.','FILES_DISABLED');
        for(const [slot,ids] of Object.entries(slots))if(ids!==undefined)await runtime.service.syncAttachments(trx,user,{type:'moon.'+slot,purpose:'moon.'+slot,id:row.id},ids);
      }
      return metadata;
    });
  }
  async function price(user,key,raw) {
    admin(user); const data=schemas.price.parse(raw);
    return change(user,key,data,'price',async(trx,row)=>{
      // Offered prices only: no subscriptions, invoices or charges are created here.
      await trx('moon_prices').insert({moon_id:row.id,currency:data.currency,monthly_amount_minor:data.monthly_amount_minor,catalog_version:row.version+1,created_by:user.id});
      return {};
    });
  }
  async function status(user,key,raw) {
    admin(user); const data=schemas.status.parse(raw);
    return change(user,key,data,'status',async(trx,row)=>{
      if(data.status==='published'){
        if(!REGISTRY[key].implemented)fail(409,'This Moon has not been implemented yet.','MOON_NOT_IMPLEMENTED');
        if(!REGISTRY[key].launchReady)fail(409,'This Moon is still being prepared. Analytics is the first Moon available for launch.','MOON_NOT_LAUNCH_READY');
        if(!row.description.trim())fail(409,'Add Moon details before publishing.','MOON_DETAILS_REQUIRED');
        if(!await trx('moon_prices').where({moon_id:row.id}).first())fail(409,'Set a free or monthly price before publishing.','MOON_PRICE_REQUIRED');
      }
      return {status:data.status};
    });
  }
  async function published() {
    const keys=Object.values(REGISTRY).filter(moon=>moon.launchReady).map(moon=>moon.key);
    // Read current rows on every request: status/version changes invalidate across server instances.
    const rows=await db('moon_catalog').where({status:'published'}).whereIn('key',keys).orderBy('sort_order').orderBy('id');
    const key=JSON.stringify([files().enabled(),rows]);
    if(publishedCache?.key===key && publishedCache.expiresAt>now())return structuredClone(await publishedCache.promise);
    const entry={key,expiresAt:now()+15000,promise:null};
    entry.promise=decorate(rows,db,['icon','cover']);
    publishedCache=entry;
    try{return structuredClone(await entry.promise);}
    catch(error){if(publishedCache===entry)publishedCache=null;throw error;}
  }
  return {list,update,price,status,history,published};
}
module.exports = { createMoonsService };

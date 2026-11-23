const {z}=require('zod');
const {getUserPermissions}=require('../../../authorization/service');
const {REGISTRY}=require('./moons.registry');
const {fail}=require('../files/files.policies');
const requestSchema=z.object({catalog_version:z.number().int().nonnegative(),price_id:z.number().int().positive()}).strict();
function createMoonSubscriptions({db,resolvePermissions=getUserPermissions}) {
 async function subscribe(sessionUser,key,raw) {
  if(!sessionUser?.id)fail(401,'Unauthorized.','UNAUTHORIZED');
  const data=requestSchema.parse(raw);
  if(!Object.hasOwn(REGISTRY,key)||!REGISTRY[key].launchReady)fail(409,'This Moon is not available yet.','MOON_UNAVAILABLE');
  const actor=await db('users as u').join('shops as s','s.id','u.shop_id').where({'u.id':sessionUser.id,'u.shop_id':sessionUser.shop_id}).select('u.id','u.shop_id','u.role','u.status','u.must_change_password','s.status as shop_status').first();
  if(!actor||actor.status==='blocked'||actor.shop_status==='blocked'||actor.must_change_password)fail(403,'Your shop account is unavailable.','SHOP_UNAVAILABLE');
  if(!(await resolvePermissions(actor)).includes('settings.update'))fail(403,'Ask your shop administrator to subscribe.','SUBSCRIPTION_FORBIDDEN');
  return db.transaction(async trx=>{
   const shop=await trx('shops').where({id:actor.shop_id}).forUpdate().first();
   if(!shop||shop.status==='blocked')fail(403,'Your shop account is unavailable.','SHOP_UNAVAILABLE');
   const moon=await trx('moon_catalog').where({key}).forUpdate().first();
   if(!moon||moon.status!=='published')fail(409,'This Moon is not available yet.','MOON_UNAVAILABLE');
   const existing=await trx('shop_moon_subscriptions').where({shop_id:actor.shop_id,moon_id:moon.id}).first();
   if(existing?.state==='active')return {subscription:{state:'active'},already_subscribed:true};
   const price=await trx('moon_prices').where({moon_id:moon.id}).orderBy('id','desc').first();
   if(!price||Number(price.id)!==data.price_id||Number(moon.version)!==data.catalog_version)fail(409,'This Moon changed. Reload the Store before subscribing.','MOON_OFFER_CHANGED');
   const start=new Date(),end=new Date(start);const day=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(Math.min(day,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));
   // Activation only: no invoices, payments, renewals or permission changes.
   // The existing schema requires a finite period for active records.
   const changes={state:'active',current_price_id:price.id,current_period_start:start.toISOString(),current_period_end:end.toISOString(),cancel_at_period_end:false,updated_at:trx.fn.now()};
   let subscriptionId=existing?.id;
   if(existing)await trx('shop_moon_subscriptions').where({id:existing.id,shop_id:actor.shop_id}).update({...changes,version:Number(existing.version)+1});
   else {const [row]=await trx('shop_moon_subscriptions').insert({shop_id:actor.shop_id,moon_id:moon.id,...changes}).returning('id');subscriptionId=typeof row==='object'?row.id:row;}
   await trx('moon_subscription_events').insert({shop_id:actor.shop_id,subscription_id:subscriptionId,actor_id:actor.id,action:'subscribed',details_json:JSON.stringify({activation_only:true,billing:false,price_id:price.id,catalog_version:moon.version})});
   return {subscription:{state:'active'},already_subscribed:false};
  });
 }
 return {subscribe};
}
module.exports={createMoonSubscriptions};

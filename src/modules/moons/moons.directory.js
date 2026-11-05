const express=require('express');
const {requireAuth}=require('../../../middleware/auth');
const {getUserPermissions}=require('../../../authorization/service');
const {enabled,REGISTRY,canAccessDirectory}=require('./moons.registry');
const {fail}=require('../files/files.policies');
function createDirectoryService({db,catalog,resolvePermissions=getUserPermissions}) {
  async function list(user,permissions) {
    if(!user?.id)fail(401,'Unauthorized','UNAUTHORIZED');
    if(!canAccessDirectory(user,permissions))fail(403,'You do not have permission to access Moons.','MOON_ACCESS_REQUIRED');
    if(user.role!=='superadmin') {
      const membership=await db('users as u').join('shops as s','s.id','u.shop_id').where({'u.id':user.id,'u.shop_id':user.shop_id}).select('s.status as shop_status','u.status as user_status').first();
      if(!membership || membership.shop_status==='blocked'||membership.user_status==='blocked')fail(403,'Your shop account is unavailable.','SHOP_UNAVAILABLE');
    }
    return offers(user,permissions);
  }
  async function offers(user,permissions) {
    // Catalog offers are global; no subscription or business data is exposed here.
    const rows=await catalog.published();
    return rows.filter(row=>REGISTRY[row.key]?.launchReady).map(row=>({...row,can_open:user.role==='superadmin'||permissions.includes(REGISTRY[row.key].entryPermission)}));
  }
  async function bootstrap(sessionUser) {
    if(!sessionUser?.id)fail(401,'Unauthorized','UNAUTHORIZED');
    const actor=await db('users as u').leftJoin('shops as s','s.id','u.shop_id').where({'u.id':sessionUser.id})
      .select('u.id','u.shop_id','u.role','u.name','u.username','u.status','u.must_change_password','s.id as active_shop_id','s.name as shop_name','s.status as shop_status').first();
    if(!actor)fail(401,'Your account is no longer available.','UNAUTHORIZED');
    if(actor.status==='blocked' || (actor.role!=='superadmin' && (!actor.shop_id || actor.shop_id!==sessionUser.shop_id || !actor.active_shop_id || actor.shop_status==='blocked')))fail(403,'Your shop account is unavailable.','SHOP_UNAVAILABLE');
    if(actor.must_change_password)fail(403,'You must change your temporary password before continuing.','PASSWORD_CHANGE_REQUIRED');
    const permissions=await resolvePermissions(actor);
    if(!canAccessDirectory(actor,permissions))fail(403,'You do not have permission to access Moons.','MOON_ACCESS_REQUIRED');
    const items=await offers(actor,permissions);
    return {items,user:{id:actor.id,shop_id:actor.shop_id,name:actor.name,username:actor.username,role:actor.role,shop_name:actor.shop_name}};
  }
  return {list,bootstrap};
}
function createDirectoryRouter({service,isEnabled=enabled}) {
  const router=express.Router();
  router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.use(requireAuth);
  router.get('/',async(req,res)=>{
    if(!isEnabled())return res.status(503).json({error:'The Moons directory is not enabled yet.',code:'MOONS_DISABLED'});
    try {
      const started=performance.now();
      const result=service.bootstrap ? await service.bootstrap(req.session.user) : {items:await service.list(req.session.user,Array.isArray(req.permissions)?req.permissions:await getUserPermissions(req.session.user))};
      res.set('Server-Timing','moons;dur='+Math.round(performance.now()-started));
      res.json({...result,subscriptions_enabled:false});
    }catch(error){
      if(error.status)return res.status(error.status).json({error:error.message,code:error.publicCode});
      console.error('[Moons directory]',{code:error.code||'UNEXPECTED'});
      res.status(503).json({error:'The Moons directory is temporarily unavailable. Please try again.',code:'MOONS_UNAVAILABLE'});
    }
  });
  return router;
}
module.exports={createDirectoryService,createDirectoryRouter};

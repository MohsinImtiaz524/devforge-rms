const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireAuth, requireSuperAdmin } = require('../../../middleware/auth');
const { requirePermission } = require('../../../authorization/middleware');
const { sendError } = require('../../../utils/error-response');
const { enabled } = require('./moons.registry');
function createMoonsRouter({service, isEnabled=enabled, filesEnabled=()=>process.env.FILES_ENABLED==='true'}) {
  const router=express.Router();
  router.use(requireAuth,requireSuperAdmin);
  router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');if(!isEnabled())return res.status(503).json({error:'The Moons catalog is not enabled. Configure MOONS_ENABLED=true and restart after migration review.',code:'MOONS_DISABLED'});next();});
  router.use(rateLimit({windowMs:60000,limit:120,keyGenerator:req=>String(req.session.user.id),standardHeaders:'draft-7',legacyHeaders:false}));
  const run=handler=>async(req,res)=>{try{await handler(req,res);}catch(error){
    if(!error.status&&!error.issues&&!['23505','SQLITE_CONSTRAINT_UNIQUE'].includes(error.code)){
      console.error('[Moons catalog]',{operation:req.method,path:req.route?.path,code:error.code||'UNEXPECTED'});
      return res.status(503).json({error:'The Moons catalog is temporarily unavailable. Please try again.',code:'MOONS_UNAVAILABLE'});
    }
    sendError(res,error);
  }};
  router.get('/',requirePermission('platform_moons.view'),run(async(req,res)=>res.json({items:await service.list(req.session.user),files_enabled:filesEnabled(),subscriptions_enabled:false,billing_enabled:false})));
  router.get('/:key/history',requirePermission('platform_moons.view'),run(async(req,res)=>res.json(await service.history(req.session.user,req.params.key))));
  router.patch('/:key',requirePermission('platform_moons.update'),run(async(req,res)=>res.json(await service.update(req.session.user,req.params.key,req.body))));
  router.post('/:key/prices',requirePermission('platform_moons.manage_prices'),run(async(req,res)=>res.status(201).json(await service.price(req.session.user,req.params.key,req.body))));
  router.post('/:key/status',requirePermission('platform_moons.publish'),run(async(req,res)=>res.json(await service.status(req.session.user,req.params.key,req.body))));
  return router;
}
module.exports={createMoonsRouter};

const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../../../middleware/auth');
const { sendError } = require('../../../utils/error-response');
const {service,enabled} = require('./files.runtime');
router.use(requireAuth);
router.get('/:id/content',rateLimit({windowMs:60000,limit:300,keyGenerator:req=>String(req.session.user.id),standardHeaders:'draft-7',legacyHeaders:false}),async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try{const result=await service.content(req.session.user,req.params.id);res.set({'Content-Type':result.mime,'Content-Length':result.bytes.length,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline; filename="image"'});res.send(result.bytes);}
  catch(error){if(!error.status&&!error.issues){error=new Error('Image is temporarily unavailable.');error.status=503;}sendError(res,error);}
});
router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');if(!enabled())return res.status(404).json({error:'Files are not enabled.',code:'FILES_DISABLED'});next();});
router.use(rateLimit({windowMs:60000,limit:300,keyGenerator:req=>String(req.session.user.id),standardHeaders:'draft-7',legacyHeaders:false}));
const run = handler => async(req,res)=>{try{await handler(req,res);}catch(error){if(!error.status&&!error.issues){error=new Error('File service is temporarily unavailable.');error.status=503;error.publicCode='FILES_UNAVAILABLE';}sendError(res,error);}};
router.get('/policies/:purpose',run(async(req,res)=>{res.json(await service.policyFor(req.session.user,req.params.purpose));}));
router.post('/upload-sessions',rateLimit({windowMs:60000,limit:20,keyGenerator:req=>String(req.session.user.id),standardHeaders:'draft-7',legacyHeaders:false}),run(async(req,res)=>res.status(201).json(await service.reserve(req.session.user,req.body))));
router.post('/upload-sessions/:id/complete',run(async(req,res)=>res.status(202).json(await service.complete(req.session.user,req.params.id))));
router.delete('/upload-sessions/:id',run(async(req,res)=>{await service.cancel(req.session.user,req.params.id);res.status(204).end();}));
router.get('/:id',run(async(req,res)=>res.json(await service.metadata(req.session.user,req.params.id))));
router.post('/:id/download-url',run(async(req,res)=>res.json(await service.download(req.session.user,req.params.id))));
module.exports=router;

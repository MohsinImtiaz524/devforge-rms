const express = require('express');
const multer = require('multer');
const {rateLimit} = require('express-rate-limit');
const {requireAuth} = require('../../../../middleware/auth');
const {sendError} = require('../../../../utils/error-response');
const {renderWebsite,escape} = require('./website.render');
const {configuredDomain,hostname,localPathsEnabled,localWebsitePath} = require('./website.hosts');
const {MAX_BYTES} = require('./website.service');
const enabled = () => process.env.MOONS_ENABLED === 'true' && process.env.WEBSITE_MOON_ENABLED === 'true';
function handle(handler) {
  return async (req,res,next) => {
    try { await handler(req,res,next); }
    catch(error) {
      if (error.status || error.issues || ['23505','SQLITE_CONSTRAINT_UNIQUE'].includes(error.code)) return sendError(res,error);
      console.error('[Website Moon]',{operation:req.method,code:error.code || 'UNEXPECTED'});
      res.status(503).json({error:'Website Moon is temporarily unavailable. Please try again.',code:'WEBSITE_UNAVAILABLE'});
    }
  };
}
function imageResponse(res,image) {
  res.set({'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(image.bytes);
}
function createWebsiteRouter({service,isEnabled=enabled}) {
  const router = express.Router();
  router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.use(requireAuth);
  router.use((req,res,next)=>isEnabled()?next():res.status(503).json({error:'Website Moon is not enabled.',code:'WEBSITE_DISABLED'}));
  router.use(rateLimit({windowMs:60000,limit:90,keyGenerator:req=>String(req.session.user.id),standardHeaders:'draft-7',legacyHeaders:false}));
  router.get('/',handle(async(req,res)=>res.json(await service.get(req.session.user))));
  router.post('/menu-import',handle(async(req,res)=>res.json(await service.importMenu(req.session.user))));
  router.post('/render-preview',handle(async(req,res)=>{const result=renderWebsite(await service.renderPreview(req.session.user,req.body),{preview:true});const policy=result.headers['Content-Security-Policy'].replace(/;\s*frame-ancestors[^;]*/,'');res.json({html:result.html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+escape(policy)+'">')});}));
  router.put('/draft',handle(async(req,res)=>res.json(await service.save(req.session.user,req.body))));
  router.post('/publish',handle(async(req,res)=>res.json(await service.publish(req.session.user,req.body))));
  router.post('/unpublish',handle(async(req,res)=>res.json(await service.unpublish(req.session.user,req.body))));
  router.get('/preview',handle(async(req,res)=>{const result=renderWebsite(await service.preview(req.session.user),{preview:true});res.set(result.headers).type('html').send(result.html);}));
  router.get('/assets/:id',handle(async(req,res)=>imageResponse(res,await service.privateAsset(req.session.user,req.params.id))));
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:1}}).single('image');
  router.post('/assets',handle(async(req,res,next)=>{
    // Authorize before buffering an upload; service rechecks before persistence.
    await service.get(req.session.user).then(result=>{if(!result.permissions.includes('website.edit'))throw Object.assign(new Error('You do not have permission to upload images.'),{status:403});});
    upload(req,res,error=>{
      if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:'Use one image up to 5 MB.'});
      handle(async(req,res)=>res.status(201).json(await service.upload(req.session.user,req.file)))(req,res,next);
    });
  }));
  return router;
}
function createPublicWebsiteHandler({service,domain=()=>configuredDomain(),isEnabled=enabled,production=process.env.NODE_ENV==='production'}) {
  const limiter=rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-7',legacyHeaders:false});
  return (req,res,next) => {
    let base;
    try { base=domain(); } catch { return next(); }
    const host=hostname(req.headers.host);
    if (!host && String(req.headers.host || '').toLowerCase().includes(base)) return res.set('Cache-Control','private, no-store').status(400).end();
    if (!host || !(host===base || host.endsWith('.'+base))) return next();
    // Consume the whole public origin before sessions, CSRF, static files and APIs.
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Frame-Options':'DENY'});
    if (!isEnabled()) return res.status(404).end();
    if (production) {
      res.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
      if (!req.secure) return res.status(400).send('HTTPS is required.');
    }
    if (!['GET','HEAD'].includes(req.method)) return res.status(405).end();
    limiter(req,res,()=>handle(async(req,res)=>{
      if(req.path==='/') {const result=renderWebsite((await service.publicWebsite(req.headers.host)).configuration);return res.set(result.headers).type('html').send(result.html);}
      const match=/^\/assets\/([a-f0-9-]{36})$/.exec(req.path);
      if(match)return imageResponse(res,await service.publicAsset(req.headers.host,match[1]));
      res.status(404).end();
    })(req,res,next));
  };
}
function validateHosting() {
  if(localPathsEnabled()) return null;
  const domain = configuredDomain();
  const origin = new URL(process.env.WEBSITE_ADMIN_ORIGIN || '');
  if(origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash || origin.hostname===domain || origin.hostname.endsWith('.'+domain)) throw new Error('WEBSITE_ADMIN_ORIGIN must be the HTTPS administration origin outside WEBSITE_DOMAIN.');
  return domain;
}
function createLocalWebsiteHandler({service,isEnabled=enabled,isLocal=localPathsEnabled}) {
  const limiter=rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-7',legacyHeaders:false});
  return (req,res,next)=>{
    if(!req.path.startsWith('/app/moon/'))return next();
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if(process.env.NODE_ENV==='production'||!isLocal()||!isEnabled()||!loopback||!['localhost','127.0.0.1'].includes(hostname(req.headers.host)))return res.status(404).end();
    if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
    const match=/^\/app\/moon\/([a-z0-9-]{3,50})\/website(?:\/assets\/([a-f0-9-]{36}))?\/?$/.exec(req.path);
    if(!match)return res.status(404).end();
    limiter(req,res,()=>handle(async(req,res)=>{
      if(match[2])return imageResponse(res,await service.publicAssetByLabel(match[1],match[2]));
      const website=await service.publicWebsiteByLabel(match[1]);const result=renderWebsite(website.configuration,{publicBasePath:localWebsitePath(match[1])});res.set(result.headers).type('html').send(result.html);
    })(req,res,next));
  };
}
module.exports={createLocalWebsiteHandler,createWebsiteRouter,createPublicWebsiteHandler,enabled,validateHosting};

const express = require('express');
const { requireSuperAdmin } = require('../../../middleware/auth');
const { sendError } = require('../../../utils/error-response');
function createIconRouter(db, runtime) {
  const router = express.Router();
  const files=()=>runtime || require('../files/files.runtime');
  router.use(requireSuperAdmin, (req,res,next) => { res.set('Cache-Control','private, no-store'); next(); });
  router.get('/', async (req,res,next) => { try {
    const rows = await db('platform_icons').select('key','label','image_data','file_id').orderBy('label');
    for(const row of rows){ row.file=row.file_id?await files().service.metadata(req.session.user,row.file_id):null;row.image_url=row.file?.preview_url||row.image_data||null; }
    if (!rows.some(row => row.key === 'foodpanda')) rows.unshift({key:'foodpanda',label:'Foodpanda',image_url:null,file:null});
    res.json(rows);
  } catch(error) { next(error); } });
  router.put('/:key', async (req,res) => { try {
    const key = req.params.key, label = String(req.body.label || '').trim();
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || !label || label.length > 100) return res.status(400).json({error:'Use a valid icon key and name.'});
    if(req.body.image_data!==undefined)return res.status(400).json({error:'Upload images through the shared file uploader.'});
    const changes={label};
    if(req.body.file_id!==undefined){
      if(!files().enabled())return res.status(409).json({error:'File uploads are not enabled.'});
      await db.transaction(async trx=>{
        await trx('platform_icons').insert({key,label}).onConflict('key').merge({label});
        await files().service.syncAttachments(trx,req.session.user,{type:'platform.icon',id:key,purpose:'platform.icon'},req.body.file_id?[req.body.file_id]:[]);
        await trx('platform_icons').where({key}).update({file_id:req.body.file_id||null,image_data:null});
      });
    }else await db('platform_icons').insert({key,label}).onConflict('key').merge(changes);
    res.json({key,label});
  } catch(error) { sendError(res,error); } });
  return router;
}
function createIconReadRouter(db, runtime) {
 const router = express.Router();
 router.use(require('../../../middleware/auth').requireAuth);
 router.get('/', async (req,res,next) => {try {
  res.set('Cache-Control','private, no-store');
  const rows=await db('platform_icons').select('key','label','file_id','image_data');
  const service=(runtime || require('../files/files.runtime')).service;
  res.json(await Promise.all(rows.map(async row=>({key:row.key,label:row.label,image_url:row.file_id?(await service.metadata(req.session.user,row.file_id)).preview_url:row.image_data||null}))));
 } catch(error){next(error)}});
 return router;
}
module.exports = {createIconRouter,createIconReadRouter};

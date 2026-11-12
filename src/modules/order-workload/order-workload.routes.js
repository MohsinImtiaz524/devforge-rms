const express=require('express');
const {requireAuth}=require('../../../middleware/auth');
const {requirePermission}=require('../../../authorization/middleware');
const {getOrderWorkload}=require('./order-workload.service');
function createOrderWorkloadRouter({db}){
  const router=express.Router();
  router.get('/',requireAuth,requirePermission('orders.create','orders.update'),async(req,res,next)=>{
    const shopId=Number(req.session.user.shop_id);
    if(!Number.isSafeInteger(shopId)||shopId<=0)return res.status(403).json({error:'An active shop is required.'});
    try{res.set('Cache-Control','no-store');res.json(await getOrderWorkload(db,shopId))}catch(error){next(error)}
  });
  return router;
}
module.exports={createOrderWorkloadRouter};

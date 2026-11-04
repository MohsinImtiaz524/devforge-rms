const path=require('node:path');
const PREFIX='/website-templates/premium-restaurant/';
const NAMES=Object.freeze(['hero.webp','pizza.webp','burger.webp','combo.webp','fries.webp','pasta.webp','preview.webp','restaurant.css','restaurant.js','pizza.svg','burger.svg','pasta.svg','sides.svg','desserts.svg','drinks.svg','gift.svg','search.svg','menu.svg','close.svg','arrow.svg','phone.svg','mail.svg','pin.svg','clock.svg','store.svg','quality.svg','heart.svg','chevron.svg']);
const sharedPhotos=Object.freeze({ 'premium:pizza':'pizza.webp','premium:burger':'burger.webp','premium:combo':'combo.webp','premium:fries':'fries.webp','premium:pasta':'pasta.webp' });
function sharedPhoto(value){return Object.hasOwn(sharedPhotos,value)?PREFIX+sharedPhotos[value]:null;}
function ownedAssetIds(c){return [...new Set([c.logo,c.heroImage,...c.menuItems.map(item=>item.image)].filter(id=>id&&!sharedPhoto(id)))];}
function createTemplateAssetHandler(){return(req,res,next)=>{
 if(!req.path.startsWith(PREFIX))return next();
 if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
 const name=req.path.slice(PREFIX.length);if(!NAMES.includes(name))return res.status(404).end();
 res.set({'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 res.sendFile(path.join(__dirname,'../../../../public/website-templates/premium-restaurant',name),error=>{if(error&&!res.headersSent)res.status(404).end();});
};}
module.exports={PREFIX,NAMES,sharedPhotos,sharedPhoto,ownedAssetIds,createTemplateAssetHandler};

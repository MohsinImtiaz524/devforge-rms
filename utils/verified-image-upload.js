const multer=require('multer');
const {rateLimit}=require('express-rate-limit');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {verify}=require('../src/modules/files/files.verification');
const {imageDefaults,stillTypes,fail}=require('../src/modules/files/files.policies');
const {formats}=require('../src/modules/files/files.image-formats');
function rulesFor({maxBytes,allowGif=false}){return {...imageDefaults,maxBytes,types:allowGif?[...stillTypes,'image/gif']:stillTypes,maxFrames:allowGif?100:1,maxDecodedPixels:allowGif?32000000:imageDefaults.maxDecodedPixels};}
async function normalizedDataImage(value,{maxBytes=5*1024*1024}={}) {
  if(value==='')return '';
  if(typeof value!=='string')fail(400,'Invalid image data.','INVALID_IMAGE');
  const match=/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length>Math.ceil(maxBytes/3)*4)fail(415,'Use a supported image file.','INVALID_IMAGE');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.toString('base64')!==match[2])fail(415,'Invalid image encoding.','INVALID_IMAGE');
  const image=await verify(bytes,match[1],maxBytes,rulesFor({maxBytes,allowGif:true}));
  return `data:${image.mime};base64,${image.bytes.toString('base64')}`;
}
function createVerifiedImageUpload({directory,prefix,maxBytes,allowGif=false}) {
  const rules=rulesFor({maxBytes,allowGif});
  const parser=multer({storage:multer.memoryStorage(),limits:{fileSize:maxBytes,files:1,fields:100,parts:102},fileFilter:(req,file,cb)=>{
    if(!rules.types.includes(file.mimetype))return cb(Object.assign(new Error('Unsupported image format.'),{status:415}));
    cb(null,true);
  }});
  const limiter=rateLimit({windowMs:60000,limit:20,keyGenerator:req=>String(req.session?.user?.id||'unauthenticated'),standardHeaders:'draft-7',legacyHeaders:false});
  return {single:field=>(req,res,next)=>limiter(req,res,()=>parser.single(field)(req,res,async error=>{
    if(error){error.status=error.code==='LIMIT_FILE_SIZE'?413:(error.status||400);return next(error);}
    if(!req.file)return next();
    try {
      const shop=Number(req.session?.user?.shop_id);if(!Number.isSafeInteger(shop)||shop<=0)fail(403,'Select a restaurant first.','FORBIDDEN');
      const image=await verify(req.file.buffer,req.file.mimetype,maxBytes,rules);
      await fs.mkdir(directory,{recursive:true});
      const filename=`${prefix}-${shop}-${crypto.randomUUID()}${formats[image.mime].extension}`,target=path.join(directory,filename);
      await fs.writeFile(target,image.bytes,{flag:'wx'});
      req.file={...req.file,filename,path:target,destination:directory,mimetype:image.mime,size:image.bytes.length,buffer:image.bytes};
      res.once('finish',()=>{if(res.statusCode>=400)void fs.unlink(target).catch(()=>{});});next();
    }catch(e){next(e);}
  }))};
}
module.exports={createVerifiedImageUpload,normalizedDataImage,rulesFor};

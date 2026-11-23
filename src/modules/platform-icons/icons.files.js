const {fail}=require('../files/files.policies');
async function authorize(db,user,key){
 if(user?.role!=='superadmin')fail(403,'Only root administrators manage icons.','FORBIDDEN');
 if(!await db('platform_icons').where({key:String(key)}).first())fail(404,'Icon not found.','NOT_FOUND');
}
async function authorizeView(db,user,key){
 if(!user?.id)fail(401,'Unauthorized.','UNAUTHORIZED');
 if(!await db('platform_icons').where({key:String(key)}).first())fail(404,'Icon not found.','NOT_FOUND');
}
module.exports={resources:{'platform.icon':{purpose:'platform.icon',authorizeEdit:authorize,authorizeView}}};

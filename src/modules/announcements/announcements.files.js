// Resource-specific authority lives in the owning module, never the storage adapter.
const {fail}=require('../files/files.policies');
async function authorizeEdit(trx,user,id){
  if(user?.role!=='superadmin')fail(403,'Only platform administrators may edit announcements.','FORBIDDEN');
  const value=Number(id);if(!Number.isSafeInteger(value)||value<=0)fail(400,'Invalid announcement ID.','INVALID_RESOURCE');
  const row=await trx('announcements').where({id:value}).forUpdate().first();
  if(!row)fail(404,'Announcement not found.','ANNOUNCEMENT_NOT_FOUND');
  if(['expired','archived'].includes(row.status))fail(409,'Announcement cannot be edited.','ANNOUNCEMENT_LOCKED');
}
async function authorizeView(trx,user,id){
  if(user?.role==='superadmin'){if(!await trx('announcements').where({id:Number(id)}).first())fail(404,'Announcement not found.','ANNOUNCEMENT_NOT_FOUND');return;}
  await require('./announcements.service').recipientGet(user,id);
}
module.exports={
  announcement:{purpose:'announcement.attachment',authorizeEdit,authorizeView},
  'announcement.artwork':{purpose:'announcement.artwork',authorizeEdit,authorizeView},
};

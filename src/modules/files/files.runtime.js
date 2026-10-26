const db=require('../../../db/knex');
const {createFilesService}=require('./files.service');
const enabled=()=>process.env.FILES_ENABLED==='true';
const shops=require('../shops/shops.files');
const service=createFilesService({db,resources:{...require('../announcements/announcements.files'),...shops.resources},purposeAuthorizers:{'company.logo':shops.authorizeLogoUpload}});
module.exports={service,enabled};

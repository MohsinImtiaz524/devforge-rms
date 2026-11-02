const db=require('../../../db/knex');
const {createFilesService}=require('./files.service');
const enabled=()=>process.env.FILES_ENABLED==='true';
const shops=require('../shops/shops.files');
const service=createFilesService({db,resources:{...require('../announcements/announcements.files'),...shops.resources,...require('../moons/moons.files').resources},purposeAuthorizers:{'company.logo':shops.authorizeLogoUpload,...require('../moons/moons.files').purposeAuthorizers}});
module.exports={service,enabled};

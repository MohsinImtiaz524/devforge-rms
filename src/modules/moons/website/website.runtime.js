const {createWebsiteService} = require('./website.service');
const service = createWebsiteService({db:require('../../../../db/knex'),domain:()=>require('./website.routes').validateHosting()});
module.exports={service};

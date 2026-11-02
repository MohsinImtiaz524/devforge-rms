const { createMoonsService } = require('./moons.service');
const service=createMoonsService({db:require('../../../db/knex')});
module.exports={service};

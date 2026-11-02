const test=require('node:test'),assert=require('node:assert/strict');const dbPath=require.resolve('../db/knex'),repoPath=require.resolve('../src/modules/staff-activity/staff-activity.repository'),notificationPath=require.resolve('../services/NotificationService'),servicePath=require.resolve('../src/modules/staff-activity/staff-activity.service');function load(){delete require.cache[servicePath];for(const[p,exports]of[[dbPath,{}],[repoPath,{}],[notificationPath,{}]])require.cache[p]={id:p,filename:p,loaded:true,exports};return require(servicePath)}test.afterEach(()=>[dbPath,repoPath,notificationPath,servicePath].forEach(p=>delete require.cache[p]));
test('activity filters are date bounded and strict',()=>{const{filtersSchema}=require('../src/modules/staff-activity/staff-activity.schema');assert.equal(filtersSchema.parse({from:'2026-08-01',to:'2026-08-31'}).record_type,'all');assert.throws(()=>filtersSchema.parse({from:'bad',to:'2026-08-31'}))});
test('CSV export cells prevent spreadsheet formula execution',()=>{const{csvCell}=load();assert.equal(csvCell('=2+2'),'"\'=2+2"');assert.equal(csvCell('safe'),'"safe"')});
test('staff activity history is immutable and no score column is created',()=>{const{STAFF_ACTIVITY_MIGRATION_SQL}=require('../src/modules/staff-activity/staff-activity.migration');assert.match(STAFF_ACTIVITY_MIGRATION_SQL,/staff_activity_record_history/);assert.match(STAFF_ACTIVITY_MIGRATION_SQL,/BEFORE UPDATE OR DELETE ON staff_activity_record_history/);assert.doesNotMatch(STAFF_ACTIVITY_MIGRATION_SQL,/performance_score/i)});

test('staff activity CSV includes the total value beside the same creator-order count',async()=>{
 const service=load();require(repoPath).report=async()=>[{employee_id:'EMP-1',full_name:'Waiter A',department:'Service',orders_handled:500,orders_total:'100000.00',payments_received:0,payment_amount:0}];
 const exported=await service.exportCsv({id:1,shop_id:1,permissions:['staff_activity.manage']},{from:'2026-11-01',to:'2026-11-02'});
 assert.match(exported.content,/"Orders placed","Order value","Payments received"/);
 assert.match(exported.content,/"500","100000.00","0","0"/);
});

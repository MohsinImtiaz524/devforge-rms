const test=require('node:test'),assert=require('node:assert/strict');
test('staff custom date filters validate ranges and serialize displayed filters for report, records and export',async()=>{
 const {activityDateError,activityQuery}=await import('../frontend/src/modules/staff/components/staff-activity-filters.js');
 const base={from:'2026-11-01',to:'2026-11-02',department_id:'10',staff_profile_id:'2',record_type:'recognition'};
 assert.equal(activityDateError(base),'');
 assert.equal(activityDateError({...base,from:'2024-01-01',to:'2024-12-31'}),'');
 for(const invalid of [{from:''},{to:''},{from:'2026-11-03'},{from:'2020-01-01'},{from:'2026-02-30'},{from:'bad'}])assert.ok(activityDateError({...base,...invalid}));
 const metrics=new URLSearchParams(activityQuery(base));assert.equal(metrics.get('from'),'2026-11-01');assert.equal(metrics.get('to'),'2026-11-02');assert.equal(metrics.get('department_id'),'10');assert.equal(metrics.get('staff_profile_id'),'2');assert.equal(metrics.has('record_type'),false);
 assert.equal(new URLSearchParams(activityQuery(base,true)).get('record_type'),'recognition');
 assert.equal(activityQuery({...base,department_id:'',staff_profile_id:'',record_type:'all'},true),'from=2026-11-01&to=2026-11-02');
});

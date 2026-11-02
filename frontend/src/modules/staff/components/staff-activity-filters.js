export function activityDateError(filters) {
  if(!filters.from || !filters.to)return 'Choose both a start and end date.';
  const from=Date.parse(filters.from+'T00:00:00Z'),to=Date.parse(filters.to+'T00:00:00Z');
  if(!Number.isFinite(from)||!Number.isFinite(to)||!/^\d{4}-\d{2}-\d{2}$/.test(filters.from)||!/^\d{4}-\d{2}-\d{2}$/.test(filters.to)||new Date(from).toISOString().slice(0,10)!==filters.from||new Date(to).toISOString().slice(0,10)!==filters.to)return 'Choose valid dates.';
  const days=(to-from)/86400000+1;
  if(days<1)return 'The end date must be on or after the start date.';
  if(days>366)return 'Choose a date range of 366 days or fewer.';
  return '';
}
export function activityQuery(filters,records=false) {
  const values={from:filters.from,to:filters.to,department_id:filters.department_id,staff_profile_id:filters.staff_profile_id};
  if(records && filters.record_type!=='all')values.record_type=filters.record_type;
  return new URLSearchParams(Object.fromEntries(Object.entries(values).filter(([,value])=>value!==''&&value!==undefined))).toString();
}

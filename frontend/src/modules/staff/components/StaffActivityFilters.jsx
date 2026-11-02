import { activityQuery } from './staff-activity-filters';

export default function StaffActivityFilters({filters,options,onChange,canExport,showRecordType=false,invalid=false,onReset}) {
  const staff=(options.staff || []).filter(person=>!filters.department_id || String(person.department_id)===String(filters.department_id));
  return <div className="activity-filters">
    <label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={event=>onChange('from',event.target.value)}/></label>
    <label>To<input type="date" value={filters.to} min={filters.from || undefined} onChange={event=>onChange('to',event.target.value)}/></label>
    <label>Department<select aria-label="Department" value={filters.department_id} onChange={event=>onChange('department_id',event.target.value)}><option value="">All departments</option>{options.departments?.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
    <label>Staff<select aria-label="Staff" value={filters.staff_profile_id} onChange={event=>onChange('staff_profile_id',event.target.value)}><option value="">All accessible staff</option>{staff.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
    {showRecordType && <label>Record type<select aria-label="Record type" value={filters.record_type} onChange={event=>onChange('record_type',event.target.value)}><option value="all">All record types</option><option value="task">Tasks</option><option value="operational_note">Operational notes</option><option value="recognition">Recognition</option><option value="disciplinary">Disciplinary records</option></select></label>}
    <button type="button" className="secondary-button" onClick={onReset}>Reset filters</button>
    {canExport && <a className="secondary-button" aria-disabled={invalid} href={invalid?undefined:'/api/staff-activity/export?'+activityQuery(filters)}>Export metrics CSV</a>}
  </div>;
}

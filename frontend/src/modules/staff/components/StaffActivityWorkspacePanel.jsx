import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api/client';
import StaffActivityFilters from './StaffActivityFilters';
import StaffActivityMetricsTable from './StaffActivityMetricsTable';
import StaffActivityRecordForm from './StaffActivityRecordForm';
import StaffActivityRecordList from './StaffActivityRecordList';
import { activityDateError, activityQuery } from './staff-activity-filters';

const localDate=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
function initial() {
  const to=new Date(),from=new Date(to);from.setDate(from.getDate()-30);
  return {from:localDate(from),to:localDate(to),department_id:'',staff_profile_id:'',record_type:'all'};
}
export default function StaffActivityWorkspacePanel({has}) {
  const [filters,setFilters]=useState(initial);
  const [options,setOptions]=useState({staff:[],departments:[]});
  const [optionsError,setOptionsError]=useState('');
  const [optionsRetry,setOptionsRetry]=useState(0);
  const [tab,setTab]=useState('metrics');
  const [refresh,setRefresh]=useState(0);
  const [result,setResult]=useState({});
  const invalid=activityDateError(filters);
  const query=activityQuery(filters,tab==='records');
  const requestKey=JSON.stringify([tab,query,refresh]);
  const current=result.key===requestKey?result:null;
  const reload=useCallback(()=>setRefresh(value=>value+1),[]);

  useEffect(()=>{
    const controller=new AbortController();
    api('/api/staff-activity/filters',{signal:controller.signal}).then(value=>{
      if(!controller.signal.aborted){setOptions(value);setOptionsError('');}
    }).catch(error=>{if(!controller.signal.aborted)setOptionsError(error.message);});
    return()=>controller.abort();
  },[optionsRetry]);

  useEffect(()=>{
    if(invalid)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      const endpoint=tab==='metrics'?'report':'records';
      api('/api/staff-activity/'+endpoint+'?'+query,{signal:controller.signal}).then(data=>{
        if(!controller.signal.aborted)setResult({key:requestKey,data});
      }).catch(error=>{if(!controller.signal.aborted)setResult({key:requestKey,error:error.message});});
    },150);
    return()=>{clearTimeout(timer);controller.abort();};
  },[tab,query,requestKey,invalid]);

  function changeFilter(key,value) {
    setFilters(previous=>({...previous,[key]:value,...(key==='department_id'?{staff_profile_id:''}:{})}));
  }
  return <div className="staff-activity-workspace">
    <header className="embedded-panel-heading"><div><p className="section-label">Operational evidence</p><h2>Staff activity &amp; records</h2><p>Orders, payments, register activity, attendance reliability, tasks, recognition, and disciplinary history.</p></div></header>
    {optionsError && <div className="form-error" role="alert">{optionsError} <button onClick={()=>setOptionsRetry(value=>value+1)}>Retry filter options</button></div>}
    <StaffActivityFilters filters={filters} options={options} canExport={has('staff_activity.export')} onChange={changeFilter} onReset={()=>setFilters(initial())} showRecordType={tab==='records'} invalid={Boolean(invalid)}/>
    <nav aria-label="Staff activity views"><button className={tab==='metrics'?'active':''} onClick={()=>setTab('metrics')}>Operational metrics</button><button className={tab==='records'?'active':''} onClick={()=>setTab('records')}>Tasks &amp; records</button></nav>
    {invalid ? <div className="form-error" role="alert">{invalid}</div> : <>
      {tab==='records' && has('staff_activity.manage') && <StaffActivityRecordForm staff={options.staff || []} onCreated={reload}/>}
      {current?.error ? <div className="form-error" role="alert">{current.error} <button onClick={reload}>Retry activity</button></div> : !current ? <div className="staff-panel-loader" role="status">Updating activity...</div> : tab==='metrics' ? <StaffActivityMetricsTable report={current.data}/> : <StaffActivityRecordList records={current.data} canManage={has('staff_activity.manage')} onChanged={reload}/>}
    </>}
  </div>;
}

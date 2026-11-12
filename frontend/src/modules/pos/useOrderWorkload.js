import {useCallback,useEffect,useRef,useState} from 'react'
import {api} from '../../api/client'
export default function useOrderWorkload(enabled){
 const [state,setState]=useState({members:null,loading:false,error:false}),request=useRef(null),lastFetch=useRef(0),active=useRef(false)
 const refresh=useCallback((force=false)=>{
  if(!enabled||request.current||(!force&&Date.now()-lastFetch.current<5000))return
  lastFetch.current=Date.now();const controller=new AbortController();request.current=controller
  setState(current=>({...current,loading:true,error:false}))
  api('/api/order-workload',{signal:controller.signal}).then(result=>{
   if(!Array.isArray(result.members))throw new Error('Invalid workload response')
   if(active.current)setState({members:new Map(result.members.map(row=>[Number(row.user_id),row])),loading:false,error:false})
  }).catch(error=>{if(active.current&&error.name!=='AbortError')setState({members:null,loading:false,error:true})}).finally(()=>{if(request.current===controller)request.current=null})
 },[enabled])
 useEffect(()=>{
  active.current=true;if(!enabled)return()=>{active.current=false}
  refresh(true);const visible=()=>{if(!document.hidden)refresh()};const timer=setInterval(visible,30000)
  addEventListener('focus',visible);document.addEventListener('visibilitychange',visible)
  return()=>{active.current=false;clearInterval(timer);removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);request.current?.abort();request.current=null}
 },[enabled,refresh])
 const label=(id,rider=false)=>{
  if(state.error)return 'workload unavailable'
  const row=state.members?.get(Number(id));if(!row)return state.loading?'loading workload...':'workload unavailable'
  const count=Number(rider?row.active_deliveries:row.active_orders)||0
  return count+' active '+(rider?(count===1?'delivery':'deliveries'):(count===1?'order':'orders'))
 }
 return {...state,label,refresh}
}

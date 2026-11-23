import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import FileUpload from '../../components/files/FileUpload'
import { AdminPanel } from './admin-ui'
import { Save, LoaderCircle } from 'lucide-react'
import './root-icons.css'
function IconEditor({row,reload}) {
 const [files,setFiles]=useState(row.file?[row.file]:[]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const processing=files.some(file=>file.status!=='ready')
 const changed=(files[0]?.id||null)!==(row.file?.id||null)
 async function save(){if(busy||processing||!changed)return;setBusy(true);setError('');try{await api('/api/admin/icons/'+row.key,{method:'PUT',body:{label:row.label,file_id:files[0]?.id||null}});await reload()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="root-icon-editor"><h3>{row.label}</h3><small>{row.key}</small>
 {row.image_url&&<img src={row.image_url} alt={row.label} style={{display:'block',width:64,height:64,objectFit:'contain'}}/>}
 <FileUpload purpose="platform.icon" value={files} onChange={setFiles} disabled={busy} showDownload={false} label="Icon image" description="Raster icons become WebP. Supported SVG files stay SVG."/>
 <footer><p role="status">{busy?'Saving your icon...':processing?'Wait for upload and verification to finish. Retry any failed upload.':changed?'Unsaved changes. Click Save icon to apply them across the system.':row.image_url?'Saved icon. This image is available across the system.':'No saved image. Choose an image, wait until it is ready, then click Save icon.'}</p><button type="button" className="pa-primary" disabled={busy||processing||!changed} onClick={save}>{busy?<LoaderCircle size={16}/>:<Save size={16}/>} {busy?'Saving...':'Save icon'}</button></footer>{error&&<p className="pa-error" role="alert">{error}</p>}</section>
}
export default function RootIcons(){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[key,setKey]=useState(''),[label,setLabel]=useState(''),[busy,setBusy]=useState(false)
 async function load(){try{setRows(await api('/api/admin/icons'))}catch(e){setError(e.message)}}
 useEffect(()=>{void Promise.resolve().then(load)},[])
 async function add(e){e.preventDefault();if(!/^[a-z][a-z0-9_-]{0,63}$/.test(key)||rows.some(row=>row.key===key))return setError('Choose a unique lowercase icon key.');setBusy(true);try{await api('/api/admin/icons/'+key,{method:'PUT',body:{label}});setKey('');setLabel('');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <AdminPanel title="Icons" description="Manage shared icons using Cloudflare uploads. PNG, JPEG, WebP, GIF and restricted SVG, up to 2 MB."><div className="pa-settings-body">{error&&<p role="alert">{error}</p>}
 <form className="root-icon-add" onSubmit={add}><label className="pa-field">Icon key<input required value={key} onChange={e=>setKey(e.target.value)}/></label><label className="pa-field">Icon name<input required maxLength={100} value={label} onChange={e=>setLabel(e.target.value)}/></label><button className="pa-primary" disabled={busy}>Add icon</button></form>
 {rows.map(row=><IconEditor key={row.key+':'+(row.file?.id||'empty')} row={row} reload={load}/>)}</div></AdminPanel>
}

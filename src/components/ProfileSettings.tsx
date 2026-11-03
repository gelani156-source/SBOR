import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
const errorText=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String((e as {message:unknown}).message):String(e)
export default function ProfileSettings({userId}:{userId:string}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{if(!userId)return;void supabase.from('profiles').select('display_name').eq('id',userId).maybeSingle().then(({data,error})=>{if(error)setError(error.message);else if(data)setName(data.display_name||'')})},[userId])
 async function save(){if(!name.trim()||name.trim().length>80||busy)return;setBusy(true);setError('');try{
  const {error}=await supabase.from('profiles').upsert({id:userId,display_name:name.trim()},{onConflict:'id'})
  if(error)throw error;setNotice('Имя обновлено. Другие участники увидят его при следующем обновлении.')
 }catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <section style={{marginTop:18}}><div className="card" style={{display:'grid',gap:10}}><button className="secondary" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>👤 Мой профиль {open?'▴':'▾'}</button>{open&&<><label className="muted small">Имя для друзей<input maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Как тебя называть" style={{width:'100%',boxSizing:'border-box',fontSize:16,padding:12,marginTop:6,borderRadius:10,background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--line)'}}/></label><button className="primary" disabled={!name.trim()||busy} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить имя'}</button>{error&&<p role="alert" style={{color:'#ff9999'}}>{error}</p>}{notice&&<p role="status" className="muted small">{notice}</p>}</>}</div></section>
}

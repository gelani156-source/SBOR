import {useCallback,useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
type Message={id:string;author_id:string;body:string;created_at:string}
type Profile={id:string;display_name:string}
const errorText=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String((e as {message:unknown}).message):String(e)
export default function TripChat({tripId,userId}:{tripId:string;userId:string}){
 const [open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([]),[names,setNames]=useState<Record<string,string>>({})
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=useCallback(async()=>{
  const {data,error}=await supabase.from('messages').select('id,author_id,body,created_at').eq('trip_id',tripId).order('created_at',{ascending:false}).limit(150)
  if(error)throw error
  const latest=((data||[]) as Message[]).reverse();setMessages(latest)
  const ids=[...new Set(latest.map(m=>m.author_id))]
  if(ids.length){const p=await supabase.from('profiles').select('id,display_name').in('id',ids);if(p.error)throw p.error;setNames(Object.fromEntries(((p.data||[]) as Profile[]).map(x=>[x.id,x.display_name])))}
 },[tripId])
 useEffect(()=>{if(!open)return;void load().catch(e=>setError(errorText(e)));const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load().catch(()=>{})},15000);return()=>window.clearInterval(timer)},[open,load])
 const send=async()=>{const body=text.trim();if(!body||busy)return;setBusy(true);setError('');try{const {error}=await supabase.from('messages').insert({trip_id:tripId,author_id:userId,body});if(error)throw error;setText('');await load()}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <section style={{marginTop:18}}><div className="card" style={{display:'grid',gap:12}}>
  <button className="secondary" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>💬 Чат поездки ({messages.length}) {open?'▴':'▾'}</button>
  {open&&<><div style={{display:'grid',gap:8,maxHeight:350,overflowY:'auto'}}>{!messages.length&&<p className="muted small">Первое сообщение ещё не отправлено</p>}{messages.map(m=><div key={m.id} style={{padding:10,border:'1px solid var(--line)',borderRadius:12,background:'var(--surface2)'}}><div className="muted small">{m.author_id===userId?'Вы':names[m.author_id]||'Участник'} · {new Date(m.created_at).toLocaleString('ru-RU')}</div><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</div></div>)}</div><textarea maxLength={4000} value={text} onChange={e=>setText(e.target.value)} placeholder="Написать компании…" style={{width:'100%',boxSizing:'border-box',fontSize:16,padding:12,borderRadius:10,background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--line)'}}/><button className="primary" onClick={()=>void send()} disabled={busy||!text.trim()}>Отправить</button><p className="muted small">Чат обновляется примерно каждые 15 секунд на открытой странице. Показаны последние 150 сообщений.</p>{error&&<p role="alert" style={{color:'#ff9999'}}>{error}</p>}</>}
 </div></section>
}

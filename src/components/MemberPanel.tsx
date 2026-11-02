import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Member={user_id:string;role:'owner'|'admin'|'member';joined_at:string};
type Profile={id:string;display_name:string;avatar_url:string|null};
const message=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String((e as {message:unknown}).message):String(e);
const roleName=(v:Member['role'])=>v==='owner'?'Организатор':v==='admin'?'Администратор':'Участник';
export default function MemberPanel({tripId,ownerId,userId}:{tripId:string;ownerId:string;userId:string}){
 const [members,setMembers]=useState<Member[]>([]);
 const [profiles,setProfiles]=useState<Record<string,Profile>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [open,setOpen]=useState(true);
 const reload=useCallback(async()=>{
  const {data,error}=await supabase.from('trip_members').select('user_id,role,joined_at').eq('trip_id',tripId).order('joined_at',{ascending:true});
  if(error)throw error;
  const people=(data||[]) as Member[];setMembers(people);
  if(people.length){
   const {data:p,error:profileError}=await supabase.from('profiles').select('id,display_name,avatar_url').in('id',people.map(x=>x.user_id));
   if(!profileError){setProfiles(Object.fromEntries(((p||[]) as Profile[]).map(v=>[v.id,v])));}
  }
 },[tripId]);
 useEffect(()=>{setMembers([]);setProfiles({});void reload().catch(e=>setError(message(e)))},[reload]);
 async function manage(member:Member,action:'admin'|'member'|'remove'){
  if(member.user_id===ownerId)return;
  const label=action==='remove'?'исключить участника':action==='admin'?'назначить администратором':'сделать участником';
  if(!window.confirm(`Подтверждаешь: ${label}?`))return;
  setBusy(true);setError('');
  try{
   const {error}=await supabase.rpc('sbor_manage_member',{p_trip_id:tripId,p_user_id:member.user_id,p_action:action});
   if(error)throw error;
   await reload();
  }catch(e){setError(message(e))}finally{setBusy(false)}
 }
 return <section style={{marginTop:18}}>
  <div className="card" style={{display:'grid',gap:12}}>
   <button type="button" className="secondary" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>👥 Участники ({members.length}) {open?'▴':'▾'}</button>
   {open&&<>
    {members.length===0&&<p className="muted small">Загружаем список участников…</p>}
    {members.map(m=>{
     const p=profiles[m.user_id];const isMe=m.user_id===userId;const canManage=ownerId===userId&&m.user_id!==ownerId;
     return <div className="row" key={m.user_id} style={{padding:'10px 0',borderTop:'1px solid var(--line)',gap:9,alignItems:'center',flexWrap:'wrap'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:'1 1 155px'}}>
       {p?.avatar_url?<img src={p.avatar_url} alt="" width={38} height={38} style={{borderRadius:'50%',objectFit:'cover'}}/>:<div aria-hidden="true" style={{width:38,height:38,flexShrink:0,borderRadius:'50%',background:'#36596a',display:'grid',placeItems:'center',color:'#fff'}}>{(p?.display_name||'У').slice(0,1).toUpperCase()}</div>}
       <div style={{minWidth:0}}><strong>{p?.display_name||`Участник ${m.user_id.slice(0,6)}`}{isMe?' · вы':''}</strong><div className="muted small">{roleName(m.role)}</div></div>
      </div>
      {canManage&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
       <button type="button" className="secondary" disabled={busy} onClick={()=>void manage(m,m.role==='admin'?'member':'admin')}>{m.role==='admin'?'Снять роль':'Сделать админом'}</button>
       <button type="button" className="secondary" disabled={busy} onClick={()=>void manage(m,'remove')}>Исключить</button>
      </div>}
     </div>
    })}
    {ownerId===userId&&<p className="muted small">Назначать администраторов и исключать участников может только организатор. Организатора исключить нельзя.</p>}
    <button type="button" className="secondary" disabled={busy} onClick={()=>void reload().catch(e=>setError(message(e)))}>Обновить участников</button>
    {error&&<p role="alert" className="small" style={{color:'#ff9999'}}>{error}</p>}
   </>}
  </div>
 </section>
}

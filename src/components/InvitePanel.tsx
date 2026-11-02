import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Invite={id:string;created_at:string;expires_at:string;max_uses:number;uses_count:number;revoked_at:string|null};
type Created={invite_id:string;invite_token:string;expires_at:string};
const message=(e:unknown):string=>{if(e&&typeof e==='object'&&'message'in e)return String((e as {message:unknown}).message);return String(e)};
const fmt=(s:string)=>new Date(s).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

export default function InvitePanel({tripId,isAdmin,onJoined}:{tripId:string|null;isAdmin:boolean;onJoined:()=>Promise<void>}){
 const [hours,setHours]=useState(72);
 const [uses,setUses]=useState(1);
 const [link,setLink]=useState('');
 const [list,setList]=useState<Invite[]>([]);
 const [token,setToken]=useState(()=>new URLSearchParams(window.location.search).get('invite')||'');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [info,setInfo]=useState('');
 async function load(){if(!tripId||!isAdmin)return;const {data,error}=await supabase.rpc('sbor_list_invites',{p_trip_id:tripId});if(error)throw error;setList((data||[]) as Invite[])}
 useEffect(()=>{void load().catch(e=>setError(message(e)))},[tripId,isAdmin]);
 async function create(){if(!tripId)return;setBusy(true);setError('');setInfo('');try{
  const {data,error}=await supabase.rpc('sbor_create_invite',{p_trip_id:tripId,p_expires_hours:hours,p_max_uses:uses});
  if(error)throw error;const inv=(data as Created[]|null)?.[0];if(!inv?.invite_token)throw new Error('Токен приглашения не получен');
  const u=new URL(window.location.href);u.searchParams.set('invite',inv.invite_token);u.hash='';setLink(u.toString());await load();setInfo('Ссылка создана. Скопируй её сейчас: позднее токен не показывается.');
 }catch(e){setError(message(e))}finally{setBusy(false)}}
 async function accept(){setBusy(true);setError('');setInfo('');try{
  const value=token.trim();const matched=value.match(/[?&]invite=([0-9a-f]{64})/i);const raw=matched?matched[1]:value;
  const {error}=await supabase.rpc('sbor_accept_invite',{p_token:raw});if(error)throw error;
  const u=new URL(window.location.href);u.searchParams.delete('invite');window.history.replaceState(null,'',u.pathname+u.search+u.hash);
  setToken('');await onJoined();setInfo('Готово! Ты присоединился к путешествию.');
 }catch(e){setError(message(e))}finally{setBusy(false)}}
 async function revoke(id:string){if(!confirm('Отозвать приглашение? Существующих участников это не удалит.'))return;
  setBusy(true);setError('');try{const {error}=await supabase.rpc('sbor_revoke_invite',{p_invite_id:id});if(error)throw error;await load();setInfo('Ссылка отозвана.')}catch(e){setError(message(e))}finally{setBusy(false)}}
 async function copy(){try{await navigator.clipboard.writeText(link);setInfo('Ссылка скопирована.')}catch{setInfo('Выдели ссылку и скопируй вручную.')}}
 return <section style={{marginTop:18}}>
  <div className="card" style={{display:'grid',gap:10}}>
   <strong>👥 Приглашения и участники</strong>
   <p className="muted small">Для вступления друг должен войти в свой аккаунт СБОР. Ссылки передавай только тем, кого хочешь пригласить.</p>
   {isAdmin&&tripId&&<>
    <label className="muted small">Срок действия
     <select style={selectStyle} value={hours} onChange={e=>setHours(Number(e.target.value))}>
      <option value={1}>1 час</option><option value={24}>1 день</option><option value={72}>3 дня</option><option value={168}>7 дней</option><option value={720}>30 дней</option>
     </select></label>
    <label className="muted small">Количество использований
     <select style={selectStyle} value={uses} onChange={e=>setUses(Number(e.target.value))}>
      <option value={1}>Одноразовая</option><option value={3}>До 3</option><option value={5}>До 5</option><option value={10}>До 10</option><option value={15}>До 15</option>
     </select></label>
    <button className="primary" disabled={busy} onClick={()=>void create()}>Создать ссылку</button>
    {link&&<><input aria-label="Ссылка приглашения" readOnly value={link} onFocus={e=>e.target.select()}/><button className="secondary" onClick={()=>void copy()}>📋 Скопировать ссылку</button></>}
    <div className="small muted">Действующие и отозванные ссылки</div>
    {list.map(x=><div key={x.id} className="row" style={{borderTop:'1px solid var(--line)',paddingTop:9}}>
     <div className="small"><div>До {fmt(x.expires_at)}</div><div className="muted">Использовано {x.uses_count} из {x.max_uses} · {x.revoked_at?'Отозвана':new Date(x.expires_at)<=new Date()?'Истекла':'Активна'}</div></div>
     {!x.revoked_at&&<button className="secondary" disabled={busy} onClick={()=>void revoke(x.id)}>Отозвать</button>}
    </div>)}
   </>}
   {!isAdmin&&tripId&&<p className="muted small">Создавать ссылки может создатель или администратор поездки.</p>}
   {!tripId&&<p className="muted small">Вступить в поездку по ссылке:</p>}
   <input aria-label="Код или ссылка приглашения" placeholder="Вставь ссылку или код приглашения" value={token} onChange={e=>setToken(e.target.value)}/>
   <button className="secondary" disabled={busy||!token.trim()} onClick={()=>void accept()}>Присоединиться по приглашению</button>
   {error&&<p role="alert" className="small" style={{color:'#ff9999'}}>{error}</p>}
   {info&&<p role="status" className="small" style={{color:'var(--accent)'}}>{info}</p>}
  </div>
 </section>
}
const selectStyle:React.CSSProperties={width:'100%',marginTop:6,background:'var(--surface2)',color:'var(--text)',padding:11,border:'1px solid var(--line)',borderRadius:10,fontSize:16};

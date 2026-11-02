import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,CalendarDays,Check,Cloud,LogOut,MapPin,Plus,RefreshCw,Route,Sun,Moon,Users} from 'lucide-react';
import {supabase} from '../lib/supabase';

type Trip={id:string;owner_id:string;title:string;destination:string;starts_on:string|null;ends_on:string|null;currency:string;status:string};
type Place={id:string;trip_id:string;title:string;kind:string;visit_date:string|null;visit_time:string|null;address:string;estimated_cost:number|null;visited:boolean};
const formatDate=(d:string|null)=>d?new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'Дата не выбрана';
const errText=(e:unknown)=>{
 if(e instanceof Error)return e.message;
 if(e&&typeof e==='object'){
  const x=e as Record<string,unknown>;
  return [
   x.message,
   x.code ? 'Код: '+x.code : '',
   x.details,
   x.hint
  ].filter(Boolean).map(String).join(' | ')
   || JSON.stringify(e);
 }
 return String(e);
};

export default function CloudTrips(){
 const [uid,setUid]=useState(''); const [email,setEmail]=useState('');
 const [trips,setTrips]=useState<Trip[]>([]); const [current,setCurrent]=useState<Trip|null>(null);
 const [places,setPlaces]=useState<Place[]>([]); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true);
 const [error,setError]=useState(''); const [modal,setModal]=useState<'trip'|'place'|null>(null);
 const [title,setTitle]=useState(''); const [destination,setDestination]=useState('');
 const [start,setStart]=useState(''); const [end,setEnd]=useState(''); const [visitDate,setVisitDate]=useState(''); const [visitTime,setVisitTime]=useState('12:00');
 const [light,setLight]=useState(false);
 const fetchTrips=useCallback(async()=>{
  const {data,error}=await supabase.from('trips').select('id,owner_id,title,destination,starts_on,ends_on,currency,status').order('created_at',{ascending:false});
  if(error)throw error;setTrips((data||[]) as Trip[]);
 },[]);
 const fetchPlaces=useCallback(async(tripId:string)=>{
  const {data,error}=await supabase.from('places').select('id,trip_id,title,kind,visit_date,visit_time,address,estimated_cost,visited').eq('trip_id',tripId).order('visit_date',{ascending:true,nullsFirst:false}).order('visit_time',{ascending:true,nullsFirst:false});
  if(error)throw error;setPlaces((data||[]) as Place[]);
 },[]);
 useEffect(()=>{let active=true;(async()=>{try{
   const {data,error}=await supabase.auth.getUser();if(error)throw error;
   if(!active)return;setUid(data.user?.id||'');setEmail(data.user?.email||'');await fetchTrips();
  }catch(e){if(active)setError('Не удалось загрузить поездки: '+errText(e));}
  finally{if(active)setLoading(false)} })();return()=>{active=false};},[fetchTrips]);
 useEffect(()=>{if(!current)return;let active=true;fetchPlaces(current.id).catch(e=>{if(active)setError('Не удалось загрузить маршрут: '+errText(e))});return()=>{active=false}},[current,fetchPlaces]);
 async function refresh(){setError('');setBusy(true);try{await fetchTrips();if(current)await fetchPlaces(current.id)}catch(e){setError(errText(e))}finally{setBusy(false)}}
 function openTrip(){setTitle('');setDestination('');setStart('');setEnd('');setModal('trip')}
 function openPlace(){setTitle('');setVisitDate(current?.starts_on||'');setVisitTime('12:00');setModal('place')}
 async function create(){if(!title.trim()||!uid)return;setBusy(true);setError('');try{
   if(modal==='trip'){
    if(start&&end&&end<start)throw new Error('Дата окончания раньше начала');
    const {data,error}=await supabase.from('trips').insert({owner_id:uid,title:title.trim(),destination:destination.trim(),starts_on:start||null,ends_on:end||null}).select('id,owner_id,title,destination,starts_on,ends_on,currency,status').single();
    if(error)throw error;const newTrip=data as Trip;setTrips(v=>[newTrip,...v]);setCurrent(newTrip);setPlaces([]);
   }else if(modal==='place'&&current){
    const {error}=await supabase.from('places').insert({trip_id:current.id,title:title.trim(),visit_date:visitDate||null,visit_time:visitTime||null,kind:'Место',created_by:uid});
    if(error)throw error;await fetchPlaces(current.id);
   }setModal(null);
  }catch(e){setError('Не удалось сохранить: '+errText(e))}finally{setBusy(false)} }
 async function togglePlace(p:Place){setBusy(true);setError('');try{const {error}=await supabase.from('places').update({visited:!p.visited}).eq('id',p.id);if(error)throw error;await fetchPlaces(p.trip_id)}catch(e){setError(errText(e))}finally{setBusy(false)}}
 return <div className={'app '+(light?'light':'dark')}>
  <header className="header"><div><strong className="brand">СБ<span>О</span>Р</strong><small className="muted">BETA 0.2 · поездки в облаке</small></div><button className="square" aria-label="Сменить тему" onClick={()=>setLight(v=>!v)}>{light?<Moon size={19}/>:<Sun size={19}/>}</button></header>
  <main className="content">
   <div className="row" style={{margin:'8px 0 18px'}}><div className="small muted"><Cloud size={15}/> {email||'Авторизация Supabase'}</div><button className="secondary" onClick={()=>void supabase.auth.signOut()}><LogOut size={15}/> Выйти</button></div>
   {error&&<article role="alert" className="card" style={{borderColor:'#d47d7d',color:'var(--text)'}}><strong>Не удалось выполнить действие</strong><p className="small">{error}</p><button className="secondary" onClick={()=>setError('')}>Закрыть</button></article>}
   {current?<>
     <button className="secondary" onClick={()=>{setCurrent(null);setPlaces([])}}><ArrowLeft size={15}/> Мои поездки</button>
     <p className="eyebrow accent" style={{marginTop:20}}>ОБЛАЧНОЕ ПУТЕШЕСТВИЕ</p><h1>{current.title}</h1>
     <div className="card"><p><MapPin size={15} style={{verticalAlign:'middle'}}/> {current.destination||'Направление не указано'}</p><p className="muted small"><CalendarDays size={14} style={{verticalAlign:'middle'}}/> {formatDate(current.starts_on)} — {formatDate(current.ends_on)}</p></div>
     <section><div className="row"><h3>Маршрут</h3><button className="primary" onClick={openPlace}><Plus size={15}/> Место</button></div>
     {places.length===0?<article className="card centered"><Route size={34}/><h3>Маршрут пока пуст</h3><p className="muted small">Добавь первое мероприятие — оно сохранится в Supabase.</p></article>:
     places.map(p=><div className="event" key={p.id}><div className="rail"><span/><i/></div><article className="card eventcard"><p className="eyebrow accent">{formatDate(p.visit_date)} · {p.visit_time?.slice(0,5)||'Время не задано'}</p><strong>{p.title}</strong><div className="row topgap"><span className="muted small">{p.address||p.kind}</span><button className={'secondary '+(p.visited?'done':'')} disabled={busy} onClick={()=>void togglePlace(p)}><Check size={14}/>{p.visited?'Посещено':'Отметить'}</button></div></article></div>)}
     </section><button className="secondary" style={{marginTop:16}} onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/> Обновить маршрут</button>
    </>:<>
    <p className="eyebrow">МОИ ПУТЕШЕСТВИЯ</p><h1>Куда собираемся? 👋</h1>
    <div className="hero"><p className="accent eyebrow">НАСТОЯЩИЕ ПОЕЗДКИ</p><h1>{trips.length===0?'Создай первую поездку':trips[0].title}</h1><p>{trips.length===0?'Сохраним её в облаке Supabase':trips[0].destination||'Планируем вместе'}</p><div className="hero-count"><Users size={20}/> {trips.length} путешествий в аккаунте</div><button className="primary" onClick={trips.length?()=>setCurrent(trips[0]):openTrip}>{trips.length?'Открыть поездку →':'Создать поездку →'}</button></div>
    <section><div className="row"><h3>Мои поездки</h3><button className="primary" onClick={openTrip}><Plus size={15}/> Создать</button></div>
     {loading?<p className="muted">Загружаем поездки…</p>:trips.length===0?<article className="card"><p className="muted">Здесь появятся твои поездки. Демо-примеры не импортируются автоматически.</p></article>:trips.map(t=><article className="card row" key={t.id}><div><strong>{t.title}</strong><p className="muted small">{t.destination||'Направление не указано'} · {formatDate(t.starts_on)}</p></div><button className="secondary" onClick={()=>setCurrent(t)}>Открыть →</button></article>)}
    </section><button className="secondary" style={{marginTop:16}} onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/> Обновить список</button>
   </>}
  </main>
  {modal&&<div className="overlay" onClick={()=>!busy&&setModal(null)}><div className="sheet" onClick={e=>e.stopPropagation()}><div className="row"><h2>{modal==='trip'?'Новое путешествие':'Добавить мероприятие'}</h2><button className="square" aria-label="Закрыть" onClick={()=>setModal(null)}>✕</button></div>
    <input value={title} onChange={e=>setTitle(e.target.value)} placeholder={modal==='trip'?'Название поездки':'Название места'} maxLength={120}/>
    {modal==='trip'?<><input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Город или страна" maxLength={120}/><label className="small muted">Дата начала<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="small muted">Дата окончания<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></>:<><label className="small muted">Дата посещения<input type="date" value={visitDate} onChange={e=>setVisitDate(e.target.value)}/></label><label className="small muted">Время<input type="time" value={visitTime} onChange={e=>setVisitTime(e.target.value)}/></label></>}
    <button className="primary wide" disabled={busy||!title.trim()} onClick={()=>void create()}>{busy?'Сохраняем…':'Сохранить в Supabase'}</button>
    {error&&<p className="small" style={{color:'#ff9999'}}>{error}</p>}
  </div></div>}
 </div>
}

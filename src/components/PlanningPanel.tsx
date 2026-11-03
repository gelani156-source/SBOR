import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Kind='ideas'|'tasks'|'expenses';
type Idea={id:string;title:string;note:string;created_by:string};
type Task={id:string;title:string;done:boolean;created_by:string;assigned_to:string|null};
type Expense={id:string;title:string;amount:number;currency:string;paid_by:string;created_by:string};
type Member={user_id:string;role:string};
type Vote={idea_id:string;user_id:string};
type Split={expense_id:string;user_id:string;amount:number};
const message=(e:unknown)=>e&&typeof e==='object'&&'message'in e?String((e as {message:unknown}).message):String(e);
const money=(n:number,c:string)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n)+' '+c;
const tabs:{id:Kind;label:string}[]=[{id:'ideas',label:'💡 Идеи'},{id:'tasks',label:'✓ Задачи'},{id:'expenses',label:'₽ Расходы'}];
export default function PlanningPanel({tripId,userId,currency='RUB'}:{tripId:string;userId:string;currency?:string}){
 const [tab,setTab]=useState<Kind>('ideas');
 const [ideas,setIdeas]=useState<Idea[]>([]);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [expenses,setExpenses]=useState<Expense[]>([]);
 const [members,setMembers]=useState<Member[]>([]);
 const [votes,setVotes]=useState<Vote[]>([]);
 const [splits,setSplits]=useState<Split[]>([]);
 const [title,setTitle]=useState('');const [note,setNote]=useState('');
 const [amount,setAmount]=useState('');const [assignee,setAssignee]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [notice,setNotice]=useState('');const [open,setOpen]=useState(false);
 const load=useCallback(async()=>{
  const [i,t,e,m]=await Promise.all([
   supabase.from('ideas').select('id,title,note,created_by').eq('trip_id',tripId).order('created_at',{ascending:false}),
   supabase.from('tasks').select('id,title,done,created_by,assigned_to').eq('trip_id',tripId).order('created_at',{ascending:false}),
   supabase.from('expenses').select('id,title,amount,currency,paid_by,created_by').eq('trip_id',tripId).order('created_at',{ascending:false}),
   supabase.from('trip_members').select('user_id,role').eq('trip_id',tripId)
  ]);
  for(const q of [i,t,e,m])if(q.error)throw q.error;
  setIdeas((i.data||[]) as Idea[]);setTasks((t.data||[]) as Task[]);
  const expensesNext=(e.data||[]) as Expense[];
  const ideasNext=(i.data||[]) as Idea[];
  setExpenses(expensesNext);setMembers((m.data||[]) as Member[]);
  const [v,sp]=await Promise.all([
    ideasNext.length?supabase.from('idea_votes').select('idea_id,user_id').in('idea_id',ideasNext.map(x=>x.id)):Promise.resolve({data:[],error:null}),
    expensesNext.length?supabase.from('expense_splits').select('expense_id,user_id,amount').in('expense_id',expensesNext.map(x=>x.id)):Promise.resolve({data:[],error:null})
  ]);
  if(v.error)throw v.error;if(sp.error)throw sp.error;
  setVotes((v.data||[]) as Vote[]);setSplits((sp.data||[]) as Split[]);
 },[tripId]);
 useEffect(()=>{let alive=true;void load().catch(e=>{if(alive)setError(message(e))});return()=>{alive=false}},[load]);
 useEffect(()=>{setTitle('');setNote('');setAmount('');setAssignee('');setError('');setNotice('')},[tab,tripId]);
 useEffect(()=>{if(!open)return;const id=window.setInterval(()=>{if(document.visibilityState==='visible'&&!busy)void load().catch(()=>{})},15000);return()=>window.clearInterval(id)},[open,busy,load]);
 async function add(){if(!title.trim()||busy)return;setBusy(true);setError('');setNotice('');try{
  if(tab==='ideas'){
   const {error}=await supabase.from('ideas').insert({trip_id:tripId,title:title.trim(),note:note.trim(),created_by:userId});if(error)throw error;
  }else if(tab==='tasks'){
   const {error}=await supabase.from('tasks').insert({trip_id:tripId,title:title.trim(),done:false,created_by:userId,assigned_to:assignee||null});if(error)throw error;
  }else{
   const value=Number(amount.trim().replace(',','.'));
   if(!Number.isFinite(value)||value<=0||value>1e9)throw new Error('Введите положительную сумму');
   const {error}=await supabase.from('expenses').insert({trip_id:tripId,title:title.trim(),amount:value,currency,paid_by:userId,created_by:userId});if(error)throw error;
  }
  setTitle('');setNote('');setAmount('');setAssignee('');await load();setNotice('Сохранено для всей компании');
 }catch(e){setError(message(e))}finally{setBusy(false)}}
 async function vote(idea:Idea){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   const voted=votes.some(v=>v.idea_id===idea.id&&v.user_id===userId);
   const query=voted
    ?supabase.from('idea_votes').delete().eq('idea_id',idea.id).eq('user_id',userId)
    :supabase.from('idea_votes').insert({idea_id:idea.id,user_id:userId});
   const {error}=await query;if(error)throw error;
   await load();setNotice(voted?'Голос снят':'Голос учтён');
  }catch(e){setError(message(e))}finally{setBusy(false)}
 }
 async function splitExpense(expense:Expense){
  if(busy||!window.confirm('Разделить сумму поровну между текущими участниками поездки? Повторный расчёт заменит прежние доли.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {error}=await supabase.rpc('sbor_split_expense_equal',{p_expense_id:expense.id});
   if(error)throw error;
   await load();setNotice('Расход разделён поровну');
  }catch(e){setError(message(e))}finally{setBusy(false)}
 }
 async function toggle(t:Task){setBusy(true);setError('');try{
  const {error}=await supabase.from('tasks').update({done:!t.done}).eq('trip_id',tripId).eq('id',t.id);if(error)throw error;await load();
 }catch(e){setError(message(e))}finally{setBusy(false)}}
 async function remove(id:string,kind:Kind){if(!window.confirm('Удалить запись для всех участников?'))return;setBusy(true);setError('');try{
  const {error}=await supabase.from(kind).delete().eq('trip_id',tripId).eq('id',id);if(error)throw error;await load();
 }catch(e){setError(message(e))}finally{setBusy(false)}}
 const inputStyle:React.CSSProperties={width:'100%',padding:12,borderRadius:10,boxSizing:'border-box',background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--line)',fontSize:16};
 const list=tab==='ideas'?ideas:tab==='tasks'?tasks:expenses;
 const debts=new Map<string,number>();
 // Informational balances only: no transfers or settlement records are created.
 for(const expense of expenses){
  if(expense.currency!==currency)continue;
  for(const share of splits.filter(s=>s.expense_id===expense.id&&s.user_id!==expense.paid_by)){
   const key=share.user_id+'|'+expense.paid_by;
   debts.set(key,(debts.get(key)||0)+Number(share.amount));
  }
 }
 return <section style={{marginTop:18}}><div className="card" style={{display:'grid',gap:12}}>
  <button type="button" className="secondary" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>🧩 Планируем вместе {open?'▴':'▾'}</button>
  {open&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6}}>{tabs.map(t=><button key={t.id} type="button" onClick={()=>setTab(t.id)} style={{borderRadius:10,padding:'11px 3px',border:'1px solid var(--line)',background:tab===t.id?'var(--accent)':'var(--surface2)',color:tab===t.id?'#082634':'var(--text)',fontWeight:650,fontSize:12}}>{t.label}</button>)}</div>
   <p className="muted small" style={{margin:0}}>{tab==='ideas'?'Предлагайте идеи и голосуйте. Один голос на участника за каждую идею.':tab==='tasks'?'Общие дела перед поездкой. Отмечай выполненные задачи.':'Разделяйте каждый расход поровну между текущими участниками. Расчёт носит справочный характер.'}</p>
   <input style={inputStyle} value={title} maxLength={tab==='tasks'?300:tab==='ideas'?120:200} placeholder={tab==='ideas'?'Например, бар на крыше':tab==='tasks'?'Например, купить билеты':'Например, такси до отеля'} onChange={e=>setTitle(e.target.value)}/>
   {tab==='ideas'&&<textarea style={{...inputStyle,minHeight:76}} placeholder="Описание идеи (необязательно)" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/>}
   {tab==='tasks'&&<label className="muted small">Ответственный<select style={{...inputStyle,marginTop:5}} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Пока не назначен</option>{members.map(m=><option value={m.user_id} key={m.user_id}>{m.user_id===userId?'Я':`Участник ${m.user_id.slice(0,8)}`}</option>)}</select></label>}
   {tab==='expenses'&&<label className="muted small">Сумма ({currency})<input style={{...inputStyle,marginTop:5}} inputMode="decimal" value={amount} placeholder="0" onChange={e=>setAmount(e.target.value)}/></label>}
   <button type="button" className="primary" disabled={busy||!title.trim()} onClick={()=>void add()}>{busy?'Подождите…':tab==='ideas'?'Предложить идею':tab==='tasks'?'Добавить задачу':'Записать расход'}</button>
   <div className="row"><strong>{tab==='ideas'?'Предложения':tab==='tasks'?'Задачи':'Расходы'} ({list.length})</strong><button type="button" className="secondary" disabled={busy} onClick={()=>void load().catch(e=>setError(message(e)))}>Обновить</button></div>
   {tab==='expenses'&&<p style={{margin:0}}><strong>Итого: {money(expenses.reduce((n,e)=>n+Number(e.amount||0),0),currency)}</strong></p>}
   {list.length===0&&<p className="muted small">Пока пусто. Добавь первую запись!</p>}
   {tab==='ideas'&&ideas.map(i=><article key={i.id} style={{borderTop:'1px solid var(--line)',paddingTop:12}}><div className="row"><strong>{i.title}</strong>{i.created_by===userId&&<button type="button" className="secondary" disabled={busy} onClick={()=>void remove(i.id,'ideas')}>Удалить</button>}</div>{i.note&&<p className="muted small">{i.note}</p>}<div className="row" style={{marginTop:8,gap:9,flexWrap:'wrap'}}><span className="muted small">👍 {votes.filter(v=>v.idea_id===i.id).length} голосов</span><button type="button" className="secondary" disabled={busy} onClick={()=>void vote(i)}>{votes.some(v=>v.idea_id===i.id&&v.user_id===userId)?'✓ Голосую · Отменить':'👍 Поддержать'}</button></div></article>)}
   {tab==='tasks'&&tasks.map(t=><article key={t.id} style={{borderTop:'1px solid var(--line)',paddingTop:12}}><div className="row" style={{gap:8}}><label style={{display:'flex',alignItems:'center',gap:9,flex:1}}><input type="checkbox" checked={t.done} disabled={busy} onChange={()=>void toggle(t)}/><span style={{textDecoration:t.done?'line-through':undefined}}>{t.title}</span></label>{t.created_by===userId&&<button type="button" className="secondary" disabled={busy} onClick={()=>void remove(t.id,'tasks')}>Удалить</button>}</div>{t.assigned_to&&<p className="muted small">Ответственный: {t.assigned_to===userId?'Вы':`Участник ${t.assigned_to.slice(0,8)}`}</p>}</article>)}
   {tab==='expenses'&&expenses.map(e=><article key={e.id} style={{borderTop:'1px solid var(--line)',paddingTop:12}}><div className="row"><div><strong>{e.title}</strong><p className="muted small" style={{marginBottom:0}}>{money(Number(e.amount),e.currency)} · оплатил {e.paid_by===userId?'вы':'другой участник'}</p></div>{e.created_by===userId&&<button type="button" className="secondary" disabled={busy} onClick={()=>void remove(e.id,'expenses')}>Удалить</button>}</div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:9}}><button type="button" className="secondary" disabled={busy} onClick={()=>void splitExpense(e)}>Разделить поровну</button><span className="muted small">{splits.some(x=>x.expense_id===e.id)?'Разделено между '+splits.filter(x=>x.expense_id===e.id).length+' участниками':'Ещё не разделено'}</span></div>{splits.filter(x=>x.expense_id===e.id).map(x=><p key={x.user_id} className="muted small" style={{margin:'5px 0 0'}}> {x.user_id===userId?'Вы':`Участник ${x.user_id.slice(0,8)}`}: {money(Number(x.amount),e.currency)}</p>)}</article>)}
   {error&&<p role="alert" style={{color:'#ff9999'}}>{error}</p>}{notice&&<p role="status" className="muted small">{notice}</p>}
  </>}
 </div></section>
}

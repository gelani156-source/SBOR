import {useCallback,useEffect,useMemo,useState,type CSSProperties} from 'react'
import {supabase} from '../lib/supabase'

type Kind='ideas'|'tasks'|'expenses'
type Idea={id:string;title:string;note:string;created_by:string}
type Task={id:string;title:string;done:boolean;created_by:string;assigned_to:string|null;due_at:string|null}
type Expense={id:string;title:string;amount:number;currency:string;paid_by:string;created_by:string}
type Member={user_id:string;role:string}
type Vote={idea_id:string;user_id:string}
type Split={expense_id:string;user_id:string;amount:number}
type Settlement={id:string;debtor_id:string;creditor_id:string;amount:number;currency:string;status:string;requested_at:string}
type Profile={id:string;display_name:string}
type AllocationMode='equal'|'amount'|'percent'
const err=(e:unknown)=>e&&typeof e==='object'&&'message' in e?String((e as {message:unknown}).message):String(e)
const cents=(n:number)=>Math.round(n*100)
const amount=(n:number,c:string)=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' '+c
const number=(v:string)=>Number(v.trim().replace(',','.'))
const splitCents=(total:number,ids:string[]):Record<string,number>=>{
 const base=Math.floor(total/ids.length),remainder=total%ids.length
 return Object.fromEntries(ids.map((id,i)=>[id,base+(i<remainder?1:0)]))
}
const input:CSSProperties={boxSizing:'border-box',width:'100%',background:'var(--surface2)',color:'var(--text)',border:'1px solid var(--line)',borderRadius:12,padding:12,fontSize:16}
const line:CSSProperties={borderTop:'1px solid var(--line)',padding:'12px 0',display:'grid',gap:8}
export default function PlanningPanel({tripId,userId,currency='RUB',onAddPlace}:{tripId:string;userId:string;currency?:string;onAddPlace?:(title:string)=>Promise<void>}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState<Kind>('ideas')
 const [ideas,setIdeas]=useState<Idea[]>([]),[tasks,setTasks]=useState<Task[]>([]),[expenses,setExpenses]=useState<Expense[]>([])
 const [members,setMembers]=useState<Member[]>([]),[votes,setVotes]=useState<Vote[]>([]),[splits,setSplits]=useState<Split[]>([])
 const [settlements,setSettlements]=useState<Settlement[]>([]),[profiles,setProfiles]=useState<Record<string,string>>({})
 const [title,setTitle]=useState(''),[note,setNote]=useState(''),[amountText,setAmountText]=useState(''),[assigned,setAssigned]=useState(''),[due,setDue]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [editingExpense,setEditingExpense]=useState<string|null>(null)
 const [allocationMode,setAllocationMode]=useState<AllocationMode>('equal')
 const [selected,setSelected]=useState<string[]>([]),[allocationInput,setAllocationInput]=useState<Record<string,string>>({})
 const [transferTo,setTransferTo]=useState(''),[transferAmount,setTransferAmount]=useState('')
 const load=useCallback(async()=>{
  const [i,t,e,m,s]=await Promise.all([
   supabase.from('ideas').select('id,title,note,created_by').eq('trip_id',tripId).order('created_at',{ascending:false}),
   supabase.from('tasks').select('id,title,done,created_by,assigned_to,due_at').eq('trip_id',tripId).order('created_at',{ascending:false}),
   supabase.from('expenses').select('id,title,amount,currency,paid_by,created_by').eq('trip_id',tripId).order('created_at',{ascending:false}),
   supabase.from('trip_members').select('user_id,role').eq('trip_id',tripId),
   supabase.from('trip_settlements').select('id,debtor_id,creditor_id,amount,currency,status,requested_at').eq('trip_id',tripId).order('requested_at',{ascending:false})
  ])
  for(const q of [i,t,e,m,s])if(q.error)throw q.error
  const ii=(i.data||[]) as Idea[], ee=(e.data||[]) as Expense[], mm=(m.data||[]) as Member[]
  const [v,sp,pr]=await Promise.all([
   ii.length?supabase.from('idea_votes').select('idea_id,user_id').in('idea_id',ii.map(x=>x.id)):Promise.resolve({data:[],error:null}),
   ee.length?supabase.from('expense_splits').select('expense_id,user_id,amount').in('expense_id',ee.map(x=>x.id)):Promise.resolve({data:[],error:null}),
   mm.length?supabase.from('profiles').select('id,display_name').in('id',mm.map(x=>x.user_id)):Promise.resolve({data:[],error:null})
  ])
  if(v.error)throw v.error;if(sp.error)throw sp.error;if(pr.error)throw pr.error
  setIdeas(ii);setTasks((t.data||[]) as Task[]);setExpenses(ee);setMembers(mm)
  setVotes((v.data||[]) as Vote[]);setSplits((sp.data||[]) as Split[]);setSettlements((s.data||[]) as Settlement[])
  setProfiles(Object.fromEntries(((pr.data||[]) as Profile[]).map(x=>[x.id,x.display_name])))
 },[tripId])
 useEffect(()=>{void load().catch(e=>setError(err(e)))},[load])
 useEffect(()=>{setTitle('');setNote('');setAmountText('');setAssigned('');setDue('');setError('');setNotice('')},[tab,tripId])
 useEffect(()=>{if(!open)return;const id=window.setInterval(()=>{if(document.visibilityState==='visible'&&!busy)void load().catch(()=>{})},15000);return()=>window.clearInterval(id)},[busy,load,open])
 const name=(id:string)=>id===userId?'Вы':profiles[id]||'Участник '+id.slice(0,6)
 const run=async(fn:()=>Promise<void>,ok:string)=>{
  if(busy)return;setBusy(true);setError('');setNotice('')
  try{await fn();await load();setNotice(ok)}catch(e){setError(err(e))}finally{setBusy(false)}
 }
 const add=()=>void run(async()=>{
  if(!title.trim())throw new Error('Введите название')
  if(tab==='ideas'){
   const {error}=await supabase.from('ideas').insert({trip_id:tripId,title:title.trim(),note:note.trim(),created_by:userId});if(error)throw error
  }else if(tab==='tasks'){
   const {error}=await supabase.from('tasks').insert({trip_id:tripId,title:title.trim(),done:false,created_by:userId,assigned_to:assigned||null,due_at:due?new Date(due+'T12:00:00').toISOString():null});if(error)throw error
  }else{
   const val=number(amountText)
   if(!Number.isFinite(val)||val<=0||val>1e9||cents(val)/100!==val)throw new Error('Укажи сумму с точностью до копейки')
   const {error}=await supabase.from('expenses').insert({trip_id:tripId,title:title.trim(),amount:val,currency,paid_by:userId,created_by:userId});if(error)throw error
  }
  setTitle('');setNote('');setAmountText('');setAssigned('');setDue('')
 },'Сохранено для всей компании')
 const vote=(idea:Idea)=>void run(async()=>{
  const had=votes.some(x=>x.idea_id===idea.id&&x.user_id===userId)
  const {error}=had?await supabase.from('idea_votes').delete().eq('idea_id',idea.id).eq('user_id',userId):await supabase.from('idea_votes').insert({idea_id:idea.id,user_id:userId});if(error)throw error
 },'Голос обновлён')
 const toggle=(task:Task)=>void run(async()=>{const {error}=await supabase.from('tasks').update({done:!task.done}).eq('id',task.id).eq('trip_id',tripId);if(error)throw error},'Задача обновлена')
 const remove=(id:string,kind:Kind)=>{if(!window.confirm('Удалить для всех участников?'))return;void run(async()=>{const {error}=await supabase.from(kind).delete().eq('id',id).eq('trip_id',tripId);if(error)throw error},'Запись удалена')}
 const startSplit=(expense:Expense)=>{
  setEditingExpense(expense.id);setAllocationMode('equal');setSelected(members.map(x=>x.user_id));setAllocationInput({})
 }
 const saveSplit=()=>{
  const e=expenses.find(x=>x.id===editingExpense);if(!e)return
  void run(async()=>{
   const ids=selected.filter(id=>members.some(m=>m.user_id===id))
   if(!ids.length)throw new Error('Выбери хотя бы одного участника')
   const total=cents(Number(e.amount));let allocation:Record<string,number>
   if(allocationMode==='equal')allocation=splitCents(total,ids)
   else if(allocationMode==='amount'){
    allocation=Object.fromEntries(ids.map(id=>[id,cents(number(allocationInput[id]||'0'))]))
    if(Object.values(allocation).some(n=>!Number.isSafeInteger(n)||n<0)||Object.values(allocation).reduce((n,v)=>n+v,0)!==total)throw new Error('Сумма долей должна точно совпадать с расходом')
   }else{
    const values=ids.map(id=>number(allocationInput[id]||'0'))
    if(values.some(n=>!Number.isFinite(n)||n<0)||Math.abs(values.reduce((a,b)=>a+b,0)-100)>0.0001)throw new Error('Проценты должны составлять 100%')
    allocation=Object.fromEntries(ids.map((id,i)=>[id,Math.floor(total*values[i]/100)]))
    let remaining=total-Object.values(allocation).reduce((a,b)=>a+b,0)
    const rank=ids.map((id,i)=>({id,frac:total*values[i]/100-Math.floor(total*values[i]/100)})).sort((a,b)=>b.frac-a.frac)
    for(let i=0;i<remaining;i++)allocation[rank[i%rank.length].id]++
   }
   const p_allocations=ids.map(id=>({user_id:id,amount:(allocation[id]/100).toFixed(2)}))
   const {error}=await supabase.rpc('sbor_split_expense_custom',{p_expense_id:e.id,p_allocations});if(error)throw error
   setEditingExpense(null)
  },'Доли сохранены')
 }
 // Balance is calculated in cents, with reciprocal debts netted and confirmed transfers deducted.
 const debts=useMemo(()=>{
  const net=new Map<string,number>();const add=(a:string,b:string,n:number)=>{
   if(!n||a===b)return;const key=[a,b].sort().join('|');const signed=a<b?n:-n;net.set(key,(net.get(key)||0)+signed)
  }
  for(const e of expenses){if(e.currency!==currency)continue;for(const s of splits.filter(x=>x.expense_id===e.id))add(s.user_id,e.paid_by,cents(Number(s.amount)))}
  for(const s of settlements){if(s.currency!==currency||s.status!=='confirmed')continue;add(s.creditor_id,s.debtor_id,cents(Number(s.amount)))}
  return [...net].flatMap(([key,balance])=>{
   if(balance===0)return []
   const [a,b]=key.split('|');return [{debtor:balance>0?a:b,creditor:balance>0?b:a,amount:Math.abs(balance)/100}]
  })
 },[expenses,splits,settlements,currency])
 const myDebts=debts.filter(x=>x.debtor===userId)
 const myCredits=debts.filter(x=>x.creditor===userId)
 const myDebtSum=myDebts.reduce((sum,x)=>sum+x.amount,0)
 const myCreditSum=myCredits.reduce((sum,x)=>sum+x.amount,0)
 // Pending requests reserve part of the debt until the creditor confirms or rejects them.
 const availableDebts=myDebts.map(d=>({
  ...d,available:Math.max(0,Math.round((d.amount-settlements
   .filter(s=>s.debtor_id===userId&&s.creditor_id===d.creditor&&s.currency===currency&&s.status==='pending')
   .reduce((sum,s)=>sum+Number(s.amount),0))*100)/100)
 })).filter(d=>d.available>0)
 const availableSum=availableDebts.reduce((sum,d)=>sum+d.available,0)

 const sendTransfer=()=>void run(async()=>{
  const n=number(transferAmount)
  if(!Number.isFinite(n)||n<=0||cents(n)/100!==n)throw new Error('Неверная сумма')
  const current=myDebts.find(x=>x.creditor===transferTo)
  const pending=settlements.filter(x=>x.debtor_id===userId&&x.creditor_id===transferTo&&x.status==='pending').reduce((a,b)=>a+Number(b.amount),0)
  if(!current||n>Math.max(0,current.amount-pending)+0.000001)throw new Error('Доступная для возврата сумма меньше указанной. Дождись подтверждения или отклонения отправленного возврата.')
  const {error}=await supabase.rpc('sbor_request_settlement',{p_trip_id:tripId,p_creditor_id:transferTo,p_amount:n});if(error)throw error
  setTransferAmount('');setTransferTo('')
 },'Ожидаем подтверждения получателя')
 const resolveTransfer=(id:string,confirm:boolean)=>void run(async()=>{
  const {error}=await supabase.rpc('sbor_resolve_settlement',{p_settlement_id:id,p_confirm:confirm});if(error)throw error
 },confirm?'Получение подтверждено':'Подтверждение отклонено')
 const items=tab==='ideas'?ideas:tab==='tasks'?tasks:expenses
 return <section style={{marginTop:18}}><div className="card" style={{display:'grid',gap:12}}>
  <button type="button" className="secondary" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>🧩 Планируем вместе {open?'▴':'▾'}</button>
  {open&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:6}}>
    {(['ideas','tasks','expenses'] as const).map(t=><button key={t} type="button" style={{...input,padding:'9px 3px',fontSize:13,background:tab===t?'var(--accent)':'var(--surface2)',color:tab===t?'#092a36':'var(--text)'}} onClick={()=>setTab(t)}>{t==='ideas'?'💡 Идеи':t==='tasks'?'✓ Задачи':'₽ Расходы'}</button>)}
   </div>
   <input style={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder={tab==='ideas'?'Предложить место':tab==='tasks'?'Новая задача':'Новый расход'} maxLength={tab==='tasks'?300:tab==='ideas'?120:200}/>
   {tab==='ideas'&&<textarea style={{...input,minHeight:70}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Описание идеи" maxLength={2000}/>}
   {tab==='tasks'&&<><label className="muted small">Ответственный<select style={input} value={assigned} onChange={e=>setAssigned(e.target.value)}><option value="">Не назначен</option>{members.map(m=><option key={m.user_id} value={m.user_id}>{name(m.user_id)}</option>)}</select></label><label className="muted small">Срок исполнения<input style={input} type="date" value={due} onChange={e=>setDue(e.target.value)}/></label></>}
   {tab==='expenses'&&<label className="muted small">Сумма, {currency}<input style={input} inputMode="decimal" value={amountText} onChange={e=>setAmountText(e.target.value)} placeholder="1000,50"/></label>}
   <button className="primary" disabled={busy||!title.trim()} onClick={add}>{busy?'Подождите…':tab==='ideas'?'Предложить':tab==='tasks'?'Добавить задачу':'Записать расход'}</button>
   <div className="row"><strong>{tab==='ideas'?'Идеи':tab==='tasks'?'Задачи':'Расходы'} ({items.length})</strong><button className="secondary" disabled={busy} onClick={()=>void load().catch(e=>setError(err(e)))}>Обновить</button></div>
   {tab==='ideas'&&ideas.map(idea=><article key={idea.id} style={line}>
    <strong>{idea.title}</strong>{idea.note&&<p className="muted small">{idea.note}</p>}
    <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}><span className="muted small">👍 {votes.filter(v=>v.idea_id===idea.id).length}</span><button className="secondary" disabled={busy} onClick={()=>vote(idea)}>{votes.some(v=>v.idea_id===idea.id&&v.user_id===userId)?'Отменить голос':'Голосовать'}</button>{onAddPlace&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>onAddPlace(idea.title),'Добавлено в маршрут')}>В маршрут</button>}{idea.created_by===userId&&<button className="secondary" disabled={busy} onClick={()=>remove(idea.id,'ideas')}>Удалить</button>}</div>
   </article>)}
   {tab==='tasks'&&tasks.map(t=><article key={t.id} style={line}>
    <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={t.done} disabled={busy} onChange={()=>toggle(t)}/><strong style={{textDecoration:t.done?'line-through':undefined}}>{t.title}</strong></label>
    <span className="muted small">{t.assigned_to?'Ответственный: '+name(t.assigned_to):'Без ответственного'}{t.due_at?' · срок: '+new Date(t.due_at).toLocaleDateString('ru-RU'):''}</span>
    {t.created_by===userId&&<button className="secondary" disabled={busy} onClick={()=>remove(t.id,'tasks')}>Удалить</button>}
   </article>)}
   {tab==='expenses'&&<>
    <strong>Всего: {amount(expenses.filter(e=>e.currency===currency).reduce((n,e)=>n+Number(e.amount),0),currency)}</strong>
    {expenses.map(e=><article key={e.id} style={line}>
     <strong>{e.title} · {amount(Number(e.amount),e.currency)}</strong><span className="muted small">Оплатил: {name(e.paid_by)}</span>
     {splits.filter(x=>x.expense_id===e.id).map(s=><span key={s.user_id} className="muted small">{name(s.user_id)}: {amount(Number(s.amount),e.currency)}</span>)}
     <div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button className="secondary" onClick={()=>startSplit(e)} disabled={busy||!(e.created_by===userId||members.some(m=>m.user_id===userId&&['owner','admin'].includes(m.role)))}>Настроить доли</button>{e.created_by===userId&&<button className="secondary" disabled={busy} onClick={()=>remove(e.id,'expenses')}>Удалить</button>}</div>
     {editingExpense===e.id&&<div style={{display:'grid',gap:8,padding:12,border:'1px solid var(--line)',borderRadius:12}}>
      <strong>Разделить {amount(Number(e.amount),e.currency)}</strong>
      <select style={input} value={allocationMode} onChange={ev=>setAllocationMode(ev.target.value as AllocationMode)}><option value="equal">Поровну</option><option value="amount">По суммам</option><option value="percent">По процентам</option></select>
      {members.map(m=><div key={m.user_id} style={{display:'flex',alignItems:'center',gap:8}}><label style={{display:'flex',alignItems:'center',gap:5,flex:'1 1 45%'}}><input type="checkbox" checked={selected.includes(m.user_id)} onChange={ev=>setSelected(v=>ev.target.checked?[...v,m.user_id]:v.filter(x=>x!==m.user_id))}/>{name(m.user_id)}</label>{allocationMode!=='equal'&&selected.includes(m.user_id)&&<input style={{...input,width:'42%'}} placeholder={allocationMode==='percent'?'%':currency} inputMode="decimal" value={allocationInput[m.user_id]||''} onChange={ev=>setAllocationInput(v=>({...v,[m.user_id]:ev.target.value}))}/>}</div>)}
      <button className="primary" disabled={busy} onClick={saveSplit}>Сохранить доли</button><button className="secondary" onClick={()=>setEditingExpense(null)}>Отмена</button>
     </div>}
    </article>)}
    <div style={{...line,marginTop:6}}><h3>Баланс компании</h3><p className="muted small">Долги рассчитываются с взаимозачётом встречных расходов. Подтверждённые возвраты уменьшают задолженность.</p><strong>Вы должны: {amount(myDebtSum,currency)}</strong><strong>Вам должны: {amount(myCreditSum,currency)}</strong>
     {debts.map(d=><div key={d.debtor+'-'+d.creditor} className="muted small">{name(d.debtor)} → {name(d.creditor)}: {amount(d.amount,currency)}</div>)}
     {myDebts.length>0&&<><strong>Сообщить о возврате</strong>
      {availableSum<=0?<p className="muted small">Все долги уже отправлены на подтверждение. Дождись ответа получателя.</p>:<>
       <p className="muted small">Доступно для нового возврата: {amount(availableSum,currency)}. Суммы ожидающих подтверждения переводов зарезервированы.</p>
       <select style={input} value={transferTo} onChange={e=>{setTransferTo(e.target.value);setTransferAmount('')}}><option value="">Выбери получателя</option>{availableDebts.map(x=><option key={x.creditor} value={x.creditor}>{name(x.creditor)} · {amount(x.available,currency)}</option>)}</select>
       <input style={input} inputMode="decimal" placeholder="Сумма перевода" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)}/>
       <button className="primary" disabled={!transferTo||busy||!Number.isFinite(number(transferAmount))||number(transferAmount)<=0||number(transferAmount)>(availableDebts.find(x=>x.creditor===transferTo)?.available||0)} onClick={sendTransfer}>Отправить на подтверждение</button>
      </>}
     </>}
     <h3>История возвратов</h3>{!settlements.length&&<p className="muted small">Возвратов пока нет</p>}
     {settlements.map(s=><div key={s.id} style={{...line,gap:6}}><strong>{name(s.debtor_id)} → {name(s.creditor_id)} · {amount(Number(s.amount),s.currency)}</strong><span className="muted small">{new Date(s.requested_at).toLocaleDateString('ru-RU')} · {s.status==='pending'?'Ожидает подтверждения':s.status==='confirmed'?'Подтверждено':'Отклонено'}</span>{s.status==='pending'&&s.creditor_id===userId&&<div style={{display:'flex',gap:7}}><button className="primary" disabled={busy} onClick={()=>resolveTransfer(s.id,true)}>Подтвердить получение</button><button className="secondary" disabled={busy} onClick={()=>resolveTransfer(s.id,false)}>Отклонить</button></div>}</div>)}
    </div>
   </>}
   {!items.length&&<p className="muted small">Пока нет записей</p>}
   {error&&<p role="alert" style={{color:'#ff9999',whiteSpace:'pre-wrap'}}>{error}</p>}{notice&&<p role="status" className="muted small">{notice}</p>}
  </>}
 </div></section>
}

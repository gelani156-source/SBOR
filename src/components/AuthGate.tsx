import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import App from '../App';

type Mode = 'login' | 'register' | 'reset' | 'new-password';

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError(err.message);
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (alive) { setError('Не удалось проверить сессию.'); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setMode('new-password');
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (err) throw err;
        setMessage('Ссылка отправлена. Проверь почту.');
      } else if (mode === 'new-password') {
        if (password.length < 8) throw new Error('Пароль — не менее 8 символов.');
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        setMessage('Пароль обновлён.');
        setMode('login');
      } else if (mode === 'register') {
        if (password.length < 8) throw new Error('Пароль — не менее 8 символов.');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: redirectTo, data: { display_name: name.trim() || 'Участник' } }
        });
        if (err) throw err;
        setMessage(data.session ? 'Регистрация выполнена.' : 'Проверь почту для подтверждения регистрации.');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие.');
    } finally { setBusy(false); }
  }

  const shell: React.CSSProperties = { minHeight: '100dvh', background: '#0d1721', color: '#eef7fc', fontFamily: 'system-ui, sans-serif' };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#213547', border: '1px solid #395064', color: '#eef7fc', padding: '14px', borderRadius: 12, fontSize: 16 };
  const link: React.CSSProperties = { background: 'none', border: 0, color: '#64c6df', padding: 0, cursor: 'pointer', fontSize: 13 };

  if (loading) return <div style={{ ...shell, display: 'grid', placeItems: 'center' }}>Загружаем СБОР…</div>;
  if ((session && mode !== 'new-password') || demo) return <div style={shell}>
    <div style={{ maxWidth: 540, margin: 'auto', background: '#192d3c', padding: '10px 15px', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
      <span>{demo ? 'Демонстрационный режим · локальные данные' : `Аккаунт: ${session?.user.email ?? 'Участник'}`}</span>
      <button onClick={async () => { if (demo) setDemo(false); else await supabase.auth.signOut(); }} style={{ background: '#223d4e', border: '1px solid #487085', borderRadius: 9, color: 'white', padding: 8 }}>{demo ? 'Ко входу' : 'Выйти'}</button>
    </div>
    <App />
  </div>;

  return <div style={{ ...shell, display: 'grid', placeItems: 'center', padding: '30px 18px' }}>
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ fontSize: 44, fontWeight: 850, letterSpacing: -2 }}>СБ<span style={{ color: '#64c6df' }}>О</span>Р</div>
      <p style={{ margin: '3px 0 24px', color: '#95abba', fontSize: 13 }}>Собирай компанию. Планируй приключения.</p>
      <div style={{ background: '#182736', border: '1px solid #304456', borderRadius: 22, padding: 22 }}>
        <h1 style={{ fontSize: 23, margin: 0 }}>{mode === 'login' ? 'С возвращением!' : mode === 'register' ? 'Присоединяйся к СБОР' : mode === 'reset' ? 'Восстановление доступа' : 'Новый пароль'}</h1>
        <p style={{ color: '#95abba', fontSize: 13, lineHeight: 1.5 }}>{mode === 'reset' ? 'Отправим ссылку на электронную почту.' : mode === 'new-password' ? 'Укажи новый пароль для аккаунта.' : 'Войди, чтобы планировать путешествия с друзьями.'}</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 19 }}>
          {mode === 'register' && <input aria-label="Имя участника" style={field} value={name} onChange={e => setName(e.target.value)} placeholder="Имя участника" maxLength={80} />}
          {mode !== 'new-password' && <input aria-label="Электронная почта" style={field} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Электронная почта" />}
          {mode !== 'reset' && <input aria-label="Пароль" style={field} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль (от 8 символов)" />}
          {error && <p role="alert" style={{ color: '#ff9f9f', fontSize: 13, margin: 0 }}>{error}</p>}
          {message && <p role="status" style={{ color: '#74d5a7', fontSize: 13, margin: 0 }}>{message}</p>}
          <button disabled={busy} style={{ background: '#64c6df', color: '#082634', border: 0, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 750, opacity: busy ? .6 : 1 }}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти' : mode === 'register' ? 'Зарегистрироваться' : mode === 'reset' ? 'Отправить ссылку' : 'Сохранить пароль'}</button>
        </form>
        <div style={{ display: 'flex', gap: 17, flexWrap: 'wrap', marginTop: 18 }}>
          {mode !== 'new-password' && <button style={link} onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setMessage(''); setError(''); }}>{mode === 'register' ? 'Уже есть аккаунт?' : 'Создать аккаунт'}</button>}
          {mode !== 'new-password' && <button style={{ ...link, color: '#a7bcc9' }} onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setMessage(''); setError(''); }}>{mode === 'reset' ? 'Назад ко входу' : 'Забыли пароль?'}</button>}
        </div>
      </div>
      <button onClick={() => setDemo(true)} style={{ marginTop: 16, width: '100%', padding: 14, borderRadius: 13, border: '1px solid #304456', color: '#e7f7ff', background: 'transparent' }}>Посмотреть демоверсию →</button>
      <p style={{ marginTop: 18, textAlign: 'center', fontSize: 11, color: '#748b99' }}>Бета-версия · поездки пока хранятся локально</p>
    </div>
  </div>;
}

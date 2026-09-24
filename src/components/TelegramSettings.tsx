import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type State = { connected: boolean; paired: boolean; botUsername: string | null; mode: 'app' | 'telegram' };
const empty: State = { connected: false, paired: false, botUsername: null, mode: 'app' };

export default function TelegramSettings({ workspaceId }: { workspaceId?: string }) {
  const [state, setState] = useState<State>(empty);
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const call = useCallback(async (method: 'GET' | 'POST' | 'DELETE', payload?: Record<string, unknown>) => {
    const { data } = await supabase!.auth.getSession();
    if (!data.session) throw new Error('กรุณาเข้าสู่ระบบใหม่');
    const response = await fetch(`/api/telegram/settings?workspaceId=${encodeURIComponent(workspaceId || '')}`, {
      method, headers: { authorization: `Bearer ${data.session.access_token}`, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      body: method === 'POST' ? JSON.stringify({ workspaceId, ...payload }) : undefined,
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error === 'telegram_server_not_configured' ? 'เซิร์ฟเวอร์ Telegram ยังไม่ได้ตั้งค่า' : result.error || 'เชื่อมต่อ Telegram ไม่สำเร็จ');
    return result;
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    if (!workspaceId || !supabase) return;
    try { setState(await call('GET')); } catch (error) { setMessage(error instanceof Error ? error.message : 'โหลดสถานะไม่สำเร็จ'); }
  }, [call, workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!state.connected || state.paired || !code) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [state.connected, state.paired, code, refresh]);

  async function run(action: 'connect' | 'pair' | 'mode' | 'delete', mode?: 'app' | 'telegram') {
    setBusy(true); setMessage('');
    try {
      if (action === 'delete') {
        if (!window.confirm('ยกเลิกการเชื่อมต่อ Telegram ของ workspace นี้?')) return;
        await call('DELETE'); setState(empty); setCode(''); setToken('');
      } else {
        const result = await call('POST', action === 'connect' ? { action, botToken: token.trim() } : action === 'mode' ? { action, mode } : { action });
        if (result.pairingCode) setCode(result.pairingCode);
        if (action === 'connect') setToken('');
        await refresh();
      }
      setMessage(action === 'mode' ? 'บันทึกช่องทางตอบแล้ว' : action === 'delete' ? 'ยกเลิกการเชื่อมต่อแล้ว' : action === 'connect' ? 'เชื่อมบอตแล้ว กรุณาจับคู่แชต' : 'สร้างรหัสจับคู่ใหม่แล้ว');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return <section className="telegram-settings" aria-label="ตั้งค่า Telegram">
    <div className="telegram-settings-head"><div><p className="telegram-eyebrow">CHANNEL INTEGRATION</p><h2>ตอบแชตผ่าน Telegram</h2><p>บอตของแต่ละ workspace แยกกัน ข้อความตอบจากแอพและ Telegram จะอยู่ในบทสนทนาเดียวกัน</p></div><span className="telegram-status">{state.paired ? '● พร้อมใช้งาน' : state.connected ? '● รอจับคู่' : '○ ยังไม่เชื่อมต่อ'}</span></div>
    {!workspaceId ? <p>เลือก workspace จริงก่อนตั้งค่า Telegram</p> : <>
      <div className="telegram-step"><strong>1. เชื่อมบอตของคุณ</strong><p>เปิด @BotFather ใน Telegram สร้างบอตด้วย /newbot แล้วนำ token มาใส่ที่นี่ Token เก็บเข้ารหัสบนเซิร์ฟเวอร์ ไม่ส่งไปเว็บลูกค้า</p><div className="telegram-row"><input aria-label="BotFather token" type="password" autoComplete="off" placeholder={state.connected ? 'ใส่ token ใหม่เพื่อเปลี่ยนบอต' : 'BotFather token'} value={token} onChange={(event) => setToken(event.target.value)} /><button type="button" disabled={busy || !token.trim()} onClick={() => void run('connect')}>{state.connected ? 'เปลี่ยนบอต' : 'เชื่อมบอต'}</button></div>{state.botUsername && <p>เชื่อมต่อกับ <a href={`https://t.me/${state.botUsername}`} target="_blank" rel="noreferrer">@{state.botUsername}</a></p>}</div>
      {state.connected && <div className="telegram-step"><strong>2. จับคู่แชตทีมงาน</strong><p>ใช้บัญชี Telegram ของทีมเปิดบอตแล้วส่งคำสั่งนี้ในแชตส่วนตัว รหัสใช้ได้ 15 นาที</p>{code ? <div className="telegram-code"><code>/start {code}</code><a href={`https://t.me/${state.botUsername}?start=${code}`} target="_blank" rel="noreferrer">เปิดบอตเพื่อจับคู่ ↗</a></div> : null}<div className="telegram-row"><button type="button" disabled={busy} onClick={() => void run('pair')}>สร้างรหัสจับคู่ใหม่</button><button type="button" disabled={busy} onClick={() => void refresh()}>ตรวจสถานะ</button></div>{state.paired && <p className="telegram-success">จับคู่สำเร็จ ข้อความลูกค้าใหม่จะส่งไป Telegram เมื่อเปิดโหมด Telegram</p>}</div>}
      {state.connected && <div className="telegram-step"><strong>3. เลือกช่องทางแจ้งทีมงาน</strong><p>ตอบในแอพได้เสมอ การเลือก Telegram จะส่งข้อความลูกค้าใหม่ให้บอตด้วย แล้วกด Reply ที่ข้อความนั้นเพื่อตอบกลับลูกค้าในบทสนทนาเดิม</p><div className="telegram-row"><button className={state.mode === 'app' ? 'selected' : ''} type="button" disabled={busy} onClick={() => void run('mode', 'app')}>ตอบในแอพ</button><button className={state.mode === 'telegram' ? 'selected' : ''} type="button" disabled={busy || !state.paired} onClick={() => void run('mode', 'telegram')}>แอพ + Telegram</button></div></div>}
      {state.connected && <button className="telegram-disconnect" type="button" disabled={busy} onClick={() => void run('delete')}>ยกเลิกการเชื่อมต่อบอต</button>}
      {message && <p role="status" className="telegram-feedback">{message}</p>}
    </>}
  </section>;
}

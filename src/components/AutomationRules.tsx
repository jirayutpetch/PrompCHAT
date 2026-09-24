'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Plus, Save, Trash2, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type QuickReply = { id: string; label: string; reply_text: string; is_active: boolean; sort_order: number };
type BotTrigger = { id: string; keywords: string[]; reply_text: string; match_type: 'contains' | 'exact'; is_active: boolean; sort_order: number };
const sampleReplies: QuickReply[] = [
  { id: 'local-r1', label: 'ขอรายละเอียดเพิ่มเติม', reply_text: 'ได้เลยค่ะ ขอทราบรายละเอียดเพิ่มเติมเพื่อให้ทีมช่วยดูแลได้ตรงจุดนะคะ', is_active: true, sort_order: 0 },
  { id: 'local-r2', label: 'ขอบคุณที่ติดต่อเรา', reply_text: 'ขอบคุณที่ติดต่อเรานะคะ ทีมงานกำลังตรวจสอบและจะรีบตอบกลับค่ะ', is_active: true, sort_order: 1 },
];
const sampleTriggers: BotTrigger[] = [
  { id: 'local-t1', keywords: ['ราคา', 'ราคาเท่าไหร่', 'ค่าบริการ'], reply_text: 'แจ้งสินค้าหรือบริการที่สนใจได้เลยค่ะ ทีมงานจะส่งรายละเอียดราคาให้', match_type: 'contains', is_active: true, sort_order: 0 },
];

export default function AutomationRules({ workspaceId, onQuickRepliesChange }: { workspaceId?: string; onQuickRepliesChange: (items: string[]) => void }) {
  const [replies, setReplies] = useState<QuickReply[]>(() => workspaceId ? [] : sampleReplies);
  const [triggers, setTriggers] = useState<BotTrigger[]>(() => workspaceId ? [] : sampleTriggers);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    const load = async () => {
      if (workspaceId && supabase) {
        setReplies([]); setTriggers([]); setNotice('กำลังโหลดชุดคำตอบ…');
        const [quickResult, triggerResult] = await Promise.all([
          supabase.from('canned_responses').select('id,shortcut,body').eq('workspace_id', workspaceId).order('created_at'),
          supabase.from('bot_triggers').select('id,keywords,reply_text,match_type,is_active,sort_order').eq('workspace_id', workspaceId).order('sort_order'),
        ]);
        if (!current) return;
        if (quickResult.error || triggerResult.error) { setNotice('โหลดกฎอัตโนมัติไม่สำเร็จ กรุณาลองใหม่'); return; }
        const nextReplies: QuickReply[] = (quickResult.data || []).map((item, i) => ({ id: item.id, label: item.shortcut, reply_text: item.body, is_active: true, sort_order: i }));
        const nextTriggers = (triggerResult.data || []) as BotTrigger[];
        setReplies(nextReplies); setTriggers(nextTriggers);
        onQuickRepliesChange(nextReplies.filter((item) => item.is_active).map((item) => item.reply_text));
        setNotice('');
      } else {
        try {
          const saved = JSON.parse(localStorage.getItem('promptchat-automation-v1') || 'null') as { replies?: QuickReply[]; triggers?: BotTrigger[] } | null;
          if (saved?.replies?.length) setReplies(saved.replies);
          if (saved?.triggers?.length) setTriggers(saved.triggers);
          onQuickRepliesChange((saved?.replies || sampleReplies).filter((item) => item.is_active).map((item) => item.reply_text));
        } catch { onQuickRepliesChange(sampleReplies.map((item) => item.reply_text)); }
      }
    };
    void load();
    return () => { current = false; };
  }, [workspaceId, onQuickRepliesChange]);

  function exportSet() {
    const payload = { format: 'prompchat-automation', version: 1, quickReplies: replies.map(({ label, reply_text, is_active }) => ({ label, reply_text, is_active })), keywordRules: triggers.map(({ keywords, reply_text, match_type, is_active }) => ({ keywords, reply_text, match_type, is_active })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'prompchat-automation.json'; link.click(); URL.revokeObjectURL(url);
  }
  async function importSet(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { format?: string; quickReplies?: Array<{ label?: string; reply_text?: string; is_active?: boolean }>; keywordRules?: Array<{ keywords?: string[] | string; reply_text?: string; match_type?: string; is_active?: boolean }> };
      if (!Array.isArray(data.quickReplies) || !Array.isArray(data.keywordRules)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
      const nextReplies: QuickReply[] = data.quickReplies.slice(0, 100).map((item, i) => ({ id: crypto.randomUUID(), label: String(item.label || item.reply_text || '').trim().slice(0, 80), reply_text: String(item.reply_text || '').trim().slice(0, 2000), is_active: item.is_active !== false, sort_order: i })).filter((item) => item.label && item.reply_text);
      const nextTriggers: BotTrigger[] = data.keywordRules.slice(0, 100).map((item, i) => ({ id: crypto.randomUUID(), keywords: (Array.isArray(item.keywords) ? item.keywords : String(item.keywords || '').split(',')).map((word) => String(word).trim().slice(0, 80)).filter(Boolean).slice(0, 20), reply_text: String(item.reply_text || '').trim().slice(0, 2000), match_type: item.match_type === 'exact' ? 'exact' as const : 'contains' as const, is_active: item.is_active !== false, sort_order: i })).filter((item) => item.keywords.length && item.reply_text);
      setReplies(nextReplies); setTriggers(nextTriggers); onQuickRepliesChange(nextReplies.filter((item) => item.is_active).map((item) => item.reply_text)); setNotice('นำเข้าชุดคำตอบแล้ว อย่าลืมกดบันทึก');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ'); }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function save() {
    setBusy(true); setNotice('');
    try {
      if (workspaceId && supabase) {
        const replyRows = replies.filter((item) => item.label.trim() && item.reply_text.trim()).map((item, index) => ({ ...item, id: item.id.startsWith('local-') ? crypto.randomUUID() : item.id, workspace_id: workspaceId, sort_order: index }));
        const triggerRows = triggers.filter((item) => item.keywords.length && item.reply_text.trim()).map((item, index) => ({ ...item, id: item.id.startsWith('local-') ? crypto.randomUUID() : item.id, workspace_id: workspaceId, sort_order: index }));
        const storedQuickReplies = replyRows.map((item) => ({ id: item.id, workspace_id: workspaceId, shortcut: item.label, body: item.reply_text }));
        const [replyUpsert, triggerUpsert] = await Promise.all([
          storedQuickReplies.length ? supabase.from('canned_responses').upsert(storedQuickReplies, { onConflict: 'id' }).select('id') : Promise.resolve({ error: null, data: [] as { id: string }[] }),
          triggerRows.length ? supabase.from('bot_triggers').upsert(triggerRows).select('id') : Promise.resolve({ error: null, data: [] as { id: string }[] }),
        ]);
        if (replyUpsert.error) throw replyUpsert.error;
        if (triggerUpsert.error) throw triggerUpsert.error;
        const keepReplyIds = (replyUpsert.data || []).map((item) => item.id);
        const keepTriggerIds = (triggerUpsert.data || []).map((item) => item.id);
        const [deleteReplies, deleteTriggers] = await Promise.all([
          keepReplyIds.length ? supabase.from('canned_responses').delete().eq('workspace_id', workspaceId).not('id', 'in', `(${keepReplyIds.join(',')})`) : supabase.from('canned_responses').delete().eq('workspace_id', workspaceId),
          keepTriggerIds.length ? supabase.from('bot_triggers').delete().eq('workspace_id', workspaceId).not('id', 'in', `(${keepTriggerIds.join(',')})`) : supabase.from('bot_triggers').delete().eq('workspace_id', workspaceId),
        ]);
        if (deleteReplies.error) throw deleteReplies.error;
        if (deleteTriggers.error) throw deleteTriggers.error;
        setReplies(replyRows as QuickReply[]); setTriggers(triggerRows as BotTrigger[]);
      } else localStorage.setItem('promptchat-automation-v1', JSON.stringify({ replies, triggers }));
      onQuickRepliesChange(replies.filter((item) => item.is_active).map((item) => item.reply_text)); setNotice('บันทึกชุดคำตอบและ keyword แล้ว');
    } catch (error) { setNotice(error instanceof Error ? `บันทึกไม่สำเร็จ: ${error.message}` : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <section className="automation-panel panel-card">
    <div className="automation-heading"><div><span className="settings-icon purple"><Zap size={18}/></span><div><h3>ตอบไวและตอบอัตโนมัติ</h3><p>จัดการ quick replies และคำตอบตาม keyword จากที่เดียว</p></div></div><div className="automation-actions"><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importSet(event.target.files?.[0])}/><button className="outline-button compact" onClick={() => fileRef.current?.click()}><FileUp size={14}/>นำเข้าชุด</button><button className="outline-button compact" onClick={exportSet}><Download size={14}/>ส่งออก</button></div></div>
    <div className="automation-columns"><div><div className="automation-section-title"><div><strong>Quick replies</strong><small>คำตอบสำเร็จรูปในกล่องข้อความ</small></div><button className="outline-button compact" onClick={() => setReplies((items) => [...items, { id: crypto.randomUUID(), label: 'คำตอบใหม่', reply_text: '', is_active: true, sort_order: items.length }])}><Plus size={14}/>เพิ่มคำตอบ</button></div>{replies.map((item, index) => <div className="automation-row" key={item.id}><input aria-label="ชื่อปุ่มคำตอบลัด" value={item.label} onChange={(event) => setReplies((items) => items.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))}/><textarea aria-label="ข้อความคำตอบลัด" placeholder="ข้อความที่จะส่งให้ลูกค้า" value={item.reply_text} onChange={(event) => setReplies((items) => items.map((entry, i) => i === index ? { ...entry, reply_text: event.target.value } : entry))}/><button className="automation-delete" aria-label="ลบคำตอบ" onClick={() => setReplies((items) => items.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>)}</div>
      <div><div className="automation-section-title"><div><strong>Keyword auto replies</strong><small>ลูกค้าพิมพ์ตรงเงื่อนไขแล้วบอทตอบให้</small></div><button className="outline-button compact" onClick={() => setTriggers((items) => [...items, { id: crypto.randomUUID(), keywords: [], reply_text: '', match_type: 'contains', is_active: true, sort_order: items.length }])}><Plus size={14}/>เพิ่มกฎ</button></div>{triggers.map((item, index) => <div className="trigger-row" key={item.id}><div className="trigger-controls"><input aria-label="คีย์เวิร์ด คั่นด้วยจุลภาค" placeholder="ราคา, ค่าจัดส่ง" value={item.keywords.join(', ')} onChange={(event) => setTriggers((items) => items.map((entry, i) => i === index ? { ...entry, keywords: event.target.value.split(',').map((word) => word.trim()).filter(Boolean) } : entry))}/><select aria-label="รูปแบบการจับ keyword" value={item.match_type} onChange={(event) => setTriggers((items) => items.map((entry, i) => i === index ? { ...entry, match_type: event.target.value as BotTrigger['match_type'] } : entry))}><option value="contains">มีคำนี้</option><option value="exact">ตรงทั้งข้อความ</option></select><label><input type="checkbox" checked={item.is_active} onChange={(event) => setTriggers((items) => items.map((entry, i) => i === index ? { ...entry, is_active: event.target.checked } : entry))}/>เปิด</label><button className="automation-delete" aria-label="ลบกฎ" onClick={() => setTriggers((items) => items.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div><textarea placeholder="คำตอบอัตโนมัติ" value={item.reply_text} onChange={(event) => setTriggers((items) => items.map((entry, i) => i === index ? { ...entry, reply_text: event.target.value } : entry))}/></div>)}</div></div>
    <div className="automation-footer"><span>{notice || (workspaceId ? 'แก้ไขได้ทุกเมื่อ · ลูกค้าได้รับเฉพาะกฎที่เปิดใช้งาน' : 'ตัวอย่างนี้บันทึกไว้ในเบราว์เซอร์เครื่องนี้')}</span><button className="primary-button small" onClick={() => void save()} disabled={busy}><Save size={15}/>{busy ? 'กำลังบันทึก…' : 'บันทึกชุดคำตอบ'}</button></div>
  </section>;
}

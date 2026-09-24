'use client';

import { Check, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';

export type ChatSettings = {
  brand_name: string;
  welcome_message: string;
  offline_message: string;
  color_primary: string;
  bot_enabled: boolean;
  bot_handoff_keyword: string;
  agent_icon: string;
  visitor_icon: string;
};

export const defaultChatSettings: ChatSettings = {
  brand_name: 'PrompCHAT',
  welcome_message: 'สวัสดีค่ะ มีอะไรให้เราช่วยไหมคะ?',
  offline_message: 'ตอนนี้ทีมงานไม่อยู่ ฝากข้อความไว้ได้เลยค่ะ',
  color_primary: '#35C2F0',
  bot_enabled: true,
  bot_handoff_keyword: 'คุยกับแอดมิน',
  agent_icon: 'PA',
  visitor_icon: '👤',
};

export default function WorkspaceSettings({ value, onChange, onSave, busy }: {
  value: ChatSettings;
  onChange: (value: ChatSettings) => void;
  onSave: () => void;
  busy: boolean;
}) {
  const update = <K extends keyof ChatSettings>(key: K, next: ChatSettings[K]) => onChange({ ...value, [key]: next });
  const icons = ['PA', '👤', '🐺', '🤖', '💬', '⚡'];
  return <div className="content-page narrow-content">
    <div className="page-heading"><div><div className="breadcrumb">จัดการระบบ / ตั้งค่า</div><h1>ตั้งค่า workspace</h1><p>ปรับแบรนด์ ข้อความ และไอคอนของแชตจริง</p></div><Button className="primary-button small" onClick={onSave} disabled={busy}><Check size={16} /> {busy ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</Button></div>
    <div className="settings-grid">
      <section className="settings-card panel-card"><div className="settings-card-heading"><div className="settings-icon blue"><Sparkles size={18} /></div><div><h3>แบรนด์และหน้าตา</h3><p>สิ่งที่ลูกค้าจะเห็นบนเว็บไซต์</p></div></div>
        <label>ชื่อแบรนด์<input value={value.brand_name} maxLength={80} onChange={(event) => update('brand_name', event.target.value)} /></label>
        <label>ข้อความต้อนรับ<textarea value={value.welcome_message} maxLength={1000} onChange={(event) => update('welcome_message', event.target.value)} /></label>
        <label>สีหลักของวิดเจ็ต<input type="color" value={value.color_primary} onChange={(event) => update('color_primary', event.target.value)} /></label>
        <label>ไอคอนผู้ตอบ<div className="icon-choice-list">{icons.map((icon) => <button type="button" key={icon} className={value.agent_icon === icon ? 'active' : ''} onClick={() => update('agent_icon', icon)} aria-label={`ไอคอนผู้ตอบ ${icon}`}>{icon}</button>)}</div></label>
        <label>ไอคอนลูกค้า<div className="icon-choice-list">{icons.map((icon) => <button type="button" key={icon} className={value.visitor_icon === icon ? 'active' : ''} onClick={() => update('visitor_icon', icon)} aria-label={`ไอคอนลูกค้า ${icon}`}>{icon}</button>)}</div></label>
      </section>
      <section className="settings-card panel-card"><div className="settings-card-heading"><div className="settings-icon purple"><Sparkles size={18} /></div><div><h3>ผู้ช่วยอัตโนมัติ</h3><p>ข้อความและการส่งต่อทีมงาน</p></div></div>
        <label className="switch-row"><span>เปิดใช้งาน PrompCHAT bot</span><input type="checkbox" checked={value.bot_enabled} onChange={(event) => update('bot_enabled', event.target.checked)} /></label>
        <label>คีย์เวิร์ดส่งต่อให้แอดมิน<input value={value.bot_handoff_keyword} maxLength={80} onChange={(event) => update('bot_handoff_keyword', event.target.value)} /></label>
        <label>คำตอบนอกเวลาทำการ<textarea value={value.offline_message} maxLength={1000} onChange={(event) => update('offline_message', event.target.value)} /></label>
      </section>
    </div>
  </div>;
}

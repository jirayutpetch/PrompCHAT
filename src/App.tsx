'use client';

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clipboard,
  Code2,
  Download,
  FileText,
  Headphones,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  PanelRight,
  Plus,
  PlugZap,
  Search,
  Send,
  Settings,
  Smile,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { ScrollArea } from '../components/ui/scroll-area';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import logoImage from './assets/images/prompchat-logo.png';
import avatarImage from './assets/images/prompchat-avatar.png';
import laptopImage from './assets/images/prompchat-laptop.png';
import { formatBytes, optimizeUpload, type OptimizedUpload } from './services/mediaCompression';
import { openPreviewAttachment, savePreviewAttachment } from './services/previewAttachments';
import { supabase } from '../lib/supabase';
import WorkspaceSettings, { defaultChatSettings, type ChatSettings } from './components/WorkspaceSettings';
import { createWorkspace, downloadRemoteAttachment, getOrCreateVisitorConversation, getWidgetClient, initializeWidget, listWorkspaces, loadWorkspaceChat, sendRemoteAgentAttachment, sendRemoteAgentMessage, sendRemoteVisitorAttachment, sendRemoteVisitorMessage, subscribeVisitorConversation, subscribeWorkspaceChat, type RemoteWorkspace } from './services/supabaseChat';

const logo = logoImage.src;
const avatar = avatarImage.src;
const laptop = laptopImage.src;

type AuthMode = 'login' | 'signup';
type View = 'inbox' | 'overview' | 'visitors' | 'settings' | 'install' | 'api';
type Filter = 'ทั้งหมด' | 'รอตอบ' | 'กำลังตอบ' | 'เสร็จสิ้น';

type Message = { id: number | string; sender: 'visitor' | 'agent' | 'bot'; text: string; time: string; attachmentId?: string; attachmentName?: string; remoteAttachmentPath?: string };
type Conversation = {
  id: number | string; name: string; initials: string; avatarColor: string; channel: string;
  status: 'รอตอบ' | 'กำลังตอบ' | 'เสร็จสิ้น'; time: string; preview: string; unread: number;
  email: string; page: string; messages: Message[]; visitorSession?: string;
};

const seedConversations: Conversation[] = [];

const quickReplies = ['ขอบคุณที่ติดต่อเรา', 'ขอรายละเอียดเว็บไซต์', 'ส่งคู่มือติดตั้งให้เลย'];
const formatNow = () => new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date());
const isLocalPreview = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const embedScriptCode = (workspace?: RemoteWorkspace) => `<script\n  src="${window.location.origin}/widget.js"\n  data-prompchat-workspace="${workspace?.embed_key || 'YOUR_WORKSPACE_KEY'}"\n  ${workspace ? `data-prompchat-domain="${workspace.domain}"\n  ` : ''}async\n></script>`;

const emptyConversation: Conversation = { id: 'empty', name: 'ยังไม่มีบทสนทนา', initials: '—', avatarColor: '#7d8f99', channel: '', status: 'รอตอบ', time: '', preview: '', unread: 0, email: '', page: '/', messages: [] };

function mapRemoteChat(data: Awaited<ReturnType<typeof loadWorkspaceChat>>): Conversation[] {
  return data.conversations.map((row) => {
    const visitor = data.visitors.find((item) => item.id === row.visitor_id);
    const messages: Message[] = data.messages.filter((item) => item.conversation_id === row.id).map((item) => ({ id: item.id, sender: item.sender_type, text: item.body || (item.attachment_name ? `📎 ${item.attachment_name}` : ''), time: new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at)), attachmentName: item.attachment_name || undefined, remoteAttachmentPath: item.attachment_url || undefined }));
    const last = messages[messages.length - 1];
    const name = visitor?.name || 'ผู้เยี่ยมชมเว็บไซต์';
    return { id: row.id, name, initials: name.slice(0, 2), avatarColor: '#42b99b', channel: row.site_url ? new URL(row.site_url).hostname : '', status: row.status === 'closed' ? 'เสร็จสิ้น' : row.status === 'pending' ? 'รอตอบ' : 'กำลังตอบ', time: last?.time || '', preview: last?.text || 'เริ่มบทสนทนาแล้ว', unread: row.status === 'pending' ? 1 : 0, email: visitor?.email || 'ยังไม่ได้ระบุ', page: row.site_url || '/', messages };
  });
}

function saveVisitorMessage(text: string, sender: Message['sender'] = 'visitor', attachment?: Pick<Message, 'attachmentId' | 'attachmentName'>) {
  const session = localStorage.getItem('promptchat-visitor-session') || crypto.randomUUID();
  localStorage.setItem('promptchat-visitor-session', session);
  const existing = JSON.parse(localStorage.getItem('promptchat-conversations-v2') || 'null') as Conversation[] | null;
  const list = existing || seedConversations;
  const current = list.find((item) => item.visitorSession === session);
  const message: Message = { id: Date.now() + Math.random(), sender, text, time: formatNow(), ...attachment };
  const updated: Conversation[] = current
    ? list.map((item) => item.id === current.id ? { ...item, status: sender === 'visitor' ? 'รอตอบ' : item.status, unread: sender === 'visitor' ? item.unread + 1 : item.unread, preview: text, time: message.time, messages: [...item.messages, message] } : item)
    : [{ id: Date.now(), visitorSession: session, name: 'ผู้เยี่ยมชมเว็บไซต์', initials: 'ลูก', avatarColor: '#42b99b', channel: window.location.host, status: 'รอตอบ', time: message.time, preview: text, unread: 1, email: 'ยังไม่ได้ระบุ', page: document.referrer || '/', messages: [message] }, ...list];
  localStorage.setItem('promptchat-conversations-v2', JSON.stringify(updated));
  return updated.find((item) => item.visitorSession === session)!;
}

export default function App() {
  const [session, setSession] = useState(false);
  const [isWidget, setIsWidget] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const widgetRoute = new URLSearchParams(window.location.search).get('widget') === '1';
    setIsWidget(widgetRoute);
    if (widgetRoute || isLocalPreview()) { setSession(window.localStorage.getItem('promptchat-session') === 'active'); setReady(true); return; }
    if (!supabase) { setReady(true); return; }
    void supabase.auth.getSession().then(({ data }) => { setSession(!!data.session); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(!!nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  if (isWidget) return <EmbeddedWidget />;
  return session ? (isLocalPreview() ? <Workspace onLogout={() => { localStorage.removeItem('promptchat-session'); setSession(false); }} /> : <WorkspaceGate onLogout={() => { void supabase?.auth.signOut(); setSession(false); }} />) : <AuthScreen onAuthenticated={() => { if (isLocalPreview()) localStorage.setItem('promptchat-session', 'active'); setSession(true); }} />;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email || !password || (mode === 'signup' && !name)) { setError(mode === 'signup' ? 'กรอกชื่อ อีเมล และรหัสผ่านให้ครบก่อนเริ่มใช้งาน' : 'กรอก ID และรหัสผ่านเพื่อเข้าสู่ระบบ'); return; }
    if (isLocalPreview()) { if (mode === 'login' && (email !== 'root' || password !== 'root')) { setError('Local preview ใช้ ID root และ Password root'); return; } setError(''); onAuthenticated(); return; }
    if (!supabase) { setError('ยังไม่ได้ตั้งค่า Supabase สำหรับการสมัครสมาชิก กรุณาใส่ URL และ anon key ใน Vercel'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        const { data, error: signupError } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
        if (signupError) throw signupError;
        if (data.session) onAuthenticated();
        else setNotice('สมัครแล้ว กรุณายืนยันอีเมล จากนั้นกลับมาเข้าสู่ระบบ');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        onAuthenticated();
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'เข้าสู่ระบบไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function forgotPassword() { if (!supabase || isLocalPreview()) { setNotice('Local preview ไม่ใช้การรีเซ็ตรหัสผ่าน'); return; } if (!email) { setError('กรอกอีเมลก่อนขอลิงก์ตั้งรหัสผ่านใหม่'); return; } const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` }); if (resetError) setError(resetError.message); else setNotice('ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว'); }
  async function googleLogin() { if (!supabase || isLocalPreview()) { setNotice('Google login ใช้ได้เมื่อเชื่อม Supabase และเปิด Google provider'); return; } const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (oauthError) setError(oauthError.message); }
  return <motion.main className="auth-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .45 }}>
    <section className="auth-visual">
      <div className="visual-glow visual-glow-one" /><div className="visual-glow visual-glow-two" />
      <div className="auth-brand"><img src={logo} alt="PrompCHAT" /><span>PrompCHAT</span></div>
      <div className="visual-copy"><div className="eyebrow"><span className="status-dot" /> LIVE CHAT PLATFORM</div><h1>คุยกับลูกค้า<br /><em>ได้ทันที</em> บนเว็บไซต์</h1><p>แชตสดสำหรับเว็บไซต์ที่ช่วยให้ทีมของคุณตอบไวขึ้น ดูแลลูกค้าเป็นระบบ และไม่พลาดทุกโอกาสสำคัญ</p></div>
      <div className="visual-art-wrap"><img className="visual-art" src={laptop} alt="PrompCHAT live chat mascot" /><div className="floating-note note-one"><span className="note-icon"><MessageCircle size={16} /></span><div><strong>ข้อความใหม่</strong><small>รับแชตจากเว็บของคุณแบบสด</small></div></div><div className="floating-note note-two"><span className="note-icon blue"><Zap size={15} /></span><div><strong>ตอบกลับเร็วขึ้น</strong><small>ด้วยคำตอบลัดของทีม</small></div></div></div>
      <div className="visual-footer"><span><Check size={15} /> ทดลองใช้งานได้ทันที</span><span><Check size={15} /> ติดตั้งด้วยโค้ดเดียว</span><span><Check size={15} /> ออกแบบตามแบรนด์คุณ</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner">
      <div className="mobile-brand"><img src={logo} alt="PrompCHAT" /><span>PrompCHAT</span></div>
      <div className="auth-heading"><div className="auth-icon"><Sparkles size={19} /></div><div><span className="small-label">ยินดีต้อนรับ</span><h2>{mode === 'signup' ? 'เริ่มต้นดูแลลูกค้า' : 'กลับมาเจอกันอีกครั้ง'}</h2></div></div>
      <p className="auth-subtitle">{mode === 'signup' ? 'สร้าง workspace ของคุณ แล้วเริ่มคุยกับลูกค้าได้เลย' : 'เข้าสู่ workspace เพื่อดูข้อความและตอบลูกค้าของคุณ'}</p>
      <Tabs value={mode} onValueChange={(value) => { const nextMode = value as AuthMode; setMode(nextMode); setError(''); setNotice(''); if (nextMode === 'login' && isLocalPreview()) { setEmail('root'); setPassword('root'); } }} className="auth-tabs">
        <TabsList className="auth-tabs-list">
          <TabsTrigger value="signup">สมัครใช้งาน</TabsTrigger>
          <TabsTrigger value="login">เข้าสู่ระบบ</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === 'login' && isLocalPreview() && <div className="demo-credential-hint"><Sparkles size={13} /> Local preview: <strong>root</strong> / <strong>root</strong></div>}
      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && <label>ชื่อของคุณ<input value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น คุณแพรว" autoComplete="name" /></label>}
        <label>{mode === 'login' && isLocalPreview() ? 'ID สำหรับ local preview' : 'อีเมลธุรกิจ'}<input type={mode === 'login' && isLocalPreview() ? 'text' : 'email'} value={email} onChange={(event) => setEmail(event.target.value)} placeholder={mode === 'login' && isLocalPreview() ? 'root' : 'you@company.com'} autoComplete={mode === 'login' ? 'username' : 'email'} /></label>
        <label>รหัสผ่าน<div className="input-with-hint"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' && isLocalPreview() ? 'root' : 'อย่างน้อย 8 ตัวอักษร'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /><span>•••</span></div></label>
        {mode === 'login' && <div className="form-row"><label className="check-row"><input type="checkbox" /> จดจำฉัน</label><button type="button" className="text-link" onClick={() => void forgotPassword()}>ลืมรหัสผ่าน?</button></div>}
        {error && <div className="form-error">{error}</div>}{notice && <div className="form-notice">{notice}</div>}
        <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'กำลังดำเนินการ...' : mode === 'signup' ? isLocalPreview() ? 'สร้าง workspace ของฉัน' : 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}<span>→</span></button>
      </form>
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && <><div className="auth-divider"><span>หรือ</span></div><button className="social-button" type="button" onClick={() => void googleLogin()}><span className="google-mark">G</span> ดำเนินการต่อด้วย Google</button></>}<div className="auth-security"><span className="security-lock">⌁</span> เข้าสู่ระบบผ่าน Supabase Auth</div>
    </div></section>
  </motion.main>;
}

function WorkspaceGate({ onLogout }: { onLogout: () => void }) {
  const [workspaces, setWorkspaces] = useState<RemoteWorkspace[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void listWorkspaces().then((items) => { setWorkspaces(items); if (items.length === 1) setSelectedId(items[0].id); }).catch((failure) => setError(failure instanceof Error ? failure.message : 'โหลด workspace ไม่สำเร็จ')); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''); if (!name.trim() || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(normalized)) { setError('กรอกชื่อแบรนด์และโดเมน เช่น myshop.com'); return; } setBusy(true); setError(''); try { const created = await createWorkspace(name.trim(), normalized); setWorkspaces((items) => [...(items || []), created]); setSelectedId(created.id); } catch (failure) { setError(failure instanceof Error ? failure.message : 'สร้าง workspace ไม่สำเร็จ'); } finally { setBusy(false); } }
  if (!workspaces) return <div className="workspace-gate"><div className="workspace-gate-card">{error || 'กำลังโหลด workspace...'}</div></div>;
  const selected = workspaces.find((item) => item.id === selectedId);
  if (selected) return <Workspace workspace={selected} onLogout={onLogout} onSwitchWorkspace={() => setSelectedId('')} />;
  return <div className="workspace-gate"><div className="workspace-gate-card"><img src={logo} alt="PrompCHAT" /><h1>{workspaces.length ? 'เลือก workspace' : 'สร้าง Chat สำหรับเว็บไซต์ของคุณ'}</h1><p>แต่ละ workspace มีคีย์ฝังเว็บและบทสนทนาของตัวเอง</p>{workspaces.map((item) => <button className="workspace-choice" key={item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span>{item.domain}</span><span>→</span></button>)}<form onSubmit={submit}><label>ชื่อแบรนด์<input value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น Moon Studio" /></label><label>โดเมนเว็บไซต์<input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="myshop.com" /></label>{error && <div className="form-error">{error}</div>}<Button type="submit" disabled={busy}>{busy ? 'กำลังสร้าง...' : 'สร้าง Chat ใหม่'}</Button></form><button className="gate-logout" onClick={onLogout}>ออกจากระบบ</button></div></div>;
}

function Workspace({ onLogout, workspace, onSwitchWorkspace }: { onLogout: () => void; workspace?: RemoteWorkspace; onSwitchWorkspace?: () => void }) {
  const [view, setView] = useState<View>('inbox'); const [filter, setFilter] = useState<Filter>('ทั้งหมด'); const [conversations, setConversations] = useState<Conversation[]>(() => { if (workspace) return []; try { return JSON.parse(localStorage.getItem('promptchat-conversations-v2') || 'null') || seedConversations; } catch { return seedConversations; } }); const [activeId, setActiveId] = useState<number | string>(1); const [query, setQuery] = useState(''); const [composer, setComposer] = useState(''); const [showEmbed, setShowEmbed] = useState(false); const [showWidget, setShowWidget] = useState(false); const [toast, setToast] = useState(''); const [botEnabled, setBotEnabled] = useState(() => localStorage.getItem('promptchat-bot-enabled') !== 'false'); const [agentIcon, setAgentIcon] = useState(() => localStorage.getItem('promptchat-agent-icon') || 'PA');
  const [chatSettings, setChatSettings] = useState<ChatSettings>(defaultChatSettings);
  const [settingsBusy, setSettingsBusy] = useState(false);
  useEffect(() => { if (!workspace || !supabase) return; let active = true; void supabase.from('workspace_settings').select('brand_name,welcome_message,offline_message,color_primary,bot_enabled,bot_handoff_keyword,agent_icon,visitor_icon').eq('workspace_id', workspace.id).single().then(({ data, error }) => { if (!active) return; if (error) { setToast(`โหลดการตั้งค่าไม่สำเร็จ: ${error.message}`); return; } if (data) { setChatSettings({ ...defaultChatSettings, ...data }); setAgentIcon(data.agent_icon || 'PA'); setBotEnabled(data.bot_enabled); } }); return () => { active = false; }; }, [workspace]);
  async function saveChatSettings() { if (!workspace || !supabase) { setAgentIcon(chatSettings.agent_icon); setBotEnabled(chatSettings.bot_enabled); setToast('บันทึกการตั้งค่าในตัวอย่างแล้ว'); return; } setSettingsBusy(true); const { error } = await supabase.from('workspace_settings').update({ ...chatSettings, updated_at: new Date().toISOString() }).eq('workspace_id', workspace.id); setSettingsBusy(false); if (error) { setToast(`บันทึกไม่สำเร็จ: ${error.message}`); return; } setAgentIcon(chatSettings.agent_icon); setBotEnabled(chatSettings.bot_enabled); setToast('บันทึกการตั้งค่าแล้ว'); }
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0] ?? emptyConversation;
  const filteredConversations = useMemo(() => conversations.filter((conversation) => { const matchesFilter = filter === 'ทั้งหมด' || conversation.status === filter; const term = query.toLowerCase(); return matchesFilter && (!term || `${conversation.name} ${conversation.preview} ${conversation.channel}`.toLowerCase().includes(term)); }), [conversations, filter, query]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (!workspace) localStorage.setItem('promptchat-conversations-v2', JSON.stringify(conversations)); }, [conversations, workspace]);
  useEffect(() => { if (workspace) return; const sync = (event: StorageEvent) => { if (event.key !== 'promptchat-conversations-v2' || !event.newValue) return; try { setConversations(JSON.parse(event.newValue)); setToast('มีข้อความใหม่เข้ามา'); } catch { /* ignore invalid preview data */ } }; window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync); }, [workspace]);
  useEffect(() => { if (!workspace) return; let active = true; const refresh = async () => { try { const mapped = mapRemoteChat(await loadWorkspaceChat(workspace.id)); if (!active) return; setConversations(mapped); setActiveId((current) => mapped.some((item) => item.id === current) ? current : mapped[0]?.id || 'empty'); } catch (failure) { if (active) setToast(failure instanceof Error ? failure.message : 'โหลดแชตไม่สำเร็จ'); } }; void refresh(); const unsubscribe = subscribeWorkspaceChat(workspace.id, () => { void refresh(); }); return () => { active = false; unsubscribe(); }; }, [workspace]);
  useEffect(() => { localStorage.setItem('promptchat-bot-enabled', String(botEnabled)); }, [botEnabled]);
  useEffect(() => { localStorage.setItem('promptchat-agent-icon', agentIcon); }, [agentIcon]);
  function sendMessage(event?: FormEvent, preset?: string) { event?.preventDefault(); const text = (preset ?? composer).trim(); if (!text || activeId === 'empty') return; const newMessage: Message = { id: Date.now(), sender: 'agent', text, time: formatNow() }; setConversations((items) => items.map((conversation) => conversation.id === activeId ? { ...conversation, status: 'กำลังตอบ', preview: text, time: newMessage.time, messages: [...conversation.messages, newMessage] } : conversation)); setComposer(''); if (workspace) { void sendRemoteAgentMessage(workspace.id, String(activeId), text).then(() => setToast('ส่งข้อความแล้ว')).catch((failure) => setToast(failure instanceof Error ? failure.message : 'ส่งข้อความไม่สำเร็จ')); } else setToast('ส่งข้อความแล้ว'); }
  async function sendFile(upload: OptimizedUpload, text: string) { if (activeId === 'empty') return; try { const body = [text.trim(), `📎 ${upload.file.name} (${formatBytes(upload.optimizedSize)})`].filter(Boolean).join('\n'); if (workspace) { await sendRemoteAgentAttachment(workspace.id, String(activeId), body, upload.file); setComposer(''); setToast('ส่งไฟล์แล้ว'); return; } const attachmentId = await savePreviewAttachment(upload.file); const message: Message = { id: Date.now(), sender: 'agent', text: body, time: formatNow(), attachmentId, attachmentName: upload.file.name }; setConversations((items) => items.map((item) => item.id === activeId ? { ...item, status: 'กำลังตอบ', preview: body, time: message.time, messages: [...item.messages, message] } : item)); setComposer(''); setToast('ส่งไฟล์แล้ว'); } catch (failure) { setToast(failure instanceof Error ? failure.message : 'บันทึกไฟล์ไม่สำเร็จ'); } }
  function markDone() { if (activeId === 'empty') return; setConversations((items) => items.map((conversation) => conversation.id === activeId ? { ...conversation, status: 'เสร็จสิ้น', unread: 0 } : conversation)); if (workspace && supabase) void supabase.from('conversations').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', activeId).eq('workspace_id', workspace.id); setToast('ปิดการสนทนาแล้ว'); }
  function copyEmbed() { navigator.clipboard?.writeText(embedScriptCode(workspace)); setToast('คัดลอกโค้ดติดตั้งแล้ว'); }
  function simulateVisitor() { if (workspace) return; const id = Date.now(); const newConversation: Conversation = { id, name: 'Mookda P.', initials: 'MP', avatarColor: '#52b7a3', channel: 'your-website.com', status: 'รอตอบ', time: formatNow(), preview: 'สวัสดีค่ะ อยากสอบถามรายละเอียดแพ็กเกจ', unread: 1, email: 'mookda@example.com', page: '/home', messages: [{ id: id + 1, sender: 'visitor', text: 'สวัสดีค่ะ อยากสอบถามรายละเอียดแพ็กเกจ', time: formatNow() }] }; setConversations((items) => [newConversation, ...items]); setActiveId(id); setFilter('ทั้งหมด'); setView('inbox'); setToast('มีข้อความใหม่เข้ามา'); }
  return <motion.div className="app-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }}>
    <header className="topbar"><div className="topbar-brand"><img src={logo} alt="PrompCHAT" /><span>Promp<span>CHAT</span></span></div><div className="topbar-center"><button className="workspace-switcher" onClick={onSwitchWorkspace} disabled={!onSwitchWorkspace}><span className="workspace-mark">P</span><span>{workspace?.name || 'PrompCHAT workspace'}</span><ChevronDown size={15} /></button><div className="live-pill"><span className="status-dot" /> ออนไลน์</div></div><div className="topbar-actions"><button className="icon-button" aria-label="การแจ้งเตือน"><Bell size={19} />{conversations.some((item) => item.status === 'รอตอบ') && <i>{conversations.filter((item) => item.status === 'รอตอบ').length}</i>}</button><div className="topbar-avatar">PA</div><div className="user-summary"><strong>Promp Admin</strong><small>เจ้าของ workspace</small></div><button className="icon-button" onClick={onLogout} aria-label="ออกจากระบบ"><LogOut size={17} /></button></div></header>
    <div className="app-body"><aside className="sidebar"><div className="sidebar-label">WORKSPACE</div><nav><SidebarItem icon={<LayoutDashboard size={18} />} label="ภาพรวม" active={view === 'overview'} onClick={() => setView('overview')} /><SidebarItem icon={<MessageCircle size={18} />} label="กล่องข้อความ" active={view === 'inbox'} badge={String(conversations.filter((item) => item.status === 'รอตอบ').length)} onClick={() => setView('inbox')} /><SidebarItem icon={<Users size={18} />} label="ผู้เยี่ยมชม" active={view === 'visitors'} onClick={() => setView('visitors')} /></nav><div className="sidebar-label sidebar-label-spaced">จัดการระบบ</div><nav><SidebarItem icon={<Code2 size={18} />} label="ติดตั้งบนเว็บไซต์" active={view === 'install'} onClick={() => setView('install')} /><SidebarItem icon={<PlugZap size={18} />} label="API & integrations" active={view === 'api'} onClick={() => setView('api')} /><SidebarItem icon={<Settings size={18} />} label="ตั้งค่า" active={view === 'settings'} onClick={() => setView('settings')} /></nav><div className="sidebar-spacer" /><div className="sidebar-help"><div className="help-icon"><Headphones size={18} /></div><div><strong>ต้องการความช่วยเหลือ?</strong><p>ทีมของเราพร้อมดูแลคุณ</p><button onClick={() => setToast('ทีมงานจะติดต่อกลับเร็ว ๆ นี้')}>คุยกับทีมงาน <span>→</span></button></div></div><div className="sidebar-footer"><div className="mini-avatar">PA</div><div><strong>PrompCHAT</strong><small>{workspace ? workspace.domain : 'Local preview'}</small></div><MoreHorizontal size={17} /></div></aside>
<main className="workspace-main">{view === 'inbox' && <InboxView conversations={filteredConversations} active={activeConversation} filter={filter} query={query} setFilter={setFilter} setQuery={setQuery} onSelect={setActiveId} composer={composer} setComposer={setComposer} onSend={sendMessage} onSendFile={sendFile} onDone={markDone} onEmbed={() => setShowEmbed(true)} onPreview={() => setShowWidget(true)} onSimulate={workspace ? undefined : simulateVisitor} agentIcon={agentIcon} visitorIcon={chatSettings.visitor_icon} quickReplies={quickReplies} />}{view === 'overview' && <OverviewView conversations={conversations} onInbox={() => setView('inbox')} />}{view === 'visitors' && <VisitorsView conversations={conversations} />}{view === 'install' && <InstallView onCopy={copyEmbed} code={embedScriptCode(workspace)} workspace={workspace} />}{view === 'api' && <ApiView code={embedScriptCode(workspace)} />}{view === 'settings' && <WorkspaceSettings value={chatSettings} onChange={setChatSettings} onSave={() => void saveChatSettings()} busy={settingsBusy} />}</main>
    </div>
    <AnimatePresence>{showEmbed && <EmbedModal onClose={() => setShowEmbed(false)} onCopy={copyEmbed} code={embedScriptCode(workspace)} />}{showWidget && <WidgetPreview onClose={() => setShowWidget(false)} />}</AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><Check size={16} /> {toast}</motion.div>}
  </motion.div>;
}

function SidebarItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active?: boolean; badge?: string; onClick: () => void }) { return <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><button className={`sidebar-item ${active ? 'active' : ''}`} onClick={onClick} aria-label={label}>{icon}<span>{label}</span>{badge && <b>{badge}</b>}</button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip></TooltipProvider>; }
function ConversationItem({ conversation, active, onClick }: { conversation: Conversation; active: boolean; onClick: () => void }) { return <button className={`conversation-item ${active ? 'active' : ''}`} onClick={onClick}><Avatar conversation={conversation} /><div className="conversation-copy"><div className="conversation-line"><strong>{conversation.name}</strong><time>{conversation.time}</time></div><p>{conversation.preview}</p><span className="conversation-channel">{conversation.channel}</span></div>{conversation.unread > 0 && <span className="unread-badge">{conversation.unread}</span>}</button>; }
function Avatar({ conversation, large }: { conversation: Conversation; large?: boolean }) { return <span className={`avatar ${large ? 'large' : ''}`} style={{ background: conversation.avatarColor }}>{conversation.initials}</span>; }
function MessageBubble({ message, visitorInitials = 'NS', visitorColor = '#2d9cdb', agentIcon = 'PA', visitorIcon = '👤' }: { message: Message; visitorInitials?: string; visitorColor?: string; agentIcon?: string; visitorIcon?: string }) { const isAgent = message.sender === 'agent'; const isBot = message.sender === 'bot'; return <div className={`message-row ${isAgent ? 'outgoing' : 'incoming'}`}>{!isAgent && (isBot ? <img className="message-avatar" src={avatar} alt="PrompCHAT bot" /> : <span className="message-avatar initials-avatar" style={{ background: visitorColor }}>{visitorIcon === '👤' ? visitorInitials : visitorIcon}</span>)}<div className="message-stack">{isBot && <small className="message-author"><Bot size={12} /> PrompCHAT bot</small>}<div className={`message-bubble ${isBot ? 'bot' : ''}`}>{message.text}{message.remoteAttachmentPath && supabase && <button className="message-download" onClick={() => void downloadRemoteAttachment(supabase, message.remoteAttachmentPath!, message.attachmentName || 'attachment')}><Download size={12} /> ดาวน์โหลด {message.attachmentName}</button>}{message.attachmentId && <button className="message-download" onClick={() => void openPreviewAttachment(message.attachmentId!)}><Download size={12} /> ดาวน์โหลด {message.attachmentName}</button>}</div><time>{message.time}{isAgent && <CheckCheck size={12} />}</time></div>{isAgent && <span className="message-agent-avatar" title="ไอคอนผู้ตอบ">{agentIcon}</span>}</div>; }

function AdminComposer({ value, onChange, onSend, onSendFile }: { value: string; onChange: (value: string) => void; onSend: (event?: FormEvent) => void; onSendFile: (upload: OptimizedUpload, text: string) => Promise<void> }) {
  const [upload, setUpload] = useState<OptimizedUpload | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  async function handleFile(file?: File) { if (!file) return; setIsCompressing(true); setUpload(await optimizeUpload(file)); setIsCompressing(false); }
  function submit(event: FormEvent) { if (upload) { event.preventDefault(); void onSendFile(upload, value); setUpload(null); } else onSend(event); }
  return <div className="admin-composer-wrap">
    {upload && <div className="admin-attachment"><Paperclip size={13} /><span>{upload.file.name} · {formatBytes(upload.optimizedSize)}{upload.compressed ? ` จาก ${formatBytes(upload.originalSize)}` : ''}</span><button onClick={() => setUpload(null)} aria-label="ลบไฟล์แนบ"><X size={13} /></button></div>}
    <form className="composer" onSubmit={submit}>
      <label className="composer-icon composer-file" aria-label="แนบไฟล์"><Paperclip size={18} /><input type="file" accept="image/*,video/*,.pdf,.doc,.docx" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={isCompressing ? 'กำลังบีบอัดไฟล์...' : 'พิมพ์ข้อความเพื่อตอบกลับ...'} />
      <button type="button" className="composer-icon" aria-label="เลือกอีโมจิ" onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={18} /></button>
      <button className="send-button" type="submit" disabled={isCompressing} aria-label="ส่งข้อความ"><Send size={18} /></button>
    </form>
    {emojiOpen && <div className="admin-emoji-popover">{['😀', '😊', '😍', '👍', '🎉', '🙏', '💬', '❤️'].map((emoji) => <button key={emoji} onClick={() => { onChange(value + emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
  </div>;
}

function ChatActionsMenu({ onDone, onPreview, onEmbed }: { onDone: () => void; onPreview: () => void; onEmbed: () => void }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button light" aria-label="ตัวเลือกบทสนทนา"><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onPreview}><MessageCircle size={14} /> ดูวิดเจ็ต</DropdownMenuItem><DropdownMenuItem onSelect={onEmbed}><Code2 size={14} /> โค้ดติดตั้ง</DropdownMenuItem><DropdownMenuItem onSelect={onDone}><CheckCheck size={14} /> ปิดการสนทนา</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

function InboxView({ conversations, active, filter, query, setFilter, setQuery, onSelect, composer, setComposer, onSend, onSendFile, onDone, onEmbed, onPreview, onSimulate, agentIcon, visitorIcon, quickReplies }: { conversations: Conversation[]; active: Conversation; filter: Filter; query: string; setFilter: (value: Filter) => void; setQuery: (value: string) => void; onSelect: (id: number | string) => void; composer: string; setComposer: (value: string) => void; onSend: (event?: FormEvent, preset?: string) => void; onSendFile: (upload: OptimizedUpload, text: string) => Promise<void>; onDone: () => void; onEmbed: () => void; onPreview: () => void; onSimulate?: () => void; agentIcon: string; visitorIcon: string; quickReplies: string[] }) {
return <div className="inbox-page"><div className="page-heading"><div><div className="breadcrumb">WORKSPACE / กล่องข้อความ</div><h1>กล่องข้อความ <span className="count-badge">{conversations.length}</span></h1><p>ดูแลทุกบทสนทนาจากเว็บไซต์ของคุณในที่เดียว</p></div><div className="heading-actions">{onSimulate && <button className="outline-button" onClick={onSimulate}><Plus size={16} /> ทดสอบข้อความใหม่</button>}<button className="outline-button" onClick={onPreview}><MessageCircle size={16} /> ดูตัวอย่างวิดเจ็ต</button><button className="primary-button small" onClick={onEmbed}><Code2 size={16} /> ติดตั้งบนเว็บไซต์</button></div></div><div className="inbox-tabs">{(['ทั้งหมด', 'รอตอบ', 'กำลังตอบ', 'เสร็จสิ้น'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}<span>{item === 'ทั้งหมด' ? conversations.length : conversations.filter((conversation) => conversation.status === item).length}</span></button>)}</div><div className="inbox-layout"><section className="conversation-list panel-card"><div className="list-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อ หรือข้อความ..." /></div><button className="icon-button light"><MoreHorizontal size={18} /></button></div><div className="list-meta"><span>{conversations.length} บทสนทนา</span><button><span className="status-dot" /> ออนไลน์ทั้งหมด</button></div><ScrollArea className="conversation-scroll"><div className="conversation-items">{conversations.map((conversation) => <motion.div key={conversation.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .2 }}><ConversationItem conversation={conversation} active={conversation.id === active.id} onClick={() => onSelect(conversation.id)} /></motion.div>)}{conversations.length === 0 && <div className="empty-state"><MessageCircle size={24} /><p>ไม่พบการสนทนา</p></div>}</div></ScrollArea></section><section className="chat-panel panel-card"><div className="chat-header"><div className="person-block"><Avatar conversation={active} /><div><h2>{active.name}</h2><p><span className="status-dot" /> ออนไลน์ <span className="separator">•</span> {active.channel}</p></div></div><div className="chat-header-actions"><button className="outline-button compact"><PanelRight size={15} /> ดูข้อมูลลูกค้า</button><ChatActionsMenu onDone={onDone} onPreview={onPreview} onEmbed={onEmbed} /></div></div><div className="chat-context"><span><Link2 size={13} /> เข้ามาจาก {active.page}</span><span>เริ่มสนทนาเมื่อวันนี้ {active.messages[0]?.time}</span></div><ScrollArea className="message-stream"><div className="day-divider"><span>วันนี้</span></div>{active.messages.map((message, index) => <motion.div key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22, delay: index * .04 }}><MessageBubble message={message} visitorInitials={active.initials} visitorColor={active.avatarColor} agentIcon={agentIcon} visitorIcon={visitorIcon} /></motion.div>)}</ScrollArea><div className="composer-area"><div className="quick-replies">{quickReplies.map((reply) => <button key={reply} onClick={() => onSend(undefined, reply)}><Zap size={12} /> {reply}</button>)}</div><AdminComposer value={composer} onChange={setComposer} onSend={onSend} onSendFile={onSendFile} /><div className="composer-footer"><span>กด Enter เพื่อส่ง <span className="separator">•</span> ข้อความนี้จะส่งในชื่อ PrompCHAT Admin</span><button onClick={onDone}><CheckCheck size={14} /> ปิดการสนทนา</button></div></div></section><aside className="customer-panel panel-card"><div className="customer-heading"><h3>ข้อมูลลูกค้า</h3><button className="icon-button light"><MoreHorizontal size={18} /></button></div><div className="customer-profile"><Avatar conversation={active} large /><h3>{active.name}</h3><p>{active.email}</p><span className="visitor-tag">ผู้เยี่ยมชมใหม่</span></div><div className="customer-section"><div className="section-title">ข้อมูลติดต่อ</div><div className="detail-row"><span>อีเมล</span><strong>{active.email}</strong></div><div className="detail-row"><span>ช่องทาง</span><strong>{active.channel}</strong></div><div className="detail-row"><span>หน้าปัจจุบัน</span><strong>{active.page}</strong></div></div><div className="customer-section"><div className="section-title">โน้ตสำหรับทีม</div><div className="note-box">เพิ่มบันทึกเกี่ยวกับลูกค้าคนนี้...</div></div><div className="customer-section customer-links"><button><FileText size={15} /> ดูประวัติการสนทนา</button><button><Download size={15} /> ดาวน์โหลดข้อมูล</button></div></aside></div></div>;
}

function OverviewView({ conversations, onInbox }: { conversations: Conversation[]; onInbox: () => void }) { const pending = conversations.filter((item) => item.status === 'รอตอบ').length; const active = conversations.filter((item) => item.status === 'กำลังตอบ').length; const closed = conversations.filter((item) => item.status === 'เสร็จสิ้น').length; return <div className="content-page"><div className="page-heading"><div><div className="breadcrumb">WORKSPACE / ภาพรวม</div><h1>ภาพรวมแชต</h1><p>สถานะบทสนทนาปัจจุบันของ workspace นี้</p></div><button className="primary-button small" onClick={onInbox}><MessageCircle size={16} /> เปิดกล่องข้อความ</button></div><div className="overview-grid"><StatCard label="บทสนทนาทั้งหมด" value={String(conversations.length)} delta="ทั้งหมดในระบบ" icon={<MessageCircle size={20} />} /><StatCard label="รอตอบ" value={String(pending)} delta="ต้องดูแล" icon={<Zap size={20} />} accent /><StatCard label="กำลังตอบ" value={String(active)} delta="ทีมกำลังดูแล" icon={<Users size={20} />} /><StatCard label="เสร็จสิ้น" value={String(closed)} delta="ปิดแล้ว" icon={<CheckCheck size={20} />} /></div><section className="wide-card panel-card"><div className="card-heading"><div><h3>บทสนทนาล่าสุด</h3><p>ข้อมูลจากกล่องข้อความ</p></div></div><div className="overview-recent">{conversations.slice(0, 5).map((item) => <div key={item.id}><span className="visitor-dot" style={{ background: item.avatarColor }}>{item.initials}</span><strong>{item.name}</strong><span>{item.preview}</span><small>{item.time}</small></div>)}{conversations.length === 0 && <p>ยังไม่มีบทสนทนา เมื่อมีลูกค้าทักจากวิดเจ็ต รายการจะปรากฏที่นี่</p>}</div></section></div>; }
function StatCard({ label, value, delta, icon, accent }: { label: string; value: string; delta: string; icon: React.ReactNode; accent?: boolean }) { return <div className={`stat-card panel-card ${accent ? 'accent' : ''}`}><div className="stat-icon">{icon}</div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{delta}</small></div></div>; }
function Todo({ icon, text, count }: { icon: React.ReactNode; text: string; count: string }) { return <button className="todo-item"><span className="todo-icon">{icon}</span><span>{text}</span><b>{count}</b><ChevronDown size={15} /></button>; }

function VisitorsView({ conversations }: { conversations: Conversation[] }) { return <div className="content-page"><div className="page-heading"><div><div className="breadcrumb">WORKSPACE / ผู้เยี่ยมชม</div><h1>ผู้เยี่ยมชม <span className="count-badge">{conversations.length}</span></h1><p>ผู้เยี่ยมชมที่เริ่มสนทนากับ workspace ของคุณ</p></div></div><div className="visitor-list panel-card"><div className="visitor-list-head"><span>ผู้เยี่ยมชม</span><span>ช่องทาง</span><span>อีเมล</span><span>สถานะ</span><span>เวลาล่าสุด</span></div>{conversations.map((item) => <div className="visitor-row" key={item.id}><div className="visitor-name"><span className="visitor-dot" style={{ background: item.avatarColor }}>{item.initials}</span><strong>{item.name}</strong></div><span>{item.channel}</span><span>{item.email}</span><span>{item.status}</span><time>{item.time}</time></div>)}{conversations.length === 0 && <div className="empty-visitors">ยังไม่มีผู้เยี่ยมชมที่เริ่มแชต</div>}</div></div>; }

function InstallView({ onCopy, code, workspace }: { onCopy: () => void; code: string; workspace?: RemoteWorkspace }) { const [launcher, setLauncher] = useState<'default' | 'custom'>('default'); const installCode = launcher === 'custom' ? code.replace('  async', '  data-prompchat-launcher="custom"\n  async') : code; const copyInstall = () => launcher === 'custom' ? void navigator.clipboard?.writeText(installCode) : onCopy(); return <div className="content-page narrow-content"><div className="page-heading"><div><div className="breadcrumb">จัดการระบบ / ติดตั้งบนเว็บไซต์</div><h1>นำ PrompCHAT ไปไว้บนเว็บคุณ</h1><p>ติดตั้งวิดเจ็ตด้วยโค้ดสั้น ๆ เพียงครั้งเดียว แล้วเริ่มรับข้อความจากลูกค้าได้ทันที</p></div></div><div className="install-grid"><div className="install-card panel-card"><div className="install-step"><span>01</span><div><h3>คัดลอกโค้ดติดตั้ง</h3><p>วางโค้ดนี้ก่อนปิดแท็ก <code>&lt;/body&gt;</code> ในเว็บไซต์ของคุณ</p></div></div><div className="launcher-choice"><span>ปุ่มเปิดแชต</span><label><input type="radio" name="launcher" checked={launcher === 'default'} onChange={() => setLauncher('default')} /> ใช้ปุ่ม PrompCHAT</label><label><input type="radio" name="launcher" checked={launcher === 'custom'} onChange={() => setLauncher('custom')} /> ใช้ปุ่มของเว็บไซต์ฉัน</label></div><div className="code-block"><button onClick={copyInstall}><Clipboard size={15} /> คัดลอก</button><pre>{installCode}</pre></div>{launcher === 'custom' && <div className="custom-launcher-guide"><p>ระบบจะซ่อนปุ่ม PrompCHAT แต่ยังแสดงหน้าต่างแชตเมื่อปุ่มของเว็บเรียกคำสั่งนี้:</p><pre>{'<button onclick="window.PrompChatWidget.open()">แชตกับเรา</button>'}</pre><small>มีคำสั่ง <code>open()</code>, <code>close()</code> และ <code>toggle()</code> ให้ใช้งาน</small></div>}<div className="install-tip"><Sparkles size={17} /><span>หลังติดตั้งแล้ว ลองเปิดเว็บของคุณในอีกแท็บหนึ่งเพื่อทดสอบการแชต</span></div>{workspace && <InstallVerification workspace={workspace} />}</div><div className="install-card side-install panel-card"><div className="install-step"><span>02</span><div><h3>ปรับให้เข้ากับแบรนด์</h3><p>เปลี่ยนสี ข้อความต้อนรับ และตำแหน่งวิดเจ็ตได้จากหน้า “ตั้งค่า”</p></div></div><div className="theme-preview"><div className="theme-preview-top"><img src={avatar} alt="PrompCHAT" /><div><strong>PrompCHAT</strong><small>ทีมงานออนไลน์</small></div><X size={14} /></div><div className="theme-preview-msg">สวัสดีค่ะ มีอะไรให้เราช่วยไหมคะ?</div><div className="theme-preview-input">พิมพ์ข้อความ...</div></div><button className="outline-button full" onClick={onCopy}><Code2 size={16} /> เปิดหน้าตั้งค่า</button></div></div></div>; }

function InstallVerification({ workspace }: { workspace: RemoteWorkspace }) {
  const [status, setStatus] = useState(workspace.domain_verified ? 'ยืนยันโดเมนแล้ว' : 'รอการติดตั้ง');
  const [checking, setChecking] = useState(false);
  async function verify() {
    if (!supabase) return;
    setChecking(true);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/verify-installation', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify({ embedKey: workspace.embed_key }) });
      const result = await response.json();
      setStatus(result.verified ? 'ติดตั้งสำเร็จแล้ว' : `ยังไม่พบสคริปต์บน ${workspace.domain}`);
    } catch { setStatus('ตรวจสอบไม่สำเร็จ ลองอีกครั้ง'); }
    finally { setChecking(false); }
  }
  return <div className="install-verify"><span>{status}</span><button className="primary-button small" onClick={() => void verify()} disabled={checking}>{checking ? 'กำลังตรวจ...' : 'ตรวจสอบการติดตั้ง'}</button></div>;
}

function ApiDocsDialog() { return <Dialog><DialogTrigger asChild><Button variant="outline" size="sm">ดู API docs</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>PrompCHAT API</DialogTitle><DialogDescription>เส้นทางสำหรับทดสอบระบบและเชื่อมต่อหลังเปิด Supabase</DialogDescription></DialogHeader><div className="api-docs-body"><code>GET /api/health</code><span>ตรวจว่าบริการออนไลน์</span><code>POST /api/bot-reply</code><span>ทดสอบกฎตอบอัตโนมัติ</span><code>POST /api/verify-installation</code><span>ตรวจสคริปต์บนโดเมนที่ผูกกับ workspace</span></div></DialogContent></Dialog>; }

function ApiView({ code }: { code: string }) {
  const [copied, setCopied] = useState('');
  const snippet = `fetch('${window.location.origin}/api/health').then((response) => response.json())`;
  function copy(value: string, label: string) { navigator.clipboard?.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 1800); }
  return <div className="content-page narrow-content"><div className="page-heading"><div><div className="breadcrumb">จัดการระบบ / API & INTEGRATIONS</div><h1>ต่อ PrompCHAT เข้ากับระบบของคุณ</h1><p>ใช้ API, Webhook หรือ SDK เพื่อเชื่อมแชตเข้ากับเว็บและระบบหลังบ้านที่คุณใช้อยู่</p></div><button className="primary-button small" onClick={() => copy(snippet, 'คัดลอกตัวอย่าง API แล้ว')}><PlugZap size={16} /> คัดลอกตัวอย่าง API</button><ApiDocsDialog /></div><div className="integration-cards"><div className="integration-card panel-card"><div className="integration-card-top"><div className="integration-symbol blue"><Code2 size={19} /></div><span className="connected-pill"><span className="status-dot" /> ตัวอย่าง</span></div><h3>REST API</h3><p>ตอนนี้เปิด Health API สำหรับตรวจการทำงาน; API บทสนทนาจะเปิดเมื่อเชื่อม Supabase</p><button onClick={() => copy(snippet, 'คัดลอก API example แล้ว')}><Clipboard size={14} /> {copied || 'คัดลอกตัวอย่าง request'}</button></div><div className="integration-card panel-card"><div className="integration-card-top"><div className="integration-symbol purple"><Zap size={19} /></div><span className="connected-pill"><span className="status-dot" /> รอตั้งค่า</span></div><h3>Webhooks</h3><p>เตรียมรับ event เมื่อกำหนด endpoint และเชื่อมฐานข้อมูลจริง</p><button onClick={() => copy('เพิ่ม webhook URL หลังเชื่อมฐานข้อมูล', 'ยังไม่ได้ตั้งค่า webhook')}><Link2 size={14} /> ตั้งค่า endpoint</button></div><div className="integration-card panel-card"><div className="integration-card-top"><div className="integration-symbol green"><MessageCircle size={19} /></div><span className="connected-pill"><span className="status-dot" /> พร้อมใช้</span></div><h3>Widget SDK</h3><p>ฝัง live chat บนเว็บไซต์ด้วย script เดียว รองรับ desktop และ mobile</p><button onClick={() => copy(embedScriptCode(), 'คัดลอก widget code แล้ว')}><Code2 size={14} /> คัดลอก widget code</button></div></div><div className="api-layout"><section className="api-key-card panel-card"><div className="api-section-heading"><div><h3>API access</h3><p>ยังไม่มีคีย์สำหรับ REST API ใน local preview</p></div><span className="key-status"><span className="status-dot" /> Pending</span></div><div className="api-key-row"><code>เชื่อม Supabase เพื่อเปิด API สำหรับบทสนทนา</code></div><div className="api-warning"><Sparkles size={15} /><span>เก็บคีย์ลับไว้ใน environment variable ของ Vercel เท่านั้น</span></div></section><section className="webhook-card panel-card"><div className="api-section-heading"><div><h3>Webhook events</h3><p>เลือก event ที่ระบบปลายทางต้องการรับ</p></div><button className="outline-button compact" onClick={() => copy('https://your-domain.com/api/promptchat/webhook', 'ยังไม่ได้ตั้งค่า webhook')}><Clipboard size={14} /> คัดลอก URL</button></div><div className="webhook-url"><Link2 size={14} /> https://your-domain.com/api/promptchat/webhook <span className="status-dot" /></div><label className="event-check"><input type="checkbox" defaultChecked /> <span><strong>conversation.created</strong><small>เมื่อมีบทสนทนาใหม่</small></span></label><label className="event-check"><input type="checkbox" defaultChecked /> <span><strong>message.created</strong><small>เมื่อมีข้อความใหม่ในแชต</small></span></label><label className="event-check"><input type="checkbox" /> <span><strong>conversation.closed</strong><small>เมื่อแอดมินปิดการสนทนา</small></span></label></section></div></div>;
}


function EmbedModal({ onClose, onCopy, code }: { onClose: () => void; onCopy: () => void; code: string }) { return <motion.div className="modal-backdrop" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="modal-card" onMouseDown={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}><div className="modal-header"><div className="modal-title"><div className="settings-icon blue"><Code2 size={18} /></div><div><h3>ติดตั้ง PrompCHAT</h3><p>โค้ดสำหรับเชื่อมต่อวิดเจ็ตกับเว็บไซต์ของคุณ</p></div></div><button className="icon-button light" onClick={onClose}><X size={18} /></button></div><div className="modal-code"><pre>{code}</pre><button className="copy-code-button" onClick={onCopy}><Clipboard size={16} /> คัดลอกโค้ด</button></div><div className="modal-note"><Check size={16} /> วางโค้ดก่อน <code>&lt;/body&gt;</code> แล้วรีเฟรชหน้าเว็บของคุณ</div></motion.div></motion.div>; }

function EmbeddedWidget() {
  const customLauncher = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('launcher') === 'custom';
  const [open, setOpen] = useState(!customLauncher);
  useEffect(() => { if (customLauncher) document.documentElement.dataset.promptchatLauncher = 'custom'; }, [customLauncher]);
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachment, setAttachment] = useState<OptimizedUpload | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [remote, setRemote] = useState<{ workspaceId: string; visitorId: string; conversationId: string; client: NonNullable<ReturnType<typeof getWidgetClient>> } | null>(null);
  const [widgetError, setWidgetError] = useState('');
  const [widgetName, setWidgetName] = useState('PrompCHAT');
  const [widgetAgentIcon, setWidgetAgentIcon] = useState('PA');
  const [widgetVisitorIcon, setWidgetVisitorIcon] = useState('👤');
  const [widgetPrimary, setWidgetPrimary] = useState('#35C2F0');
  const [quickOptions, setQuickOptions] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ id: 1, sender: 'bot', text: 'สวัสดีค่ะ 👋 มีอะไรให้เราช่วยไหมคะ?', time: formatNow() }]);
  useEffect(() => { window.parent.postMessage({ type: 'promptchat:resize', open }, '*'); }, [open]);
  useEffect(() => { const listener = (event: MessageEvent) => { if (event.source !== window.parent) return; if (event.data?.type === 'promptchat:open') setOpen(true); if (event.data?.type === 'promptchat:close') setOpen(false); if (event.data?.type === 'promptchat:toggle') setOpen((value) => !value); }; window.addEventListener('message', listener); return () => window.removeEventListener('message', listener); }, []);
useEffect(() => { if (isLocalPreview()) return; let active = true; let unsubscribe = () => undefined; const setup = async () => { try { const key = new URLSearchParams(window.location.search).get('workspace'); if (!key) throw new Error('ไม่พบคีย์ของวิดเจ็ต'); const initialized = await initializeWidget(key); const conversationId = await getOrCreateVisitorConversation(initialized.client, initialized.workspaceId, initialized.visitorId); if (!active) return; setRemote({ ...initialized, conversationId }); const [settingsResult, quickResult, messagesResult] = await Promise.all([initialized.client.from('workspace_settings').select('brand_name,welcome_message,agent_icon,visitor_icon,color_primary').eq('workspace_id', initialized.workspaceId).single(), initialized.client.from('quick_replies').select('label').eq('workspace_id', initialized.workspaceId).eq('is_active', true).order('sort_order'), initialized.client.from('messages').select('id,conversation_id,sender_type,body,attachment_url,attachment_name,created_at').eq('conversation_id', conversationId).order('created_at')]); if (!active) return; const settings = settingsResult.data; if (settings) { setWidgetName(settings.brand_name || 'PrompCHAT'); setWidgetAgentIcon(settings.agent_icon || 'PA'); setWidgetVisitorIcon(settings.visitor_icon || '👤'); if (/^#[0-9a-fA-F]{6}$/.test(settings.color_primary || '')) setWidgetPrimary(settings.color_primary); } setQuickOptions((quickResult.data || []).map((item) => item.label)); if (messagesResult.data?.length) setMessages(messagesResult.data.map((item) => ({ id: item.id, sender: item.sender_type, text: item.body || '', attachmentName: item.attachment_name || undefined, remoteAttachmentPath: item.attachment_url || undefined, time: new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at)) }))); else if (settings?.welcome_message) setMessages([{ id: 'welcome', sender: 'bot', text: settings.welcome_message, time: formatNow() }]); unsubscribe = subscribeVisitorConversation(initialized.client, conversationId, (item) => { setMessages((previous) => previous.some((message) => message.id === item.id) ? previous : [...previous, { id: item.id, sender: item.sender_type, text: item.body || '', attachmentName: item.attachment_name || undefined, remoteAttachmentPath: item.attachment_url || undefined, time: new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at)) }]); }); } catch (failure) { if (active) setWidgetError(failure instanceof Error ? failure.message : 'เปิดแชตไม่สำเร็จ'); } }; void setup(); return () => { active = false; unsubscribe(); }; }, []);
  useEffect(() => {
    if (!isLocalPreview()) return;
    const sync = () => { try { const session = localStorage.getItem('promptchat-visitor-session'); const list = JSON.parse(localStorage.getItem('promptchat-conversations-v2') || '[]') as Conversation[]; const current = list.find((item) => item.visitorSession === session); if (current) setMessages(current.messages); } catch { /* local preview only */ } };
    sync(); window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  async function handleFile(file?: File) { if (!file) return; setIsCompressing(true); const optimized = await optimizeUpload(file); setAttachment(optimized); setIsCompressing(false); }
  async function send() {
    const text = draft.trim();
    if ((!text && !attachment) || isCompressing) return;
    setIsCompressing(true);
    if (!isLocalPreview()) {
      if (!remote) { setWidgetError('ยังเชื่อมต่อแชตไม่ได้'); setIsCompressing(false); return; }
      try { const body = text || (attachment ? `📎 ${attachment.file.name}` : ''); if (attachment) await sendRemoteVisitorAttachment(remote.client, remote.workspaceId, remote.conversationId, body, attachment.file); else await sendRemoteVisitorMessage(remote.client, remote.workspaceId, remote.conversationId, body); setDraft(''); setAttachment(null); setShowEmoji(false); setWidgetError(''); }
      catch (failure) { setWidgetError(failure instanceof Error ? failure.message : 'ส่งข้อความไม่สำเร็จ'); }
      finally { setIsCompressing(false); }
      return;
    }
    let attachmentId: string | undefined;
    try { if (attachment) attachmentId = await savePreviewAttachment(attachment.file); }
    catch { setIsCompressing(false); setMessages((items) => [...items, { id: Date.now(), sender: 'bot', text: 'บันทึกไฟล์ในเบราว์เซอร์ไม่สำเร็จ กรุณาลองอีกครั้ง', time: formatNow() }]); return; }
    const attachmentText = attachment ? `📎 ${attachment.file.name} (${formatBytes(attachment.optimizedSize)}${attachment.compressed ? ` จาก ${formatBytes(attachment.originalSize)}` : ''})` : '';
    const body = [text, attachmentText].filter(Boolean).join('\n');
    const conversation = saveVisitorMessage(body, 'visitor', attachment ? { attachmentId, attachmentName: attachment.file.name } : undefined);
    setMessages(conversation.messages); setDraft(''); setAttachment(null); setShowEmoji(false); setIsCompressing(false);
    window.parent.postMessage({ type: 'promptchat:message', body, attachment: attachment ? { name: attachment.file.name, size: attachment.optimizedSize, originalSize: attachment.originalSize, compressed: attachment.compressed, type: attachment.file.type } : undefined }, '*');
    window.setTimeout(() => { const updated = saveVisitorMessage('รับข้อความแล้วค่ะ ทีมงานจะรีบเข้ามาตอบกลับนะคะ', 'bot'); setMessages(updated.messages); }, 550);
  }
  function addEmoji(emoji: string) { setDraft((value) => `${value}${emoji}`); setShowEmoji(false); }
return <div className="embed-widget-root" style={{ "--chat-primary": widgetPrimary } as CSSProperties}><AnimatePresence>{open && <motion.section className="embed-panel" initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: .96 }}><header className="embed-header"><img src={avatar} alt="PrompCHAT" /><div><strong>{widgetName}</strong><small><span className="status-dot" /> ทีมงานออนไลน์</small></div><button onClick={() => setOpen(false)} aria-label="ปิดแชต"><X size={16} /></button></header><div className="embed-messages">{messages.map((message) => <motion.div key={message.id} className={`embed-message ${message.sender === 'visitor' ? 'visitor' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><span className="embed-message-icon" aria-label={message.sender === "visitor" ? "ไอคอนลูกค้า" : "ไอคอนผู้ตอบ"}>{message.sender === "visitor" ? widgetVisitorIcon : widgetAgentIcon}</span>{message.text.split('\n').map((line, index) => <span key={`${message.id}-${index}`} className="embed-message-line">{line}</span>)}{message.remoteAttachmentPath && remote && <button className="embed-download" onClick={() => void downloadRemoteAttachment(remote.client, message.remoteAttachmentPath!, message.attachmentName || 'attachment')}><Download size={12} /> ดาวน์โหลด {message.attachmentName}</button>}{message.attachmentId && <button className="embed-download" onClick={() => void openPreviewAttachment(message.attachmentId!)}><Download size={12} /> ดาวน์โหลด {message.attachmentName}</button>}<time>{message.time}</time></motion.div>)}{quickOptions.length > 0 && <div className="embed-quick-options">{quickOptions.map((option) => <button key={option} onClick={() => setDraft(option)}>{option}</button>)}</div>}</div>{widgetError && <div className="embed-error">{widgetError}</div>}{attachment && <div className="embed-attachment"><Paperclip size={13} /> <span>{attachment.file.name} · {formatBytes(attachment.optimizedSize)}{attachment.compressed ? ` (บีบจาก ${formatBytes(attachment.originalSize)})` : ' (ต้นฉบับ)'}</span><button onClick={() => setAttachment(null)} aria-label="ลบไฟล์แนบ"><X size={12} /></button></div>}<div className="embed-composer"><label className="embed-tool" aria-label="แนบไฟล์"><Paperclip size={16} /><input type="file" accept="image/*,video/*,.pdf,.doc,.docx" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button type="button" className="embed-tool" onClick={() => setShowEmoji(!showEmoji)} aria-label="เลือก emoji"><Smile size={16} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder={isCompressing ? 'กำลังบีบอัดไฟล์...' : 'พิมพ์ข้อความ...'} aria-label="ข้อความแชต" /><button type="button" onClick={send} disabled={isCompressing} aria-label="ส่งข้อความ"><Send size={15} /></button>{showEmoji && <div className="embed-emoji-popover">{['😀', '😊', '😍', '👍', '🎉', '🙏', '💬', '❤️', '😄', '🤝'].map((emoji) => <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>{emoji}</button>)}</div>}</div></motion.section>}</AnimatePresence><motion.button className="embed-bubble" whileHover={{ scale: 1.05 }} whileTap={{ scale: .94 }} onClick={() => setOpen(!open)} aria-label="เปิด PrompCHAT"><MessageCircle size={23} />{!open && <span className="embed-unread">1</span>}</motion.button></div>;
}

function WidgetPreview({ onClose }: { onClose: () => void }) { const [text, setText] = useState(''); const [sent, setSent] = useState(false); return <motion.div className="modal-backdrop" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="widget-modal" onMouseDown={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 22, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14 }}><div className="widget-preview-bar"><div><span className="status-dot" /> ตัวอย่างวิดเจ็ตบนเว็บไซต์</div><button onClick={onClose}><X size={18} /></button></div><div className="fake-site"><div className="fake-site-nav"><span className="fake-logo">MOON<span>STUDIO</span></span><span>หน้าแรก</span><span>บริการ</span><span>เกี่ยวกับเรา</span><span>ติดต่อเรา</span></div><div className="fake-site-content"><div><small>สร้างสรรค์สิ่งที่เป็นคุณ</small><h2>บริการที่ช่วยให้<br /><em>ธุรกิจคุณโตขึ้น</em></h2><button>ดูบริการของเรา →</button></div><img src={laptop} alt="PrompCHAT" /></div><div className="fake-chat"><div className="fake-chat-head"><img src={avatar} alt="PrompCHAT" /><div><strong>PrompCHAT</strong><small><span className="status-dot" /> ทีมงานออนไลน์</small></div><button><X size={15} /></button></div><div className="fake-chat-body">{sent ? <><div className="fake-bubble bot">ขอบคุณที่ติดต่อเราค่ะ ทีมงานจะรีบตอบกลับให้เร็วที่สุดนะคะ</div><div className="fake-bubble visitor">{text}</div></> : <><div className="fake-bubble bot">สวัสดีค่ะ 👋<br />มีอะไรให้เราช่วยไหมคะ?</div><div className="fake-quick">สอบถามบริการ</div><div className="fake-quick">ขอใบเสนอราคา</div></>}<div className="fake-chat-compose"><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && text.trim()) setSent(true); }} placeholder="พิมพ์ข้อความ..." /><button onClick={() => text.trim() && setSent(true)}><Send size={15} /></button></div></div></div></div></motion.div></motion.div>; }

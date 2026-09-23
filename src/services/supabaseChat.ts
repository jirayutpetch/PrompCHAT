import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type RemoteWorkspace = { id: string; name: string; domain: string; domain_verified: boolean; embed_key: string };
export type RemoteMessage = { id: string; conversation_id: string; sender_type: 'visitor' | 'agent' | 'bot'; body: string | null; attachment_url: string | null; attachment_name: string | null; created_at: string };
export type RemoteConversation = { id: string; workspace_id: string; visitor_id: string | null; status: 'open' | 'pending' | 'closed'; site_url: string | null; updated_at: string };
export type RemoteVisitor = { id: string; name: string | null; email: string | null };

export async function listWorkspaces(): Promise<RemoteWorkspace[]> {
  if (!supabase) return [];
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];
  const { data, error } = await supabase.from('workspaces').select('id,name,domain,domain_verified,embed_key').eq('owner_id', user.user.id).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as RemoteWorkspace[];
}

export async function createWorkspace(name: string, domain: string): Promise<RemoteWorkspace> {
  if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('กรุณาเข้าสู่ระบบ');
  const { data, error } = await supabase.from('workspaces').insert({ owner_id: user.user.id, name, domain }).select('id,name,domain,domain_verified,embed_key').single();
  if (error || !data) throw error || new Error('สร้าง workspace ไม่สำเร็จ');
  return data as RemoteWorkspace;
}

export async function loadWorkspaceChat(workspaceId: string) {
  if (!supabase) return { conversations: [] as RemoteConversation[], visitors: [] as RemoteVisitor[], messages: [] as RemoteMessage[] };
  const { data: conversations, error } = await supabase.from('conversations').select('id,workspace_id,visitor_id,status,site_url,updated_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;
  const ids = (conversations || []).map((item) => item.id);
  if (!ids.length) return { conversations: [] as RemoteConversation[], visitors: [] as RemoteVisitor[], messages: [] as RemoteMessage[] };
  const visitorIds = [...new Set((conversations || []).map((item) => item.visitor_id).filter(Boolean))];
  const [visitorsResult, messagesResult] = await Promise.all([
    supabase.from('visitors').select('id,name,email').eq('workspace_id', workspaceId).in('id', visitorIds),
    supabase.from('messages').select('id,conversation_id,sender_type,body,attachment_url,attachment_name,created_at').eq('workspace_id', workspaceId).in('conversation_id', ids).order('created_at', { ascending: true }).limit(1000),
  ]);
  if (visitorsResult.error) throw visitorsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  return { conversations: conversations as RemoteConversation[], visitors: (visitorsResult.data || []) as RemoteVisitor[], messages: (messagesResult.data || []) as RemoteMessage[] };
}

export async function sendRemoteAgentMessage(workspaceId: string, conversationId: string, body: string) {
  if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('กรุณาเข้าสู่ระบบ');
  const { error } = await supabase.from('messages').insert({ workspace_id: workspaceId, conversation_id: conversationId, sender_type: 'agent', sender_id: user.user.id, body });
  if (error) throw error;
  await supabase.from('conversations').update({ status: 'open', handled_by: 'agent', updated_at: new Date().toISOString() }).eq('id', conversationId).eq('workspace_id', workspaceId);
}

export async function uploadRemoteAttachment(client: SupabaseClient, workspaceId: string, conversationId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const path = `${workspaceId}/${conversationId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await client.storage.from('chat-attachments').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return path;
}

export async function downloadRemoteAttachment(client: SupabaseClient, path: string, name: string) {
  const { data, error } = await client.storage.from('chat-attachments').download(path);
  if (error || !data) throw error || new Error('ดาวน์โหลดไฟล์ไม่สำเร็จ');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function sendRemoteAgentAttachment(workspaceId: string, conversationId: string, body: string, file: File) {
  if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('กรุณาเข้าสู่ระบบ');
  const path = await uploadRemoteAttachment(supabase, workspaceId, conversationId, file);
  const { error } = await supabase.from('messages').insert({ workspace_id: workspaceId, conversation_id: conversationId, sender_type: 'agent', sender_id: user.user.id, body, attachment_url: path, attachment_name: file.name, attachment_type: file.type, attachment_size: file.size });
  if (error) throw error;
}

export function subscribeWorkspaceChat(workspaceId: string, onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const channel = supabase.channel(`workspace-${workspaceId}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `workspace_id=eq.${workspaceId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${workspaceId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

let widgetClient: SupabaseClient | null = null;
export function getWidgetClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  widgetClient ||= createClient(url, anonKey, { auth: { storageKey: 'promptchat-widget-auth', persistSession: true, autoRefreshToken: true } });
  return widgetClient;
}

export async function initializeWidget(embedKey: string) {
  const client = getWidgetClient();
  if (!client) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) { const result = await client.auth.signInAnonymously(); if (result.error) throw result.error; }
  const { data, error } = await client.rpc('initialize_widget_visitor', { widget_key: embedKey });
  if (error || !data?.[0]) throw error || new Error('รหัสวิดเจ็ตไม่ถูกต้องหรือยังไม่ยืนยันโดเมน');
  return { client, workspaceId: data[0].workspace_id as string, visitorId: data[0].visitor_id as string };
}

export async function getOrCreateVisitorConversation(client: SupabaseClient, workspaceId: string, visitorId: string) {
  const { data: existing } = await client.from('conversations').select('id').eq('workspace_id', workspaceId).eq('visitor_id', visitorId).neq('status', 'closed').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await client.from('conversations').insert({ workspace_id: workspaceId, visitor_id: visitorId, status: 'pending', handled_by: 'bot', site_url: document.referrer || window.location.href }).select('id').single();
  if (error || !data) throw error || new Error('เปิดบทสนทนาไม่สำเร็จ');
  return data.id as string;
}

export async function sendRemoteVisitorMessage(client: SupabaseClient, workspaceId: string, conversationId: string, body: string) {
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error('ไม่พบ visitor session');
  const { error } = await client.from('messages').insert({ workspace_id: workspaceId, conversation_id: conversationId, sender_type: 'visitor', sender_id: user.user.id, body });
  if (error) throw error;
}

export async function sendRemoteVisitorAttachment(client: SupabaseClient, workspaceId: string, conversationId: string, body: string, file: File) {
  const { data: user } = await client.auth.getUser();
  if (!user.user) throw new Error('ไม่พบ visitor session');
  const path = await uploadRemoteAttachment(client, workspaceId, conversationId, file);
  const { error } = await client.from('messages').insert({ workspace_id: workspaceId, conversation_id: conversationId, sender_type: 'visitor', sender_id: user.user.id, body, attachment_url: path, attachment_name: file.name, attachment_type: file.type, attachment_size: file.size });
  if (error) throw error;
}

export function subscribeVisitorConversation(client: SupabaseClient, conversationId: string, onMessage: (message: RemoteMessage) => void) {
  const channel: RealtimeChannel = client.channel(`visitor-${conversationId}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage(payload.new as RemoteMessage))
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

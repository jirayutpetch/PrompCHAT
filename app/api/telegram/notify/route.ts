import { decryptBotToken, getTelegramAdmin, readBoundedJson, telegramApi, type TelegramConnection } from '../../../../lib/telegramServer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return Response.json({ error: 'visitor_auth_required' }, { status: 401 });
  let payload: { messageId?: unknown };
  try { payload = await readBoundedJson(request, 1024) as { messageId?: unknown }; }
  catch { return Response.json({ error: 'invalid_request' }, { status: 400 }); }
  const messageId = payload?.messageId;
  if (typeof messageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) return Response.json({ error: 'invalid_message_id' }, { status: 400 });
  let admin;
  try { admin = getTelegramAdmin(); } catch { return Response.json({ delivered: false, reason: 'telegram_unavailable' }, { status: 503 }); }
  const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !auth.user?.is_anonymous) return Response.json({ error: 'visitor_auth_required' }, { status: 401 });
  const { data: message, error: messageError } = await admin.from('messages').select('id,workspace_id,conversation_id,sender_type,sender_id,body,attachment_name').eq('id', messageId).single();
  if (messageError || !message || message.sender_type !== 'visitor' || message.sender_id !== auth.user.id) return Response.json({ error: 'message_not_found' }, { status: 404 });
  const { data: connectionData, error: connectionError } = await admin.from('telegram_connections').select('*').eq('workspace_id', message.workspace_id).maybeSingle();
  if (connectionError) return Response.json({ error: 'telegram_lookup_failed' }, { status: 503 });
  if (!connectionData) return Response.json({ delivered: false, reason: 'telegram_not_connected' });
  const connection = connectionData as TelegramConnection;
  if (connection.delivery_mode !== 'telegram' || !connection.chat_id) return Response.json({ delivered: false, reason: 'telegram_not_selected' });
  const { data: conversation } = await admin.from('conversations').select('site_url').eq('id', message.conversation_id).eq('workspace_id', message.workspace_id).single();
  const { data: workspace } = await admin.from('workspaces').select('name').eq('id', message.workspace_id).single();
  const text = [`💬 ${workspace?.name || 'PrompCHAT'} · ข้อความใหม่`,
    (message.body || (message.attachment_name ? `📎 ${message.attachment_name}` : '')).slice(0, 3000),
    conversation?.site_url ? `จาก ${conversation.site_url.slice(0, 300)}` : '',
    '↩️ กด Reply ที่ข้อความนี้เพื่อตอบลูกค้าคนเดิม'].filter(Boolean).join('\n\n');
  const { data: reserved, error: reserveError } = await admin.from('telegram_message_links').insert({
    workspace_id: message.workspace_id, conversation_id: message.conversation_id,
    source_message_id: message.id, chat_id: connection.chat_id,
  }).select('id').single();
  if (reserveError?.code === '23505') return Response.json({ delivered: true, duplicate: true });
  if (reserveError || !reserved) return Response.json({ error: 'delivery_reservation_failed' }, { status: 503 });
  try {
    const sent = await telegramApi<{ message_id: number }>(decryptBotToken(connection.token_encrypted), 'sendMessage', { chat_id: connection.chat_id, text });
    const { error: linkError } = await admin.from('telegram_message_links').update({ telegram_message_id: sent.message_id }).eq('id', reserved.id);
    if (linkError) return Response.json({ delivered: false, reason: 'reply_link_failed' }, { status: 503 });
    return Response.json({ delivered: true });
  } catch {
    await admin.from('telegram_message_links').delete().eq('id', reserved.id);
    return Response.json({ delivered: false, reason: 'telegram_send_failed' }, { status: 502 });
  }
}

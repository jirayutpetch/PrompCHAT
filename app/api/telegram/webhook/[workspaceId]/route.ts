import { decryptBotToken, getTelegramAdmin, matchesSecret, readBoundedJson, telegramApi, type TelegramConnection } from '../../../../../lib/telegramServer';

export const runtime = 'nodejs';

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number };
    from?: { is_bot?: boolean };
    text?: string;
    reply_to_message?: { message_id?: number };
  };
};

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) return new Response(null, { status: 404 });
  let admin;
  try { admin = getTelegramAdmin(); } catch { return new Response(null, { status: 503 }); }
  const { data, error } = await admin.from('telegram_connections').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (error) return new Response(null, { status: 503 });
  if (!data) return new Response(null, { status: 404 });
  const connection = data as TelegramConnection;
  if (!matchesSecret(request.headers.get('x-telegram-bot-api-secret-token') || '', connection.webhook_secret_hash)) return new Response(null, { status: 403 });

  let update: TelegramUpdate;
  try { update = await readBoundedJson(request, 16384) as TelegramUpdate; } catch { return new Response(null, { status: 400 }); }
  const message = update?.message;
  if (!Number.isSafeInteger(update?.update_id) || !message || !Number.isSafeInteger(message.chat?.id) || message.from?.is_bot) return Response.json({ ok: true });
  const chatId = message.chat!.id!;
  const body = typeof message.text === 'string' ? message.text.trim() : '';

  const pairing = body.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([a-f0-9]{16})$/i);
  if (pairing && connection.pairing_code_hash && connection.pairing_expires_at && new Date(connection.pairing_expires_at).getTime() > Date.now()
    && matchesSecret(pairing[1], connection.pairing_code_hash)) {
    const { error: pairError } = await admin.from('telegram_connections').update({
      chat_id: chatId, pairing_code_hash: null, pairing_expires_at: null, updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('pairing_code_hash', connection.pairing_code_hash);
    if (pairError) return new Response(null, { status: 503 });
    try { await telegramApi(decryptBotToken(connection.token_encrypted), 'sendMessage', { chat_id: chatId, text: 'เชื่อม Telegram กับ PrompCHAT แล้วครับ เมื่อมีข้อความลูกค้าใหม่ บอทจะส่งมาที่นี่ กด Reply ที่ข้อความนั้นเพื่อตอบกลับในแชตเดิม' }); } catch { /* pairing remains valid if confirmation delivery fails */ }
    return Response.json({ ok: true });
  }

  if (connection.chat_id !== chatId || connection.delivery_mode !== 'telegram' || !body || body.length > 4000 || !Number.isSafeInteger(message.reply_to_message?.message_id)) return Response.json({ ok: true });
  const { data: link, error: linkError } = await admin.from('telegram_message_links').select('conversation_id').eq('workspace_id', workspaceId).eq('chat_id', chatId).eq('telegram_message_id', message.reply_to_message!.message_id!).maybeSingle();
  if (linkError) return new Response(null, { status: 503 });
  if (!link) return Response.json({ ok: true });

  const { error: claimError } = await admin.from('telegram_processed_updates').insert({ workspace_id: workspaceId, update_id: update.update_id });
  if (claimError?.code === '23505') return Response.json({ ok: true });
  if (claimError) return new Response(null, { status: 503 });
  const { error: insertError } = await admin.from('messages').insert({ workspace_id: workspaceId, conversation_id: link.conversation_id, sender_type: 'agent', body });
  if (insertError) {
    await admin.from('telegram_processed_updates').delete().eq('workspace_id', workspaceId).eq('update_id', update.update_id!);
    return new Response(null, { status: 503 });
  }
  await admin.from('conversations').update({ status: 'open', handled_by: 'agent', updated_at: new Date().toISOString() }).eq('id', link.conversation_id).eq('workspace_id', workspaceId);
  return Response.json({ ok: true });
}

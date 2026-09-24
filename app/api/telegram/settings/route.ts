import { randomBytes } from 'node:crypto';
import { decryptBotToken, encryptBotToken, getTelegramAdmin, hashSecret, readBoundedJson, requireWorkspaceOwner, telegramApi, telegramWebhookUrl, type TelegramConnection } from '../../../../lib/telegramServer';

export const runtime = 'nodejs';

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function serverError(error: unknown) {
  const code = error instanceof Error ? error.message : 'telegram_request_failed';
  if (code === 'request_too_large') return Response.json({ error: code }, { status: 413 });
  if (code === 'invalid_json') return Response.json({ error: code }, { status: 400 });
  if (code === 'telegram_server_not_configured' || code === 'telegram_encryption_key_invalid') return Response.json({ error: 'telegram_server_not_configured' }, { status: 503 });
  return Response.json({ error: 'telegram_request_failed' }, { status: 502 });
}

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!isUuid(workspaceId)) return Response.json({ error: 'workspace_id_required' }, { status: 400 });
  try {
    const admin = getTelegramAdmin();
    if (!await requireWorkspaceOwner(request, admin, workspaceId)) return Response.json({ error: 'owner_auth_required' }, { status: 403 });
    const { data, error } = await admin.from('telegram_connections').select('bot_username,chat_id,delivery_mode,updated_at').eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    return Response.json({ connected: !!data, paired: !!data?.chat_id, botUsername: data?.bot_username || null, mode: data?.delivery_mode || 'app', updatedAt: data?.updated_at || null }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return serverError(error); }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    const value = await readBoundedJson(request);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return Response.json({ error: 'invalid_json' }, { status: 400 });
    payload = value as Record<string, unknown>;
  } catch (error) { return serverError(error); }
  if (!isUuid(payload.workspaceId)) return Response.json({ error: 'workspace_id_required' }, { status: 400 });
  try {
    const admin = getTelegramAdmin();
    if (!await requireWorkspaceOwner(request, admin, payload.workspaceId)) return Response.json({ error: 'owner_auth_required' }, { status: 403 });

    if (payload.action === 'mode') {
      if (payload.mode !== 'app' && payload.mode !== 'telegram') return Response.json({ error: 'invalid_mode' }, { status: 400 });
      const { data, error } = await admin.from('telegram_connections').update({ delivery_mode: payload.mode, updated_at: new Date().toISOString() }).eq('workspace_id', payload.workspaceId).select('workspace_id').maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: 'telegram_not_connected' }, { status: 409 });
      return Response.json({ ok: true, mode: payload.mode });
    }

    if (payload.action === 'pair') {
      const pairingCode = randomBytes(8).toString('hex');
      const { data, error } = await admin.from('telegram_connections').update({ pairing_code_hash: hashSecret(pairingCode), pairing_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq('workspace_id', payload.workspaceId).select('bot_username').maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: 'telegram_not_connected' }, { status: 409 });
      return Response.json({ ok: true, pairingCode, botUsername: data.bot_username, expiresMinutes: 15 }, { headers: { 'cache-control': 'no-store' } });
    }

    if (payload.action !== 'connect' || typeof payload.botToken !== 'string' || !/^\d{5,20}:[A-Za-z0-9_-]{30,160}$/.test(payload.botToken)) {
      return Response.json({ error: 'invalid_bot_token' }, { status: 400 });
    }
    const botToken = payload.botToken;
    const bot = await telegramApi<{ id: number; username?: string; is_bot: boolean }>(botToken, 'getMe');
    if (!bot.is_bot || !bot.username || !Number.isSafeInteger(bot.id)) return Response.json({ error: 'invalid_bot' }, { status: 400 });
    const { data: claimed } = await admin.from('telegram_connections').select('workspace_id').eq('bot_id', bot.id).maybeSingle();
    if (claimed && claimed.workspace_id !== payload.workspaceId) return Response.json({ error: 'bot_already_connected' }, { status: 409 });
    const { data: previous, error: previousError } = await admin.from('telegram_connections').select('*').eq('workspace_id', payload.workspaceId).maybeSingle();
    if (previousError) throw previousError;
    const pairingCode = randomBytes(8).toString('hex');
    const webhookSecret = randomBytes(32).toString('base64url');
    const { error: saveError } = await admin.from('telegram_connections').upsert({
      workspace_id: payload.workspaceId, bot_id: bot.id, bot_username: bot.username,
      token_encrypted: encryptBotToken(botToken), webhook_secret_hash: hashSecret(webhookSecret),
      chat_id: null, pairing_code_hash: hashSecret(pairingCode), pairing_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      delivery_mode: 'telegram', updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });
    if (saveError) throw saveError;
    try {
      await telegramApi<boolean>(botToken, 'setWebhook', { url: telegramWebhookUrl(payload.workspaceId), secret_token: webhookSecret, allowed_updates: ['message'] });
    } catch {
      if (previous) await admin.from('telegram_connections').upsert(previous, { onConflict: 'workspace_id' });
      else await admin.from('telegram_connections').delete().eq('workspace_id', payload.workspaceId);
      return Response.json({ error: 'webhook_setup_failed' }, { status: 502 });
    }
    if (previous && previous.bot_id !== bot.id) {
      try { await telegramApi<boolean>(decryptBotToken(previous.token_encrypted), 'deleteWebhook'); } catch { /* old bot no longer authenticates this workspace */ }
    }
    return Response.json({ connected: true, paired: false, botUsername: bot.username, pairingCode, expiresMinutes: 15 }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return serverError(error); }
}

export async function DELETE(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get('workspaceId');
  if (!isUuid(workspaceId)) return Response.json({ error: 'workspace_id_required' }, { status: 400 });
  try {
    const admin = getTelegramAdmin();
    if (!await requireWorkspaceOwner(request, admin, workspaceId)) return Response.json({ error: 'owner_auth_required' }, { status: 403 });
    const { data } = await admin.from('telegram_connections').select('*').eq('workspace_id', workspaceId).maybeSingle();
    if (!data) return Response.json({ ok: true });
    const connection = data as TelegramConnection;
    await telegramApi<boolean>(decryptBotToken(connection.token_encrypted), 'deleteWebhook');
    const { error } = await admin.from('telegram_connections').delete().eq('workspace_id', workspaceId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) { return serverError(error); }
}

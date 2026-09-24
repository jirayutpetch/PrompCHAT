import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type TelegramConnection = {
  workspace_id: string;
  bot_id: number;
  bot_username: string;
  token_encrypted: string;
  webhook_secret_hash: string;
  chat_id: number | null;
  pairing_code_hash: string | null;
  pairing_expires_at: string | null;
  delivery_mode: 'app' | 'telegram';
};

export function getTelegramAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.PROMPCHAT_TELEGRAM_ENCRYPTION_KEY) throw new Error('telegram_server_not_configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function encryptionKey() {
  const raw = process.env.PROMPCHAT_TELEGRAM_ENCRYPTION_KEY || '';
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('telegram_encryption_key_invalid');
  return key;
}

export function encryptBotToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptBotToken(value: string) {
  const [version, ivPart, tagPart, cipherPart] = value.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !cipherPart) throw new Error('telegram_token_format_invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(cipherPart, 'base64url')), decipher.final()]).toString('utf8');
}

export function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function matchesSecret(value: string, storedHash: string) {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value) || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(hashSecret(value), 'hex'), Buffer.from(storedHash, 'hex'));
}

export async function requireWorkspaceOwner(request: Request, admin: SupabaseClient, workspaceId: string) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !auth.user || auth.user.is_anonymous) return null;
  const { data: workspace } = await admin.from('workspaces').select('id,owner_id,name').eq('id', workspaceId).single();
  if (!workspace || workspace.owner_id !== auth.user.id) return null;
  return { user: auth.user, workspace };
}

export async function readBoundedJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new Error('request_too_large');
  if (!request.body) throw new Error('invalid_json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('request_too_large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') throw error;
    throw new Error('invalid_json');
  } finally { reader.releaseLock(); }
}

export async function telegramApi<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok || payload.result === undefined) throw new Error(payload.description || `telegram_${method}_failed`);
  return payload.result;
}

export function telegramWebhookUrl(workspaceId: string) {
  const origin = process.env.PROMPCHAT_PUBLIC_ORIGIN || 'https://prompchat.vercel.app';
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) throw new Error('telegram_public_origin_invalid');
  return `${origin}/api/telegram/webhook/${workspaceId}`;
}

import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function validPublicDomain(value: string) {
  const hostname = value.trim().toLowerCase();
  if (hostname.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) return false;
  return !hostname.endsWith('.localhost') && !hostname.endsWith('.local') && !hostname.endsWith('.internal');
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ verified: false, reason: 'supabase_not_configured' }, { status: 503 });
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ verified: false, reason: 'authentication_required' }, { status: 401 });
  const { embedKey } = await request.json() as { embedKey?: string };
  if (!embedKey || embedKey.length > 100) return Response.json({ verified: false, reason: 'embed_key_required' }, { status: 400 });
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: workspace, error } = await supabase.from('workspaces').select('id,domain,embed_key').eq('embed_key', embedKey).single();
  if (error || !workspace) return Response.json({ verified: false, reason: 'workspace_not_found' }, { status: 404 });
  if (!validPublicDomain(workspace.domain)) return Response.json({ verified: false, reason: 'invalid_public_domain' }, { status: 400 });
  const target = `https://${workspace.domain}/`;
  try {
    const response = await fetch(target, { headers: { 'user-agent': 'PromptCHAT-installation-check/1.0' }, redirect: 'error', signal: AbortSignal.timeout(7000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return Response.json({ verified: false, reason: 'page_unavailable', status: response.status });
    const html = (await response.text()).slice(0, 1_000_000);
    const verified = html.includes(`data-promptchat-workspace="${embedKey}"`) || html.includes(`data-workspace="${embedKey}"`);
    if (verified) await supabase.from('workspaces').update({ domain_verified: true }).eq('id', workspace.id);
    return Response.json({ verified, checkedUrl: target });
  } catch {
    return Response.json({ verified: false, reason: 'fetch_failed' }, { status: 502 });
  }
}

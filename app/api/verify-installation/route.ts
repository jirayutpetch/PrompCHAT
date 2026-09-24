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
    const response = await fetch(target, { headers: { 'user-agent': 'PrompCHAT-installation-check/1.0' }, redirect: 'error', signal: AbortSignal.timeout(7000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return Response.json({ verified: false, reason: 'page_unavailable', message: `เว็บไซต์ตอบกลับ HTTP ${response.status} หรือไม่ใช่หน้า HTML`, checkedUrl: target });
    const html = (await response.text()).slice(0, 1_000_000);
    const verified = html.includes(`data-prompchat-workspace="${embedKey}"`) || html.includes(`data-promptchat-workspace="${embedKey}"`) || html.includes(`data-workspace="${embedKey}"`);
    const csp = [response.headers.get('content-security-policy') || '', ...Array.from(html.matchAll(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]+content=["']([^"']*)["'][^>]*>/gi), (match) => match[1])].join('; ');
    const directives = new Map(csp.toLowerCase().split(';').map((item) => item.trim().split(/\s+/)).filter((parts) => parts.length > 1).map((parts) => [parts[0], parts.slice(1)]));
    const hostAllowed = (sources?: string[]) => !sources || sources.includes('*') || sources.some((source) => source.includes('prompchat.vercel.app') || source === 'https:');
    const scriptSources = directives.get('script-src') || directives.get('default-src');
    const frameSources = directives.get('frame-src') || directives.get('child-src') || directives.get('default-src');
    const cspBlocksScript = !!scriptSources && !hostAllowed(scriptSources);
    const cspBlocksFrame = !!frameSources && !hostAllowed(frameSources);
    let robotsBlocksRoot = false;
    try {
      const robots = await fetch(`https://${workspace.domain}/robots.txt`, { headers: { 'user-agent': 'PrompCHAT-installation-check/1.0' }, redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (robots.ok) {
        const body = (await robots.text()).slice(0, 100_000);
        robotsBlocksRoot = /user-agent:\s*\*[^]*?disallow:\s*\/\s*(?:\r?\n|$)/i.test(body);
      }
    } catch { /* robots.txt is optional */ }
    const issues = [
      ...(!verified ? ['ไม่พบ script หรือ public embed ID ของ workspace ใน HTML ที่เผยแพร่'] : []),
      ...(cspBlocksScript ? ["CSP อาจบล็อกสคริปต์: เพิ่ม https://prompchat.vercel.app ใน script-src"] : []),
      ...(cspBlocksFrame ? ["CSP อาจบล็อกหน้าต่างแชต: เพิ่ม https://prompchat.vercel.app ใน frame-src"] : []),
      ...(robotsBlocksRoot ? ['robots.txt ปิดกั้นหน้าเว็บทั้งเว็บ ทำให้บอทตรวจจับเทคโนโลยีเข้าไม่ถึง'] : []),
    ];
    const ready = verified && !cspBlocksScript && !cspBlocksFrame;
    if (ready) await supabase.from('workspaces').update({ domain_verified: true }).eq('id', workspace.id);
    return Response.json({ verified: ready, scriptFound: verified, checkedUrl: target, csp: { scriptBlocked: cspBlocksScript, frameBlocked: cspBlocksFrame }, robotsBlocksRoot, issues, message: issues.join(' · ') || 'พบโค้ดติดตั้งและไม่พบ CSP ที่ขวางการทำงาน' });
  } catch {
    return Response.json({ verified: false, reason: 'fetch_failed' }, { status: 502 });
  }
}

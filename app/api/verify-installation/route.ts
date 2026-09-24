import { createClient } from '@supabase/supabase-js';
import { getPublicHttps } from '../../../lib/publicHttps.ts';
import { inspectWidgetMarkup } from '../../../lib/widgetMarkup.ts';

export const runtime = 'nodejs';
const MAX_REQUEST_BYTES = 8192;

async function readBoundedJson(request: Request): Promise<{ value?: unknown; tooLarge: boolean; invalid: boolean }> {
  if (!request.body) return { tooLarge: false, invalid: true };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { tooLarge: true, invalid: false };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { value: JSON.parse(new TextDecoder().decode(bytes)), tooLarge: false, invalid: false };
  } catch {
    return { tooLarge: false, invalid: true };
  } finally {
    reader.releaseLock();
  }
}

function validPublicDomain(value: string) {
  const hostname = value.trim().toLowerCase();
  if (hostname.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) return false;
  return !hostname.endsWith('.localhost') && !hostname.endsWith('.local') && !hostname.endsWith('.internal');
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) return Response.json({ verified: false, reason: 'request_too_large' }, { status: 413 });
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ verified: false, reason: 'authentication_required' }, { status: 401 });
  const parsed = await readBoundedJson(request);
  if (parsed.tooLarge) return Response.json({ verified: false, reason: 'request_too_large' }, { status: 413 });
  if (parsed.invalid) return Response.json({ verified: false, reason: 'invalid_json' }, { status: 400 });
  const payload = parsed.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ verified: false, reason: 'supabase_not_configured' }, { status: 503 });
  const prompchatOrigin = new URL(request.url).origin;
  const embedKey = typeof payload === 'object' && payload !== null && 'embedKey' in payload && typeof payload.embedKey === 'string'
    ? payload.embedKey.trim()
    : '';
  if (!embedKey || embedKey.length > 100) return Response.json({ verified: false, reason: 'embed_key_required' }, { status: 400 });
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: workspace, error } = await supabase.from('workspaces').select('id,domain,embed_key').eq('embed_key', embedKey).single();
  if (error || !workspace) return Response.json({ verified: false, reason: 'workspace_not_found' }, { status: 404 });
  if (!validPublicDomain(workspace.domain)) return Response.json({ verified: false, reason: 'invalid_public_domain' }, { status: 400 });
  const target = `https://${workspace.domain}/`;
  try {
    const response = await getPublicHttps(workspace.domain, '/', 1_000_000, 4500);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      let redirectedTo = target;
      try { if (location) redirectedTo = new URL(Array.isArray(location) ? location[0] : location, target).toString(); } catch { /* keep the checked URL */ }
      return Response.json({ verified: false, reason: 'domain_redirect', checkedUrl: target, redirectedTo, message: `โดเมนนี้ redirect ไป ${redirectedTo} กรุณาใช้ hostname ปลายทางนั้นใน workspace แล้วติดตั้งโค้ดซ้ำ` });
    }
    const contentType = response.headers['content-type'];
    if (response.status < 200 || response.status >= 300 || !String(contentType || '').includes('text/html')) return Response.json({ verified: false, reason: 'page_unavailable', message: `เว็บไซต์ตอบกลับ HTTP ${response.status} หรือไม่ใช่หน้า HTML`, checkedUrl: target });
    const html = response.body;
    const { embedIdFound, scriptFound: verified, domainMismatch, wrongScriptSource } = inspectWidgetMarkup(html, embedKey, prompchatOrigin, workspace.domain);
    const readAttributes = (tag: string) => new Map(Array.from(tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g), (match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '']));
    const metaCsp = Array.from(html.matchAll(/<meta\b[^>]*>/gi), (match) => readAttributes(match[0]))
      .filter((attrs) => attrs.get('http-equiv')?.toLowerCase() === 'content-security-policy')
      .map((attrs) => attrs.get('content') || '');
    const cspPolicies: Map<string, string[]>[] = [String(response.headers['content-security-policy'] || ''), ...metaCsp].filter(Boolean).map((policy) =>
      new Map<string, string[]>(policy.toLowerCase().split(';').map((item) => item.trim().split(/\s+/)).filter((parts) => parts.length > 1).map((parts) => [parts[0], parts.slice(1)])),
    );
    const hostAllowed = (sources?: string[]) => !sources || sources.includes('*') || sources.some((source) => {
      if (source === 'https:') return true;
      try {
        const actual = new URL(prompchatOrigin);
        const allowed = new URL(source.includes('://') ? source : `https://${source}`);
        if (allowed.protocol !== actual.protocol) return false;
        const allowedHost = allowed.hostname;
        const hostMatches = allowedHost.startsWith('*.')
          ? actual.hostname.endsWith(`.${allowedHost.slice(2)}`)
          : allowedHost === actual.hostname;
        return hostMatches && (!allowed.port || allowed.port === actual.port);
      } catch { return false; }
    });
    const cspBlocksScript = cspPolicies.some((policy) => !hostAllowed(policy.get('script-src-elem') || policy.get('script-src') || policy.get('default-src')));
    const cspBlocksFrame = cspPolicies.some((policy) => !hostAllowed(policy.get('frame-src') || policy.get('child-src') || policy.get('default-src')));
    let robotsBlocksRoot = false;
    try {
      const robots = await getPublicHttps(workspace.domain, '/robots.txt', 100_000, 1500);
      if (robots.status >= 200 && robots.status < 300) {
        robotsBlocksRoot = /user-agent:\s*\*[^]*?disallow:\s*\/\s*(?:\r?\n|$)/i.test(robots.body);
      }
    } catch { /* robots.txt is optional */ }
    const issues = [
      ...(domainMismatch ? [`โดเมนใน data-prompchat-domain ไม่ตรงกับ workspace (${workspace.domain})`] : []),
      ...(wrongScriptSource ? ['พบ embed ID แต่ src ไม่ได้ชี้ไปยังไฟล์ PrompCHAT /widget.js'] : []),
      ...(!embedIdFound ? ['ไม่พบ public embed ID ของ workspace ใน HTML ที่เผยแพร่ ตรวจว่าใช้โค้ดจาก workspace นี้และเผยแพร่แล้ว'] : []),
      ...(cspBlocksScript ? [`CSP อาจบล็อกสคริปต์: เพิ่ม ${prompchatOrigin} ใน script-src`] : []),
      ...(cspBlocksFrame ? [`CSP อาจบล็อกหน้าต่างแชต: เพิ่ม ${prompchatOrigin} ใน frame-src`] : []),
      ...(robotsBlocksRoot ? ['robots.txt ปิดกั้นหน้าเว็บทั้งเว็บ ทำให้บอทตรวจจับเทคโนโลยีเข้าไม่ถึง'] : []),
    ];
    const ready = verified && !domainMismatch && !cspBlocksScript && !cspBlocksFrame;
    if (ready) {
      const { error: updateError } = await supabase.from('workspaces').update({ domain_verified: true }).eq('id', workspace.id);
      if (updateError) return Response.json({ verified: false, reason: 'verification_could_not_be_saved', message: 'ตรวจพบโค้ดแล้ว แต่บันทึกสถานะยืนยันโดเมนไม่ได้ ตรวจสิทธิ์ workspace แล้วลองอีกครั้ง' }, { status: 500 });
    }
    return Response.json({ verified: ready, embedIdFound, scriptFound: verified, domainMismatch, wrongScriptSource, checkedUrl: target, csp: { scriptBlocked: cspBlocksScript, frameBlocked: cspBlocksFrame }, robotsBlocksRoot, issues, message: issues.join(' · ') || 'พบโค้ดติดตั้งและไม่พบ CSP ที่ขวางการทำงาน' });
  } catch (failure) {
    if (failure instanceof Error && failure.message === 'non_public_target') return Response.json({ verified: false, reason: 'unsafe_dns_target', message: 'โดเมนนี้ชี้ไปยัง IP ภายในหรือ IP ที่ไม่ใช่ public จึงยกเลิกการตรวจเพื่อความปลอดภัย' }, { status: 400 });
    if (failure instanceof Error && (failure as NodeJS.ErrnoException).code === 'ETIMEDOUT') return Response.json({ verified: false, reason: 'site_timeout', message: 'เว็บไซต์ใช้เวลาตอบกลับนานเกินไป ลองตรวจอีกครั้งเมื่อเว็บไซต์ออนไลน์' }, { status: 504 });
    return Response.json({ verified: false, reason: 'fetch_failed', message: 'เชื่อมต่อเว็บไซต์ไม่ได้ ตรวจ DNS, HTTPS หรือ firewall แล้วลองใหม่' }, { status: 502 });
  }
}

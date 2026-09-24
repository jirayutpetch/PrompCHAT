export const runtime = 'edge';

export function GET() {
  return Response.json({ ok: true, service: 'PrompCHAT', version: '1.0.0' });
}

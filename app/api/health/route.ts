export const runtime = 'edge';

export function GET() {
  return Response.json({ ok: true, service: 'promptchat', version: '1.0.0' });
}

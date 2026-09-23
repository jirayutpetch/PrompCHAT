import { NextRequest } from 'next/server';

export const runtime = 'edge';

type Trigger = { keywords: string[]; reply_text: string; match_type?: 'contains' | 'exact' };

export async function POST(request: NextRequest) {
  const { message, handoffKeyword = 'คุยกับแอดมิน', triggers = [] } = await request.json() as { message?: string; handoffKeyword?: string; triggers?: Trigger[] };
  const text = String(message || '').trim();
  if (!text) return Response.json({ handledBy: 'none', reply: null }, { status: 400 });
  if (text.toLowerCase().includes(handoffKeyword.toLowerCase())) return Response.json({ handledBy: 'agent', reply: null });
  const matched = triggers.find((trigger) => trigger.match_type === 'exact' ? trigger.keywords.some((keyword) => text.toLowerCase() === keyword.toLowerCase()) : trigger.keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase())));
  if (matched) return Response.json({ handledBy: 'bot', reply: matched.reply_text });
  return Response.json({ handledBy: 'none', reply: null });
}

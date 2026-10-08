import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/env';
const schema = z.object({ request_id: z.string().min(1), status: z.enum(['queued','in_progress','completed','failed']), video: z.object({ url: z.string().url() }).optional(), error: z.string().optional() }).passthrough();
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!env.FAL_WEBHOOK_SECRET || url.searchParams.get('token') !== env.FAL_WEBHOOK_SECRET) return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 });
  if (env.PROVIDERS_MODE !== 'live') return NextResponse.json({ received: true, ignored: true });
  // Do not trust callbacks until request identity, provider signature, and persisted-state idempotency are configured.
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Notification fal invalide.' }, { status: 400 });
  return NextResponse.json({ error: 'Traitement des notifications live non configuré.' }, { status: 503 });
}

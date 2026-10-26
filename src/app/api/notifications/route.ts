import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, HttpError } from '@/core/auth/guards';
import { createSupabaseServerClient } from '@/core/supabase/server';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';

export async function GET() {
  try {
    const actor = await getActor();
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ notifications: [], unread: 0 });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('notifications').select('id,type,message,version_id,read_at,created_at').eq('user_id', actor.id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return NextResponse.json({ notifications: data ?? [], unread: (data ?? []).filter((item) => !item.read_at).length });
  } catch (error) { return errorResponse(error); }
}

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50).optional() }).strict();

/** Marks as read all the notifications of the user, or only `ids` (banner « Voir le plan »). */
export async function PATCH(request: Request) {
  try {
    const actor = await getActor();
    const parsed = markReadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, 'Notifications invalides.');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ ok: true });
    const admin = createStorageAdminClient();
    let query = admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', actor.id).is('read_at', null);
    if (parsed.data.ids) query = query.in('id', parsed.data.ids);
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

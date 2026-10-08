import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireRole, HttpError } from '@/core/auth/guards';
import { createSupabaseServerClient } from '@/core/supabase/server';
const schema = z.object({ status: z.enum(['validée','rejetée']), reason: z.string().trim().max(1000).optional() }).superRefine((v, ctx) => { if (v.status === 'rejetée' && !v.reason?.trim()) ctx.addIssue({ code: 'custom', message: 'Un motif est obligatoire en cas de refus.', path: ['reason'] }); });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('assets').update({ status: input.status, review_reason: input.status === 'rejetée' ? input.reason?.trim() ?? null : null }).eq('id', id).select('id,status,review_reason').single();
    if (error) throw new HttpError(404, 'Média introuvable ou impossible à modifier.');
    return NextResponse.json({ ...data, reason: input.reason ?? null });
  } catch (error) { return errorResponse(error); }
}

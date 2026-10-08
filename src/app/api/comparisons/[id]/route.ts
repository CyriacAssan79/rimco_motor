import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireRole } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { updateComparison } from '@/core/comparisons/store';

const schema = z.object({
  modelId: z.string().uuid(),
  ratings: z.object({ fidelity: z.number().int().min(1).max(5), realism: z.number().int().min(1).max(5), brandFit: z.number().int().min(1).max(5) }).strict(),
  comment: z.string().trim().max(1000).default(''),
}).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) {
      const updated = updateComparison(id, (current) => {
        const content = current.brief_json as { results?: Array<Record<string, unknown>> };
        const results = content.results ?? [];
        if (!results.some((result) => result.modelId === input.modelId)) throw new HttpError(404, 'Ce modèle ne fait pas partie de cette comparaison.');
        return { ...current, brief_json: { ...content, results: results.map((result) => result.modelId === input.modelId ? { ...result, ratings: input.ratings, comment: input.comment } : result) } };
      });
      if (!updated) throw new HttpError(404, 'Cette comparaison est introuvable.');
      return NextResponse.json({ comparison: updated });
    }
    const admin = createStorageAdminClient();
    const { data: comparison, error } = await admin.from('comparisons').select('id,user_id,brief_json,created_at').eq('id', id).single();
    if (error || !comparison) throw new HttpError(404, 'Cette comparaison est introuvable.');
    const content = comparison.brief_json as { results?: Array<Record<string, unknown>> };
    const results = content.results ?? [];
    if (!results.some((result) => result.modelId === input.modelId)) throw new HttpError(404, 'Ce modèle ne fait pas partie de cette comparaison.');
    const next = { ...content, results: results.map((result) => result.modelId === input.modelId ? { ...result, ratings: input.ratings, comment: input.comment } : result) };
    const { error: updateError } = await admin.from('comparisons').update({ brief_json: next }).eq('id', id);
    if (updateError) throw new HttpError(503, 'Impossible d’enregistrer la notation. Réessayez.');
    return NextResponse.json({ comparison: { ...comparison, brief_json: next } });
  } catch (error) { return errorResponse(error); }
}

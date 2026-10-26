import { NextResponse } from 'next/server';
import { errorResponse, requireRole } from '@/core/auth/guards';
import { refreshPlaceProposal } from '@/core/assets/place-proposal-live';

export const runtime = 'nodejs';

/** Follows the proposed sheet of an uploaded place (polled by the media library while it is pending). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await context.params;
    return NextResponse.json({ status: await refreshPlaceProposal(id) });
  } catch (error) { return errorResponse(error); }
}

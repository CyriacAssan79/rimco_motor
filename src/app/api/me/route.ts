import { NextResponse } from 'next/server';
import { errorResponse, getActor } from '@/core/auth/guards';

export async function GET() {
  try {
    const actor = await getActor({ allowPasswordChange: true });
    return NextResponse.json({ actor });
  } catch (error) {
    return errorResponse(error);
  }
}

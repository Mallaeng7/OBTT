import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/runtime';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('viewer');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const { state } = getRuntime();
  return NextResponse.json(state.get(Number(id)).team ?? []);
}

import { NextResponse } from 'next/server';
import { steamLoginUrl } from '@/lib/auth/steam';

export function GET() {
  return NextResponse.redirect(steamLoginUrl());
}

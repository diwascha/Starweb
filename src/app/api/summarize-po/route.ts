
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json({ message: 'AI features are disabled.' });
}

export async function POST() {
  return NextResponse.json({ message: 'AI features are disabled.' });
}

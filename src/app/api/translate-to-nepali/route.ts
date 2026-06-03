
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'API routes are not available in static builds.' });
}

export async function POST() {
  return NextResponse.json({ message: 'API routes are not available in static builds.' });
}

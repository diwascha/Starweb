import { NextRequest, NextResponse } from 'next/server';
import { translateToNepali } from '@/ai/flows/translate-to-nepali-flow';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Missing text to translate' }, { status: 400 });
    }

    const result = await translateToNepali(text);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in translate-to-nepali API route:', error);
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: 'Failed to convert text', details: errorMessage }, { status: 500 });
  }
}

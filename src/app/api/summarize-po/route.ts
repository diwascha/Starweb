
import { NextRequest, NextResponse } from 'next/server';
import { summarizePurchaseOrderChanges } from '@/ai/flows/summarize-po-changes-flow';

export async function POST(req: NextRequest) {
  try {
    const { originalPO, updatedPO } = await req.json();

    if (!originalPO || !updatedPO) {
      return NextResponse.json({ error: 'Missing purchase order data' }, { status: 400 });
    }

    const result = await summarizePurchaseOrderChanges(originalPO, updatedPO);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in summarize-po API route:', error);
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: 'Failed to summarize changes', details: errorMessage }, { status: 500 });
  }
}

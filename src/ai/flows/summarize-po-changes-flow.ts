'use server';
import "server-only";
/**
 * @fileOverview An AI flow to summarize changes between two versions of a purchase order.
 *
 * - summarizePurchaseOrderChanges - A function that handles the summarization process.
 * - SummarizePurchaseOrderChangesInput - The input type for the function.
 * - SummarizePurchaseOrderChangesOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { PurchaseOrder, PurchaseOrderItem } from '@/lib/types';

// Define a simpler schema for the prompt input to be more efficient
const PurchaseOrderItemSchema = z.object({
  rawMaterialName: z.string(),
  quantity: z.string(),
  unit: z.string(),
});

const PurchaseOrderSchema = z.object({
  poNumber: z.string(),
  poDate: z.string(),
  companyName: z.string(),
  items: z.array(PurchaseOrderItemSchema),
});

const SummarizePurchaseOrderChangesInputSchema = z.object({
  originalPO: PurchaseOrderSchema.describe('The original version of the purchase order.'),
  updatedPO: PurchaseOrderSchema.describe('The updated version of the purchase order.'),
});

const SummarizePurchaseOrderChangesOutputSchema = z.object({
  summary: z.string().describe('A concise, human-readable summary of the changes.'),
});

export type SummarizePurchaseOrderChangesInput = z.infer<typeof SummarizePurchaseOrderChangesInputSchema>;
export type SummarizePurchaseOrderChangesOutput = z.infer<typeof SummarizePurchaseOrderChangesOutputSchema>;

function toPromptData(po: PurchaseOrder): z.infer<typeof PurchaseOrderSchema> {
  return {
    poNumber: po.poNumber,
    poDate: new Date(po.poDate).toLocaleDateString('en-CA'),
    companyName: po.companyName,
    items: po.items.map(item => ({
      rawMaterialName: item.rawMaterialName,
      quantity: item.quantity,
      unit: item.unit || 'N/A', // Handle cases where unit might be missing in old data
    })),
  };
}

export async function summarizePurchaseOrderChanges(
  originalPO: PurchaseOrder,
  updatedPO: PurchaseOrder
): Promise<SummarizePurchaseOrderChangesOutput> {
  const input = {
    originalPO: toPromptData(originalPO),
    updatedPO: toPromptData(updatedPO),
  };
  return summarizeChangesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizePurchaseOrderChangesPrompt',
  input: { schema: SummarizePurchaseOrderChangesInputSchema },
  output: { schema: SummarizePurchaseOrderChangesOutputSchema },
  prompt: `You are an expert inventory manager. Your task is to compare two versions of a Purchase Order and provide a concise, human-readable summary of the changes.

Focus on what was added, removed, or changed. Do not mention parts that are identical. Be clear and brief.

Original Purchase Order:
- PO Number: {{{originalPO.poNumber}}}
- Date: {{{originalPO.poDate}}}
- Company: {{{originalPO.companyName}}}
- Items:
  {{#each originalPO.items}}
  - {{this.rawMaterialName}}: {{this.quantity}} {{this.unit}}
  {{/each}}

Updated Purchase Order:
- PO Number: {{{updatedPO.poNumber}}}
- Date: {{{updatedPO.date}}}
- Company: {{{updatedPO.companyName}}}
- Items:
  {{#each updatedPO.items}}
  - {{this.rawMaterialName}}: {{this.quantity}} {{this.unit}}
  {{/each}}

Please generate a summary of the changes.`,
});

const summarizeChangesFlow = ai.defineFlow(
  {
    name: 'summarizeChangesFlow',
    inputSchema: SummarizePurchaseOrderChangesInputSchema,
    outputSchema: SummarizePurchaseOrderChangesOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);

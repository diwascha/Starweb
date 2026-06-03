
/**
 * @fileOverview An AI flow to translate/transliterate English company names to Nepali Unicode.
 *
 * - translateToNepali - A function that handles the translation process.
 * - TranslateToNepaliInput - The input type for the function.
 * - TranslateToNepaliOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const TranslateToNepaliInputSchema = z.object({
  text: z.string().describe('The English text (company name) to convert to Nepali.'),
});

const TranslateToNepaliOutputSchema = z.object({
  nepaliText: z.string().describe('The converted Nepali Unicode text.'),
});

export type TranslateToNepaliInput = z.infer<typeof TranslateToNepaliInputSchema>;
export type TranslateToNepaliOutput = z.infer<typeof TranslateToNepaliOutputSchema>;

const prompt = ai.definePrompt({
  name: 'translateToNepaliPrompt',
  input: { schema: TranslateToNepaliInputSchema },
  output: { schema: TranslateToNepaliOutputSchema },
  prompt: `You are an expert in English-to-Nepali transliteration and translation, specializing in business and legal names.

Convert the following English text into its official or natural-sounding Nepali Unicode equivalent. If it's a company name, ensure it sounds professional and follows common Nepali naming conventions (e.g., "Industry" becomes "इन्डस्ट्रिज", "Private Limited" becomes "प्रा.लि.").

English Text: {{{text}}}

Please return only the Nepali Unicode text.`,
});

export async function translateToNepali(text: string): Promise<TranslateToNepaliOutput> {
  // Handle client-side environment gracefully during static export
  if (typeof window !== 'undefined') {
    return { nepaliText: text };
  }
  return translateToNepaliFlow({ text });
}

const translateToNepaliFlow = ai.defineFlow(
  {
    name: 'translateToNepaliFlow',
    inputSchema: TranslateToNepaliInputSchema,
    outputSchema: TranslateToNepaliOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);

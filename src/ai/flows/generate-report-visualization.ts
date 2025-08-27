// src/ai/flows/generate-report-visualization.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow to generate a data visualization based on test report data.
 *
 * - generateReportVisualization - A function that generates a visualization suggestion for the test report.
 * - GenerateReportVisualizationInput - The input type for the generateReportVisualization function.
 * - GenerateReportVisualizationOutput - The return type for the generateReportVisualization function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateReportVisualizationInputSchema = z.object({
  testData: z.record(z.string(), z.any()).describe('Test data for the product.'),
  productName: z.string().describe('The name of the product being tested.'),
});
export type GenerateReportVisualizationInput = z.infer<typeof GenerateReportVisualizationInputSchema>;

const GenerateReportVisualizationOutputSchema = z.object({
  visualizationType: z.string().describe('The recommended type of data visualization (e.g., bar chart, line graph, pie chart).'),
  reasoning: z.string().describe('The AI reasoning behind the visualization suggestion.'),
});
export type GenerateReportVisualizationOutput = z.infer<typeof GenerateReportVisualizationOutputSchema>;

export async function generateReportVisualization(input: GenerateReportVisualizationInput): Promise<GenerateReportVisualizationOutput> {
  return generateReportVisualizationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateReportVisualizationPrompt',
  input: {schema: GenerateReportVisualizationInputSchema},
  output: {schema: GenerateReportVisualizationOutputSchema},
  prompt: `You are an expert in data visualization. Given the following test data for the product "{{productName}}", recommend the most appropriate type of data visualization to effectively present the results.

Test Data:
{{#each testData}}
  {{@key}}: {{this}}
{{/each}}

Consider the data types and the relationships between different parameters. Explain your reasoning.

Respond with the recommended visualization type (e.g., bar chart, line graph, scatter plot) and a brief explanation of why it is suitable for this data.
`, 
});

const generateReportVisualizationFlow = ai.defineFlow(
  {
    name: 'generateReportVisualizationFlow',
    inputSchema: GenerateReportVisualizationInputSchema,
    outputSchema: GenerateReportVisualizationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

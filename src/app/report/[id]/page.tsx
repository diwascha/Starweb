import { redirect } from 'next/navigation';

/**
 * @fileOverview LEGACY ROUTE COMPATIBILITY LAYER
 * Next.js static export requires every dynamic path [id] to be pre-defined.
 * Since we use dynamic IDs from Firestore, we move the actual logic to a 
 * static search-param route (/report/view/?id=...) which builds successfully.
 * This file stays to satisfy the compiler and redirect any legacy deep-links.
 */

export function generateStaticParams() {
  // Satisfy Next.js "output: export" requirement by providing a dummy path
  return [{ id: 'pre-generated-manifest' }];
}

export default async function LegacyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Permanent redirection to the build-compliant search-param route
  redirect(`/report/view/?id=${id}`);
}

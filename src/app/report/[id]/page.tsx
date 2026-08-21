import { redirect } from 'next/navigation';

/**
 * @fileOverview Placeholder for the legacy dynamic report route.
 * Next.js static export requires dynamic segments to have generateStaticParams.
 * Real viewing logic has moved to /report/view/?id=...
 */

export function generateStaticParams() {
  // Return a dummy ID to satisfy the build system for static export
  return [{ id: 'legacy' }];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Gracefully redirect any legacy links to the new search-param based route
  redirect(`/report/view/?id=${id}`);
}

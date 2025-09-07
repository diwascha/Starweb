'use client';
export const runtime = 'nodejs';

import ReportView from './_components/report-view';
import { use } from 'react';

// This is a Server Component that fetches initial data
export default function ReportPage({ params }: { params: { id: string } }) {
  const initialReport = use(getReport(params.id));

  if (!initialReport) {
    return <div>Report not found.</div>;
  }
  
  return <ReportView initialReport={initialReport} />;
}

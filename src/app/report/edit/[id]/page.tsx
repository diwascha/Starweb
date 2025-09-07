'use client';
export const runtime = 'nodejs';

import { ReportForm } from '@/app/report/new/_components/report-form';
import { getReport } from '@/services/report-service';
import { use } from 'react';

// This is a Server Component that fetches initial data
export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const initialReport = use(getReport(id));

  if (!initialReport) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={initialReport} />;
}

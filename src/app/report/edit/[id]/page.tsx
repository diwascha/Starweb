export const runtime = 'edge';

'use client';

import { ReportForm } from '@/app/report/new/_components/report-form';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report } from '@/lib/types';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function EditReportPage() {
  const params = useParams();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [reports] = useLocalStorage<Report[]>('reports', []);
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      const foundReport = reports.find(r => r.id === reportId);
      setReport(foundReport || null);
    }
    setIsLoading(false);
  }, [reportId, reports]);

  if (isLoading) {
    return <div>Loading report...</div>;
  }

  if (!report) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={report} />;
}

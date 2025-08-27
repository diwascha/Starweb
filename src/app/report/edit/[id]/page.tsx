'use client';

import { ReportForm } from '@/app/report/new/_components/report-form';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report } from '@/lib/types';
import { useEffect, useState } from 'react';

export default function EditReportPage({ params }: { params: { id: string } }) {
  const [reports] = useLocalStorage<Report[]>('reports', []);
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const foundReport = reports.find(r => r.id === params.id);
    setReport(foundReport || null);
    setIsLoading(false);
  }, [params.id, reports]);

  if (isLoading) {
    return <div>Loading report...</div>;
  }

  if (!report) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={report} />;
}

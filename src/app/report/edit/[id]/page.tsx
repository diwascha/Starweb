
'use client';

import { ReportForm } from '@/app/report/new/_components/report-form';
import type { Report } from '@/lib/types';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getReport } from '@/services/report-service';

export default function EditReportPage() {
  const params = useParams();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      getReport(reportId).then(foundReport => {
        setReport(foundReport);
        setIsLoading(false);
      });
    }
  }, [reportId]);

  if (isLoading) {
    return <div>Loading report...</div>;
  }

  if (!report) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={report} />;
}

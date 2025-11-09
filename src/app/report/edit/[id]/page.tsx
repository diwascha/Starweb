
'use client';
import { ReportForm } from '@/app/report/new/_components/report-form';
import { getReport } from '@/services/report-service';
import { useEffect, useState } from 'react';
import type { Report } from '@/lib/types';


export default function EditReportPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReport(id).then(data => {
      setReport(data);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <div>Loading report...</div>;
  }

  if (!report) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={report} />;
}

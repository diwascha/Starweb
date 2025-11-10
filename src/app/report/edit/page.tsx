
'use client';
import { ReportForm } from '@/app/report/new/_components/report-form';
import { getReport } from '@/services/report-service';
import { useEffect, useState, Suspense } from 'react';
import type { Report } from '@/lib/types';
import { useSearchParams } from 'next/navigation';

function EditReportComponent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getReport(id).then(data => {
        setReport(data);
        setLoading(false);
      });
    } else {
        setLoading(false);
    }
  }, [id]);

  if (loading) {
    return <div>Loading report...</div>;
  }

  if (!id) {
      return <div>No report ID provided.</div>;
  }

  if (!report) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={report} />;
}


export default function EditReportPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <EditReportComponent />
        </Suspense>
    )
}

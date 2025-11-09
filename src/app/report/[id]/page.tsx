
'use client';
import ReportView from './_components/report-view';
import { getReport } from '@/services/report-service';
import { useEffect, useState } from 'react';
import type { Report } from '@/lib/types';

export default function ReportPage({ params }: { params: { id: string } }) {
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
    return (
        <div className="flex justify-center items-center h-full">
            <p>Report not found.</p>
        </div>
    );
  }
  
  return <ReportView initialReport={report} />;
}

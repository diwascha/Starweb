'use client';

import { useEffect, useState } from 'react';
import ReportView from './_components/report-view';
import { getReport } from '@/services/report-service';
import type { Report } from '@/lib/types';


export default function ReportPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchReport() {
      setIsLoading(true);
      const reportData = await getReport(id);
      setReport(reportData);
      setIsLoading(false);
    }
    fetchReport();
  }, [id]);

  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <p>Loading report...</p>
        </div>
    );
  }

  if (!report) {
    return <div>Report not found.</div>;
  }
  
  return <ReportView initialReport={report} />;
}

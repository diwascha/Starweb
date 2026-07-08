'use client';

import ReportView from './[id]/_components/report-view';
import { getReport } from '@/services/report-service';
import { useEffect, useState, Suspense, use } from 'react';
import type { Report } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

function ReportViewComponent(props: { params: Promise<any>, searchParams: Promise<any> }) {
  // Next.js 15: Unwrap dynamic params and searchParams
  use(props.params);
  const searchParams = use(props.searchParams);
  
  const id = searchParams.id;
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
    return <div className="p-8 text-center">Loading report...</div>;
  }

  if (!id) {
    return <div className="p-8 text-center">No report ID provided.</div>;
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


export default function ReportPage(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/4" />
                <Skeleton className="h-[80vh] w-full" />
            </div>
        }>
            <ReportViewComponent {...props} />
        </Suspense>
    )
}

'use client';
export const runtime = 'nodejs';

import ReportView from './_components/report-view';
import { use } from 'react';

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ReportView reportId={id} />;
}

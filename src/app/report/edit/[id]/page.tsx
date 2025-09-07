export const runtime = 'nodejs';

import { ReportForm } from '@/app/report/new/_components/report-form';
import { getReport } from '@/services/report-service';

// This is a Server Component that fetches initial data
export default async function EditReportPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialReport = await getReport(id);

  if (!initialReport) {
    return <div>Report not found.</div>;
  }

  return <ReportForm reportToEdit={initialReport} />;
}

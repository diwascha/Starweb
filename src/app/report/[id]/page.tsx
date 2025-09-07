
import ReportView from './_components/report-view';
import { getReport } from '@/services/report-service';

// This is a Server Component that fetches initial data
export default async function ReportPage({ params }: { params: { id: string } }) {
  const initialReport = await getReport(params.id);

  if (!initialReport) {
    return <div>Report not found.</div>;
  }
  
  return <ReportView initialReport={initialReport} />;
}

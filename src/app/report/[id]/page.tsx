
import ReportView from './_components/report-view';
import { getReport, getReports } from '@/services/report-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP === 'true';
  if (!isDesktop) {
    return [];
  }
  const reports = await getReports();
  return reports.map((report) => ({
    id: report.id,
  }));
}

// This is a Server Component that fetches initial data
export default async function ReportPage({ params }: { params: { id: string } }) {
  const initialReport = await getReport(params.id);

  if (!initialReport) {
    return <div>Report not found.</div>;
  }
  
  return <ReportView initialReport={initialReport} />;
}


import ReportView from './_components/report-view';
import { getReport, getReports } from '@/services/report-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const reports = await getReports();
  if (!reports || reports.length === 0) {
    return [];
  }
  return reports.map((report) => ({
    id: report.id,
  }));
}

// This is a Server Component that fetches initial data
export default async function ReportPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const initialReport = await getReport(id);

  if (!initialReport) {
    return (
        <div className="flex justify-center items-center h-full">
            <p>Report not found.</p>
        </div>
    );
  }
  
  return <ReportView initialReport={initialReport} />;
}

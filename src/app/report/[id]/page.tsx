import ReportView from './_components/report-view';
import { getReport, getReports } from '@/services/report-service';

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  const isDesktop = process.env.TAURI_BUILD === 'true';
  if (!isDesktop) {
    return [];
  }
  try {
    const reports = await getReports(true);
    if (!reports || reports.length === 0) {
      return [];
    }
    return reports.map((report) => ({
      id: report.id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for reports:", error);
    return [];
  }
}

// This is a Server Component that fetches initial data
export default async function ReportPage({ params }: { params: { id: string } }) {
  const initialReport = await getReport(params.id);

  if (!initialReport) {
    return <div>Report not found.</div>;
  }
  
  return <ReportView initialReport={initialReport} />;
}

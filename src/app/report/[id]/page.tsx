export const runtime = 'edge';

import ReportView from './_components/report-view';

export default function ReportPage({ params }: { params: { id: string } }) {
  return <ReportView reportId={params.id} />;
}

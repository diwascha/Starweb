import { ReportForm } from './_components/report-form';

export default function NewReportPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create New Test Report</h1>
        <p className="text-muted-foreground">Fill in the details below to generate a new report.</p>
      </div>
      <ReportForm />
    </div>
  );
}

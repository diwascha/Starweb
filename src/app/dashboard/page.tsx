
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
       <header>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">An overview of your test reports and product data.</p>
      </header>
       <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <div className="flex flex-col items-center gap-1 text-center">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <h3 className="text-2xl font-bold tracking-tight">Data Visualization Coming Soon</h3>
          <p className="text-sm text-muted-foreground">This dashboard will soon feature charts and graphs of your test data.</p>
        </div>
      </div>
    </div>
  );
}

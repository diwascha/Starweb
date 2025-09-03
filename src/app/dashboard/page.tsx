
import { Button } from '@/components/ui/button';
import { FileText, PlusCircle } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">An overview of your test reports and product data.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/report/new">
              <PlusCircle className="mr-2 h-4 w-4" /> New Report
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/products">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Product
            </Link>
          </Button>
        </div>
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

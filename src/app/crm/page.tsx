import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calculator, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CrmDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">CRM Dashboard</h1>
            <p className="text-muted-foreground">Customer Relationship Management tools.</p>
        </div>
      </header>
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                New Costing
              </CardTitle>
              <CardDescription>Launch the technical costing engine for a new client requirement.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full">
                    <Link href="/crm/cost-report/calculator">
                        Start Calculator
                    </Link>
                </Button>
            </CardContent>
         </Card>
         <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Saved Reports
              </CardTitle>
              <CardDescription>View, search, and manage historical manufacturing estimates.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild variant="outline" className="w-full">
                    <Link href="/crm/cost-report">
                        View History
                    </Link>
                </Button>
            </CardContent>
         </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                PackSpec
              </CardTitle>
              <CardDescription>Manage the comprehensive packaging specification catalog.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild variant="secondary" className="w-full">
                    <Link href="/crm/pack-spec">
                        Go to PackSpec
                    </Link>
                </Button>
            </CardContent>
         </Card>
       </div>
    </div>
  );
}

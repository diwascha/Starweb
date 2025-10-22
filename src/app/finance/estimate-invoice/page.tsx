
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function EstimateInvoicePage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Estimate Invoice Generator</h1>
        <p className="text-muted-foreground">This feature is under construction. You will soon be able to create and print estimate invoices.</p>
      </header>
       <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
                <h3 className="text-2xl font-bold tracking-tight">Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                    The estimate invoice generator is being built.
                </p>
            </div>
        </div>
    </div>
  );
}

    
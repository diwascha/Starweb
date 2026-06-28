
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calculator, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { logError } from '@/services/log-service';

export default function FinanceError({ error, reset }: { error: Error, reset: () => void }) {
  useEffect(() => {
    logError(error, 'Finance Module');
  }, [error]);

  return (
    <div className="p-8">
        <Card className="border-red-200 bg-red-50/20 shadow-none">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                        <Calculator className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                        <CardTitle>Finance Logic Error</CardTitle>
                        <CardDescription>Calculator or Ledger rendering failed.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm">
                    Calculation modules are sensitive to data input errors. This failure has been logged and the technical team has been notified.
                </p>
                <div className="flex gap-2">
                    <Button onClick={() => reset()} variant="destructive">
                        Restart Module
                    </Button>
                    <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
                        Safe Exit
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

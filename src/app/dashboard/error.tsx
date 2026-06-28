
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { logError } from '@/services/log-service';

export default function DashboardError({ error, reset }: { error: Error, reset: () => void }) {
  useEffect(() => {
    logError(error, 'Dashboard Module');
  }, [error]);

  return (
    <div className="p-8">
        <Card className="border-dashed">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                    <CardTitle>Dashboard Failed to Load</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    There was an issue fetching your real-time analytics. This event has been logged for resolution. Your data remains safe.
                </p>
                <Button onClick={() => reset()} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" /> Reload Dashboard
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}

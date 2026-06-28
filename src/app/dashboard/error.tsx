'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function DashboardError({ reset }: { reset: () => void }) {
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
                    There was an issue fetching your real-time analytics. Your data is safe, but we couldn't display the summaries right now.
                </p>
                <Button onClick={() => reset()} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" /> Reload Dashboard
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}

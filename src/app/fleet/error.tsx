
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Truck, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { logError } from '@/services/log-service';

export default function FleetError({ error, reset }: { error: Error, reset: () => void }) {
  useEffect(() => {
    logError(error, 'Fleet Module');
  }, [error]);

  return (
    <div className="p-8">
        <Card className="border-blue-200 bg-blue-50/20">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Truck className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <CardTitle>Fleet Module Exception</CardTitle>
                        <CardDescription>A fault occurred while processing fleet records.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm">
                    We were unable to load the fleet data. This incident has been automatically recorded in the system logs for investigation.
                </p>
                <div className="flex gap-2">
                    <Button onClick={() => reset()}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Try Again
                    </Button>
                    <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
                        Go Home
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

'use client';
/**
 * @fileOverview Root error handler for Next.js route segments with improved resiliency.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { logError } from '@/services/log-service';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log critical failure to Firestore with safety checks
    if (error) {
        logError(error, 'Global App Segment', { digest: error?.digest });
    }
    if (process.env.NODE_ENV === 'development') {
        console.error('Critical Application Failure:', error);
    }
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/50 shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-destructive/10 rounded-full">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl font-black text-destructive tracking-tight">System Exception</CardTitle>
          <p className="text-muted-foreground text-sm">A client-side error caused this page to stop working.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted rounded text-[10px] font-mono overflow-auto max-h-32 border">
            {error?.name || 'Error'}: {error?.message || 'The application encountered an unexpected state.'}
            {error?.digest && <p className="mt-2 opacity-50">Log Reference: {error.digest}</p>}
          </div>
          <p className="text-xs text-center text-muted-foreground px-6">
            The crash has been reported. Fault isolation is active. Other parts of the system may still be operational.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 pt-2">
          <Button onClick={() => reset()} className="w-full h-11 font-bold">
            <RotateCcw className="mr-2 h-4 w-4" /> Recover Session
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'} className="w-full h-11">
            <Home className="mr-2 h-4 w-4" /> Go to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

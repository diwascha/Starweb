'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, AlertTriangle } from 'lucide-react';

export default function HrError({ reset }: { reset: () => void }) {
  return (
    <div className="p-8">
        <Card className="border-amber-200 bg-amber-50/20">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                        <Users className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                        <CardTitle>HRMS Render Error</CardTitle>
                        <CardDescription>Payroll or Attendance processing failed.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2 p-3 bg-white border border-amber-200 rounded text-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p>An unexpected error occurred in the personnel management module. You may try to reload the specific view.</p>
                </div>
                <Button onClick={() => reset()} variant="secondary">
                    Reload HR Module
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}

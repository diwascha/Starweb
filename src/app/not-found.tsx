'use client';
/**
 * @fileOverview Graceful 404 handler.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="flex h-[70vh] items-center justify-center p-4">
      <Card className="max-w-md w-full border-muted shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-muted rounded-full">
              <FileQuestion className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Page Not Found</CardTitle>
          <p className="text-muted-foreground">The resource you requested doesn't exist.</p>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm">
            It's possible the URL was typed incorrectly or the record was moved or deleted.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Safety
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

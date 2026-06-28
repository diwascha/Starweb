'use client';
/**
 * @fileOverview Global listener that catches Firebase errors and propagates them to React boundaries.
 */

import { useEffect, useState } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

export function FirebaseErrorListener() {
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    // Listen for Firestore permission errors emitted by service layer
    return errorEmitter.on('permission-error', (err) => {
      setError(err);
    });
  }, []);

  if (error) {
    // Re-throwing during render catches the error in the nearest ErrorBoundary or Next.js error handler.
    // In development, this triggers the Next.js error overlay with our rich context.
    throw error;
  }

  return null;
}

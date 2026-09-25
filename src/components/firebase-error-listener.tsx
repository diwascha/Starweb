'use client';
/**
 * @fileOverview Turns background Firestore failures into a visible message.
 *
 * Writes in this app are fire-and-forget (see lib/write-reporting.ts), so a
 * rejected write or listener arrives here after the screen has moved on.
 * This used to re-throw the error during render. The listener sits in the
 * root layout, above every error boundary, so one rejected write - a missing
 * permission, the daily quota, a dropped connection - replaced the whole app
 * with a blank "Application error" page. It now shows a toast and the page
 * stays usable.
 */

import { useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { toast } from '@/hooks/use-toast';

const REPEAT_WINDOW_MS = 8000;

const errorCode = (err: any): string =>
  err?.cause?.code || err?.code || (err instanceof FirestorePermissionError ? 'permission-denied' : '');

const describe = (err: any): { title: string; description: string } => {
  const code = errorCode(err);
  if (code === 'permission-denied' || err instanceof FirestorePermissionError) {
    return {
      title: 'Not allowed',
      description: 'Your account does not have permission for that action, so it was not saved. Ask an administrator if you need access.',
    };
  }
  if (code === 'resource-exhausted') {
    return {
      title: 'Daily database limit reached',
      description: 'Changes cannot be saved until the free daily limit resets. Anything you just changed may not have been saved.',
    };
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return {
      title: 'Connection problem',
      description: 'The database could not be reached. Check the connection and try again.',
    };
  }
  return {
    title: 'Could not save',
    description: err?.message ? String(err.message).slice(0, 200) : 'Something went wrong while saving. Please try again.',
  };
};

export function FirebaseErrorListener() {
  // One failing listener can fire repeatedly; show each distinct problem once
  // per window instead of stacking identical toasts.
  const lastShown = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return errorEmitter.on('permission-error', (err) => {
      console.error('Firestore operation failed:', err);
      const { title, description } = describe(err);
      const key = `${title}|${err?.context?.path || ''}`;
      const now = Date.now();
      if (now - (lastShown.current.get(key) || 0) < REPEAT_WINDOW_MS) return;
      lastShown.current.set(key, now);
      toast({ title, description, variant: 'destructive' });
    });
  }, []);

  return null;
}
